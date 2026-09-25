/* MTP2026 guest boot coordinator. */
import { getGuestSystem, normalizeGuestSystem } from './guestSystemRegistry.js';
import { getGuestImageContract } from './guestRuntimeManifest.js';
import { loadGuestMetadata, saveGuestMetadata } from './guestStorage.js';
import { bootArm64Guest, stopArm64Guest, installGuestImage } from './arm64GuestRuntime.js';
import { qemuWasmCapabilities } from './qemuWasmGuestRuntime.js';

const listeners = new Set();
let state = Object.freeze({ id: null, phase: 'idle', running: false, provider: 'none', error: null });

function publish(next) {
  state = Object.freeze({ ...state, ...next });
  for (const listener of listeners) {
    try { listener(state); } catch (_) {}
  }
  window.dispatchEvent(new CustomEvent('mtp2026:guest-state', { detail: state }));
  return state;
}

export function getGuestState() { return state; }
export function subscribeGuestState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function nativeProvider() { return window.MTP2026NativeGuestRuntime || null; }
function resolveImageOption(options, metadata) {
  return options.image || metadata?.imageBytes || metadata?.image || null;
}

export async function bootGuest(mode, options = {}) {
  const id = normalizeGuestSystem(mode);
  const system = getGuestSystem(id);
  const controlKernel = options.controlKernel === true;
  const token = `${id}:${Date.now()}`;
  const native = nativeProvider();
  const qemuAvailable = qemuWasmCapabilities().available;

  publish({
    id,
    phase: 'splash',
    running: false,
    provider: native?.bootGuest ? 'native-vm' : qemuAvailable ? 'qemu-wasm' : 'web-os-shell',
    error: null,
    token,
    guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os',
    recoverable: false,
    requiresGuestImage: false
  });

  try {
    const metadata = await loadGuestMetadata(id).catch(() => null);
    const contract = await getGuestImageContract(id);
    const suppliedImage = resolveImageOption(options, metadata);
    const storedImage = metadata?.status === 'installed' && metadata?.image;
    const hasGuestImage = Boolean(suppliedImage || storedImage);

    // Browser launches must never fail merely because a native ARM64 image is
    // not installed. QEMU-WASM is used only when an actual verified image is
    // available; otherwise the MTP2026 browser shell is the intentional web
    // runtime and presents the same MTP2026-owned OS experience.
    const useBrowserShell = !controlKernel && !native?.bootGuest && !hasGuestImage;

    if (useBrowserShell) {
      await saveGuestMetadata(id, {
        ...(metadata || {}),
        provider: 'web-os-shell',
        architecture: system.architecture,
        guestKind: 'mtp2026-owned-guest-os',
        bootProtocol: contract.bootProtocol,
        status: 'ready',
        installError: null,
        runningAt: new Date().toISOString()
      });
      publish({
        id,
        phase: 'browser-shell',
        running: true,
        provider: 'web-os-shell',
        error: null,
        token,
        contract,
        guestKind: 'mtp2026-owned-guest-os',
        progress: 100,
        requiresGuestImage: false,
        recoverable: false
      });
      window.dispatchEvent(new CustomEvent('mtp2026:default-system-os', {
        detail: { mode: id, browserShell: true }
      }));
      return getGuestState();
    }

    publish({ phase: 'prepare', metadata, contract, controlKernel, recoverable: false });
    publish({ phase: 'booting', progress: 35, recoverable: false });

    const result = await bootArm64Guest({
      id,
      image: suppliedImage,
      storage: options.storage || metadata?.storage || null,
      controlKernel,
      guestContract: contract
    });

    const provider = result?.provider || (native?.bootGuest ? 'native-vm' : 'qemu-wasm');
    await saveGuestMetadata(id, {
      ...(metadata || {}),
      image: result?.image || metadata?.image || null,
      provider,
      architecture: system.architecture,
      guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os',
      bootProtocol: contract.bootProtocol,
      status: 'ready',
      installError: null,
      runningAt: new Date().toISOString()
    });

    publish({
      phase: 'ready',
      running: true,
      provider,
      result,
      contract,
      guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os',
      error: null,
      recoverable: false,
      progress: 100
    });
    return getGuestState();
  } catch (error) {
    const message = String(error?.message || error || 'GUEST_BOOT_FAILED');
    // A browser must never freeze on a stale/missing native guest image.
    // If QEMU-WASM cannot resolve an installed image, fall back immediately
    // to the MTP2026-owned browser OS shell instead of exposing a recovery
    // screen or leaving the startup surface paused.
    if (!controlKernel && !native?.bootGuest && message === 'GUEST_RUNTIME_IMAGE_REQUIRED') {
      await saveGuestMetadata(id, {
        ...(await loadGuestMetadata(id).catch(() => null) || {}),
        provider: 'web-os-shell',
        architecture: system.architecture,
        guestKind: 'mtp2026-owned-guest-os',
        status: 'ready',
        installError: null,
        runningAt: new Date().toISOString()
      });
      publish({
        id,
        phase: 'browser-shell',
        running: true,
        provider: 'web-os-shell',
        error: null,
        token,
        contract,
        guestKind: 'mtp2026-owned-guest-os',
        progress: 100,
        requiresGuestImage: false,
        recoverable: false
      });
      window.dispatchEvent(new CustomEvent('mtp2026:default-system-os', {
        detail: { mode: id, browserShell: true }
      }));
      return getGuestState();
    }
    publish({ phase: 'error', running: false, error: message, recoverable: false, progress: 0 });
    return getGuestState();
  }
}

export async function stopGuest() {
  const id = state.id;
  const native = nativeProvider();
  try {
    if (native?.stopGuest) await native.stopGuest(id);
    else if (id) await stopArm64Guest(id);
  } finally {
    publish({ phase: 'stopped', running: false, error: null, recoverable: false });
  }
}

window.MTP2026GuestBoot = Object.freeze({
  bootGuest,
  stopGuest,
  installGuestImage,
  getGuestState,
  subscribeGuestState
});
