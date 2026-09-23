/* MTP2026 ARM64 guest execution provider.
 * Native hosts may provide a real VM/emulator through
 * window.MTP2026NativeGuestRuntime. The deployed web product uses the
 * MTP2026-owned Web-OS shell for its four guest personalities; it never
 * pretends that Unicorn/JavaScript has booted a full Linux/Android/Windows
 * kernel. A native VM provider can replace the shell with the real ARM64 image.
 */

import { loadGuestImage, saveGuestImage } from './guestImageStore.js';
import { bootQemuWasmGuest, stopQemuWasmGuest, qemuWasmCapabilities } from './qemuWasmGuestRuntime.js';

const workers = new Map();
const DEFAULT_ENTRY = 0x00400000;
const DEFAULT_KERNEL_URL = '/arm64/mtp2026-arm64-kernel.bin';

function nativeRuntime() { return window.MTP2026NativeGuestRuntime || null; }
function isBrowserRuntimeAvailable() { return typeof Worker !== 'undefined' && typeof URL !== 'undefined' && typeof Blob !== 'undefined'; }
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
  throw new Error(`REAL_GUEST_IMAGE_NOT_INSTALLED_${id}`);
}

function createWorker(id) {
  const worker = new Worker(new URL('./arm64GuestWorker.js', import.meta.url), { type: 'module', name: `mtp2026-arm64-${id}` });
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
          if (event.data?.type === 'error') window.dispatchEvent(new CustomEvent('mtp2026:guest-runtime-error', { detail: { id, ...event.data } }));
          if (event.data?.type === 'tick') window.dispatchEvent(new CustomEvent('mtp2026:guest-runtime-tick', { detail: { id, ...event.data } }));
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
  await saveGuestImage(id, bytes, { ...metadata, architecture: 'arm64', entry: metadata.entry || DEFAULT_ENTRY });
  return { id, architecture: 'arm64', byteLength: bytes.byteLength, stored: true };
}

export async function bootArm64Guest({ id, image, storage, controlKernel = false, guestContract = null } = {}) {
  const native = nativeRuntime();
  const imageKind = String(guestContract?.imageKind || '');
  const mtpOwnedProfile = imageKind === 'mtp2026-owned-arm64-linux-profile' || imageKind === 'mtp2026-owned-arm64-linux';

  // A browser can render the launcher/control experience, but it cannot
  // claim that a complete ARM64 guest kernel has booted. Real guest execution
  // requires a native provider capable of launching the verified bundle.
  if (!controlKernel && !native?.bootGuest && !qemuWasmCapabilities().available) {
    throw new Error(`REAL_GUEST_RUNTIME_PROVIDER_REQUIRED_${id}`);
  }

  if (native?.bootGuest) {
    const result = await native.bootGuest({ id, architecture: 'arm64', class: guestContract?.class || null, image, storage, guestContract, controlKernel });
    return { ...result, provider: result?.provider || 'native-vm' };
  }

  if (!controlKernel && qemuWasmCapabilities().available) {
    const resolved = await resolveImage(id, image);
    return bootQemuWasmGuest({ id, image: resolved.bytes, storage, contract: guestContract });
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
  return { ...result, id, image: { source: resolved.source, byteLength }, storage: storage || null };
}

export async function stopArm64Guest(id) {
  const native = nativeRuntime();
  if (native?.stopGuest) await native.stopGuest(id);
  else if (qemuWasmCapabilities().available) await stopQemuWasmGuest(id);
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
    qemuWasm: qemuWasmCapabilities(),
    webWorker: isBrowserRuntimeAvailable(),
    cpu: 'aarch64',
    bundledKernel: DEFAULT_KERNEL_URL,
    backend: native?.bootGuest ? 'native-vm-or-emulator' : 'none-for-real-guests',
    realGuestExecution: Boolean(native?.bootGuest),
    webOsProfiles: false,
  };
}

window.MTP2026Arm64GuestRuntime = Object.freeze({ installGuestImage, bootArm64Guest, stopArm64Guest, arm64RuntimeCapabilities });
