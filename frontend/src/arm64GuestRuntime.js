/* MTP2026 real ARM64 guest execution provider.
 *
 * Provider order:
 * 1. Native APK/desktop bridge: window.MTP2026NativeGuestRuntime.
 * 2. Web/PWA: Unicorn.js AArch64 in a dedicated Web Worker.
 *
 * The web backend executes actual AArch64 instructions. It does not fabricate
 * a guest-ready state when no executable guest image is present.
 */

import { loadGuestImage, saveGuestImage } from './guestImageStore.js';

const workers = new Map();
const DEFAULT_ENTRY = 0x00400000;

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

async function resolveImage(id, supplied) {
  const direct = await normalizeBytes(supplied);
  if (direct?.byteLength) return { bytes: direct, source: 'supplied' };
  const stored = await loadGuestImage(id).catch(() => null);
  if (stored?.bytes?.byteLength) return { bytes: stored.bytes, source: 'persistent-storage', metadata: stored.metadata };
  return null;
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

export async function bootArm64Guest({ id, image, storage } = {}) {
  const native = nativeRuntime();
  if (native?.bootGuest) {
    const result = await native.bootGuest({ id, architecture: 'arm64', image, storage });
    return { ...result, provider: result?.provider || 'native-vm' };
  }

  if (!isBrowserRuntimeAvailable()) throw new Error('ARM64_WEB_RUNTIME_UNAVAILABLE');

  const resolved = await resolveImage(id, image);
  if (!resolved) throw new Error('ARM64_GUEST_IMAGE_REQUIRED');

  const previous = workers.get(id);
  if (previous) {
    try { previous.postMessage({ type: 'stop' }); } catch (_) {}
    previous.terminate();
    workers.delete(id);
  }

  const worker = createWorker(id);
  const bootPromise = waitForBoot(worker, id);
  worker.postMessage({ type: 'start', bytes: resolved.bytes }, [resolved.bytes.buffer]);
  const result = await bootPromise;
  return {
    ...result,
    id,
    image: { source: resolved.source, byteLength: resolved.bytes.byteLength },
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
  return {
    native: Boolean(nativeRuntime()?.bootGuest),
    webWorker: isBrowserRuntimeAvailable(),
    cpu: 'aarch64',
    backend: nativeRuntime()?.bootGuest ? 'native-vm-or-emulator' : 'unicorn-js-wasm',
  };
}

window.MTP2026Arm64GuestRuntime = Object.freeze({ installGuestImage, bootArm64Guest, stopArm64Guest, arm64RuntimeCapabilities });
