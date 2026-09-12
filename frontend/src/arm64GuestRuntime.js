/* MTP2026 ARM64 guest execution provider.
 * Native APK/desktop hosts may provide a native VM/emulator through
 * window.MTP2026NativeGuestRuntime. Web/PWA uses Unicorn.js AArch64 in a
 * dedicated Worker for the bundled MTP2026 control kernel only.
 *
 * A real Android/iOS/Windows/Gaming image must never be passed directly to
 * the browser Unicorn worker as though it were the MTP2026 control kernel.
 * Real OS images require a provider that understands their actual boot format.
 */

import { loadGuestImage, saveGuestImage } from './guestImageStore.js';

const workers = new Map();
const DEFAULT_ENTRY = 0x00400000;
const DEFAULT_KERNEL_URL = '/arm64/mtp2026-arm64-kernel.bin';

function nativeRuntime() {
  return window.MTP2026NativeGuestRuntime || null;
}

function isBrowserRuntimeAvailable() {
  return typeof Worker !== 'undefined' && typeof URL !== 'undefined' && typeof Blob !== 'undefined';
}

function normalizeBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Blob) return value.arrayBuffer().then(buffer => new Uint8Array(buffer));
  return null;
}

async function fetchDefaultKernel() {
  const response = await fetch(DEFAULT_KERNEL_URL, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`ARM64_KERNEL_FETCH_${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error('ARM64_KERNEL_EMPTY');
  if (bytes.byteLength < 64) throw new Error('ARM64_KERNEL_TOO_SMALL');
  return { bytes, source: 'bundled-arm64-control-kernel' };
}

async function resolveImage(id, supplied) {
  const direct = await normalizeBytes(supplied);
  if (direct?.byteLength) return { bytes: direct, source: 'supplied' };

  const stored = await loadGuestImage(id).catch(() => null);
  if (stored?.bytes?.byteLength) return { bytes: stored.bytes, source: 'persistent-storage', metadata: stored.metadata };

  return fetchDefaultKernel();
}

function createWorker(id) {
  const worker = new Worker(new URL('./arm64GuestWorker.js', import.meta.url), {
    type: 'module',
    name: `mtp2026-arm64-${id}`,
  });
  workers.set(id, worker);
  return worker;
}

function waitForBoot(worker, id) {
  return new Promise((resolve, reject) => {
    const onMessage = event => {
      const data = event.data || {};
      if (data.type === 'booted') {
        worker.removeEventListener('message', onMessage);
        worker.addEventListener('message', event => {
          if (event.data?.type === 'error') {
            window.dispatchEvent(new CustomEvent('mtp2026:guest-runtime-error', { detail: { id, ...event.data } }));
          }
          if (event.data?.type === 'tick') {
            window.dispatchEvent(new CustomEvent('mtp2026:guest-runtime-tick', { detail: { id, ...event.data } }));
          }
        });
        resolve(data);
      } else if (data.type === 'error') {
        worker.removeEventListener('message', onMessage);
        reject(new Error(data.message || 'ARM64_RUNTIME_BOOT_FAILED'));
      }
    };
    worker.addEventListener('message', onMessage);
  });
}

export async function installGuestImage(id, image, metadata = {}) {
  const bytes = await normalizeBytes(image);
  if (!bytes?.byteLength) throw new Error('GUEST_IMAGE_BYTES_REQUIRED');
  await saveGuestImage(id, bytes, {
    ...metadata,
    architecture: 'arm64',
    entry: metadata.entry || DEFAULT_ENTRY,
  });
  return { id, architecture: 'arm64', byteLength: bytes.byteLength, stored: true };
}

export async function bootArm64Guest({ id, image, storage, controlKernel = false, guestContract = null } = {}) {
  const native = nativeRuntime();

  // A real OS image is not an MTP2026 kernel image. The browser Unicorn
  // provider only understands the bundled control kernel, so real OS guests
  // must be handed to a native VM/emulator provider.
  if (!controlKernel && guestContract?.imageKind === 'real-os-image' && !native?.bootGuest) {
    throw new Error(`REAL_GUEST_NATIVE_PROVIDER_REQUIRED_${id}`);
  }

  if (native?.bootGuest) {
    const result = await native.bootGuest({
      id,
      architecture: 'arm64',
      class: guestContract?.class || null,
      image,
      storage,
      guestContract,
      controlKernel,
    });
    return { ...result, provider: result?.provider || 'native-vm' };
  }

  if (!isBrowserRuntimeAvailable()) throw new Error('ARM64_WEB_RUNTIME_UNAVAILABLE');

  const resolved = controlKernel ? await fetchDefaultKernel() : await resolveImage(id, image);
  const previous = workers.get(id);
  if (previous) {
    try { previous.postMessage({ type: 'stop' }); } catch (_) {}
    previous.terminate();
    workers.delete(id);
  }

  const worker = createWorker(id);
  const bootPromise = waitForBoot(worker, id);
  const byteLength = resolved.bytes.byteLength;
  const transferable = resolved.bytes.buffer;
  worker.postMessage({ type: 'start', bytes: transferable }, [transferable]);
  const result = await bootPromise;

  return {
    ...result,
    id,
    image: { source: resolved.source, byteLength },
    storage: storage || null,
  };
}

export async function stopArm64Guest(id) {
  const native = nativeRuntime();
  if (native?.stopGuest) await native.stopGuest(id);
  const worker = workers.get(id);
  if (worker) {
    try { worker.postMessage({ type: 'stop' }); } catch (_) {}
    worker.terminate();
    workers.delete(id);
  }
}

export function arm64RuntimeCapabilities() {
  const native = nativeRuntime();
  return {
    native: Boolean(native?.bootGuest),
    webWorker: isBrowserRuntimeAvailable(),
    cpu: 'aarch64',
    bundledKernel: DEFAULT_KERNEL_URL,
    backend: native?.bootGuest ? 'native-vm-or-emulator' : 'unicorn-js-wasm-control-kernel',
    realGuestExecution: Boolean(native?.bootGuest),
  };
}

window.MTP2026Arm64GuestRuntime = Object.freeze({
  installGuestImage,
  bootArm64Guest,
  stopArm64Guest,
  arm64RuntimeCapabilities,
});
