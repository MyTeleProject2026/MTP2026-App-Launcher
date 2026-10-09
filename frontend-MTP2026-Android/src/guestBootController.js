/* MTP2026 guest boot coordinator.
 * This module is invoked only by an explicit user Start action. A browser
 * shell is never reported as a running guest OS.
 */
import { getGuestSystem, normalizeGuestSystem } from './guestSystemRegistry.js';
import { getGuestImageContract } from './guestRuntimeManifest.js';
import { loadGuestMetadata, saveGuestMetadata } from './guestStorage.js';
import { bootArm64Guest, stopArm64Guest, installGuestImage } from './arm64GuestRuntime.js';
import { qemuWasmCapabilities } from './qemuWasmGuestRuntime.js';

const listeners = new Set();
let state = Object.freeze({ id: null, phase: 'idle', running: false, provider: 'none', error: null, progress: 0 });

function publish(next) {
  state = Object.freeze({ ...state, ...next });
  for (const listener of listeners) { try { listener(state); } catch (_) {} }
  window.dispatchEvent(new CustomEvent('mtp2026:guest-state', { detail: state }));
  return state;
}
export function getGuestState() { return state; }
export function subscribeGuestState(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function nativeProvider() { return window.MTP2026NativeGuestRuntime || null; }
function resolveImageOption(options, metadata) { return options.image || metadata?.imageBytes || metadata?.image || null; }

export async function bootGuest(mode, options = {}) {
  const id = normalizeGuestSystem(mode);
  const system = getGuestSystem(id);
  const controlKernel = options.controlKernel === true;
  const token = crypto.randomUUID?.() || `${id}:${Date.now()}`;
  const native = nativeProvider();
  const qemuAvailable = qemuWasmCapabilities().available;
  publish({ id, phase: 'preparing', running: false, provider: 'none', error: null, token,
    guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os',
    progress: 0, requiresGuestImage: !controlKernel, recoverable: true });

  try {
    const metadata = await loadGuestMetadata(id).catch(() => null);
    const contract = await getGuestImageContract(id);
    const suppliedImage = resolveImageOption(options, metadata);
    const installedImage = metadata?.status === 'installed' ? metadata?.image : null;
    const image = suppliedImage || installedImage || null;

    if (!native?.bootGuest && !qemuAvailable) {
      throw new Error('REAL_GUEST_RUNTIME_NOT_CONFIGURED');
    }
    if (!controlKernel && !image) {
      throw new Error('REAL_GUEST_IMAGE_NOT_INSTALLED');
    }

    publish({ phase: 'booting', provider: native?.bootGuest ? 'native-vm' : 'qemu-wasm', progress: 10, contract });
    const result = await bootArm64Guest({
      id, image, storage: options.storage || metadata?.storage || null, controlKernel, guestContract: contract
    });
    if (result?.realGuest !== true || result?.browserShell === true) {
      throw new Error(result?.reason || 'REAL_GUEST_EXECUTION_NOT_CONFIRMED');
    }
    if (result?.ready === false || result?.running === false) {
      throw new Error('REAL_GUEST_BOOT_NOT_CONFIRMED');
    }

    const provider = result.provider || (native?.bootGuest ? 'native-vm' : 'qemu-wasm');
    await saveGuestMetadata(id, {
      ...(metadata || {}), image: result.image || metadata?.image || null, provider,
      architecture: system.architecture, guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os',
      bootProtocol: contract.bootProtocol, status: 'running', installError: null, runningAt: new Date().toISOString()
    });
    return publish({ phase: 'running', running: true, provider, result, contract,
      guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os',
      error: null, recoverable: true, progress: 100, requiresGuestImage: false });
  } catch (error) {
    const message = String(error?.message || error || 'GUEST_BOOT_FAILED');
    return publish({ phase: 'error', running: false, provider: 'none', error: message, progress: 0,
      recoverable: true, requiresGuestImage: !controlKernel, recoverableActions: ['install-image', 'retry'] });
  }
}

export { installGuestImage } from './arm64GuestRuntime.js';
export async function stopGuest() {
  const id = state.id;
  try {
    if (id) await stopArm64Guest(id);
    const metadata = id ? await loadGuestMetadata(id).catch(() => null) : null;
    if (id && metadata) await saveGuestMetadata(id, { ...metadata, status: 'stopped', runningAt: null });
  } finally {
    publish({ phase: 'stopped', running: false, provider: 'none', progress: 0, error: null,
      recoverable: true, requiresGuestImage: false });
  }
}
window.MTP2026GuestBoot = Object.freeze({ bootGuest, stopGuest, installGuestImage, getGuestState, subscribeGuestState });
