/* Optional browser QEMU/AArch64 system-runtime adapter.
 *
 * MTP2026 deliberately does not ship a fake "QEMU" implementation. A build
 * may provide a real qemu-system-aarch64 WebAssembly module through
 * window.MTP2026QemuWasmRuntime. This adapter validates the provider contract
 * and keeps the launcher independent of the particular QEMU-WASM build.
 */

function provider() {
  return globalThis.MTP2026QemuWasmRuntime || null;
}

export function qemuWasmCapabilities() {
  const p = provider();
  return Object.freeze({
    available: Boolean(p?.boot),
    engine: p?.engine || 'qemu-system-aarch64-wasm',
    architecture: 'arm64',
    machine: 'virt',
    requiresRealGuestImage: true,
  });
}

export async function bootQemuWasmGuest({ id, image, storage, contract }) {
  const p = provider();
  if (!p?.boot) throw new Error('QEMU_WASM_PROVIDER_NOT_INSTALLED');
  if (!image) throw new Error('QEMU_WASM_GUEST_IMAGE_REQUIRED');
  if (typeof p.boot !== 'function') throw new Error('QEMU_WASM_PROVIDER_INVALID');

  const result = await p.boot({
    id,
    architecture: 'arm64',
    machine: contract?.machine || 'qemu-aarch64-virt',
    image,
    storage,
    boot: {
      kernel: contract?.kernelName || null,
      initrd: contract?.initrdName || null,
      append: contract?.bootArgs || ['console=ttyAMA0', 'rdinit=/init'],
    },
  });

  if (!result || result.ready !== true) {
    throw new Error('QEMU_WASM_GUEST_BOOT_NOT_CONFIRMED');
  }

  return { ...result, provider: result.provider || 'qemu-system-aarch64-wasm' };
}

export async function stopQemuWasmGuest(id) {
  const p = provider();
  if (p?.stop) return p.stop(id);
  return null;
}

window.MTP2026QemuWasmGuestRuntime = Object.freeze({
  qemuWasmCapabilities,
  bootQemuWasmGuest,
  stopQemuWasmGuest,
});
