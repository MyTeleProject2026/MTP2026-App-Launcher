/* MTP2026 ARM64 guest execution provider.
 *
 * A browser guest is considered real only when a native QEMU AArch64 provider
 * or a verified QEMU-WASM system emulator is present. Unicorn/CPU-only worker
 * execution is intentionally not used as a Linux/Android/Desktop/Gaming guest.
 */

import { loadGuestImage, saveGuestImage } from './guestImageStore.js';
import { bootQemuWasmGuest, stopQemuWasmGuest, qemuWasmCapabilities } from './qemuWasmGuestRuntime.js';

const DEFAULT_KERNEL_URL = '/arm64/mtp2026-arm64-kernel.bin';

function nativeRuntime() {
  return window.MTP2026NativeGuestRuntime || null;
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
  return { bytes, source: 'bundled-arm64-control-kernel' };
}

async function resolveImage(id, supplied) {
  const direct = await normalizeBytes(supplied);
  if (direct?.byteLength) return { bytes: direct, source: 'supplied' };
  const stored = await loadGuestImage(id).catch(() => null);
  if (stored?.bytes?.byteLength) return { bytes: stored.bytes, source: 'persistent-storage', metadata: stored.metadata };
  throw new Error('GUEST_RUNTIME_IMAGE_REQUIRED');
}

export async function installGuestImage(id, image, metadata = {}) {
  const bytes = await normalizeBytes(image);
  if (!bytes?.byteLength) throw new Error('GUEST_IMAGE_BYTES_REQUIRED');
  await saveGuestImage(id, bytes, { ...metadata, architecture: 'arm64' });
  return { id, architecture: 'arm64', byteLength: bytes.byteLength, stored: true };
}

export async function bootArm64Guest({ id, image, storage, controlKernel = false, guestContract = null } = {}) {
  const native = nativeRuntime();

  if (native?.bootGuest) {
    const result = await native.bootGuest({
      id,
      architecture: 'arm64',
      class: guestContract?.class || null,
      image,
      storage,
      guestContract,
      controlKernel
    });
    return { ...result, provider: result?.provider || 'native-qemu-system-aarch64', realGuest: true };
  }

  if (!controlKernel && qemuWasmCapabilities().available) {
    const resolved = await resolveImage(id, image);
    const result = await bootQemuWasmGuest({
      id,
      image: resolved.bytes,
      storage,
      contract: guestContract
    });
    return { ...result, provider: result?.provider || 'qemu-system-aarch64-wasm', realGuest: true };
  }

  // The browser/PWA cannot truthfully claim to have booted an ARM64 Linux
  // guest without a full machine emulator. Keep the launcher usable, but make
  // the runtime state explicit instead of invoking Unicorn.js or a fake VM.
  return {
    id,
    provider: 'browser-launcher',
    realGuest: false,
    browserShell: true,
    imageRequired: !controlKernel,
    guestKind: controlKernel ? 'mtp2026-control-kernel' : 'mtp2026-owned-guest-os',
    storage: storage || null,
    reason: qemuWasmCapabilities().available ? 'QEMU_WASM_BOOT_NOT_SELECTED' : 'REAL_QEMU_RUNTIME_NOT_AVAILABLE'
  };
}

export async function stopArm64Guest(id) {
  const native = nativeRuntime();
  if (native?.stopGuest) return native.stopGuest(id);
  if (qemuWasmCapabilities().available) return stopQemuWasmGuest(id);
  return null;
}

export function arm64RuntimeCapabilities() {
  const native = nativeRuntime();
  const qemu = qemuWasmCapabilities();
  return {
    native: Boolean(native?.bootGuest),
    qemuWasm: qemu,
    cpu: 'aarch64',
    bundledKernel: DEFAULT_KERNEL_URL,
    realGuestExecution: Boolean(native?.bootGuest || qemu.available),
    forbiddenCpuOnlyGuestPath: true
  };
}

window.MTP2026Arm64GuestRuntime = Object.freeze({
  installGuestImage,
  bootArm64Guest,
  stopArm64Guest,
  arm64RuntimeCapabilities
});
