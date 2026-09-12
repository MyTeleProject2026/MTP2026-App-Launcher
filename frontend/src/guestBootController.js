/* MTP2026 guest boot coordinator.
 *
 * Real guest mode requires an independently installed ARM64 guest image.
 * The bundled MTP2026 kernel is only the control/runtime kernel and must
 * never be silently presented as Android, iOS, Windows 11 or Gaming OS.
 *
 * Missing guest images are handled as a recoverable state instead of an
 * uncaught boot exception. This is important for the launcher UI: selecting
 * iOS (or another uninstalled profile) must never leave the guest surface
 * with an input-blocking/frozen error screen.
 */

import { getGuestSystem, normalizeGuestSystem } from './guestSystemRegistry.js';
import { getGuestImageContract } from './guestRuntimeManifest.js';
import { loadGuestMetadata, saveGuestMetadata } from './guestStorage.js';
import { inspectGuestImage } from './guestImageStore.js';
import { bootArm64Guest, stopArm64Guest } from './arm64GuestRuntime.js';

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
export function subscribeGuestState(listener) { listeners.add(listener); return () => listeners.delete(listener); }

function nativeProvider() {
  return window.MTP2026NativeGuestRuntime || null;
}

function resolveImageOption(options, metadata) {
  return options.image || metadata?.imageBytes || metadata?.image || null;
}

export async function installGuestImage(mode, image, metadata = {}) {
  const id = normalizeGuestSystem(mode);
  const { installGuestImage: install } = await import('./arm64GuestRuntime.js');
  const result = await install(id, image, { ...metadata, guestId: id, architecture: 'arm64' });
  await saveGuestMetadata(id, {
    ...(await loadGuestMetadata(id).catch(() => null)),
    image: { stored: true, byteLength: result.byteLength, sha256: metadata.sha256 || metadata.imageSha256 || null },
    architecture: 'arm64',
    sha256: metadata.sha256 || metadata.imageSha256 || null,
    status: 'installed',
    installError: null,
  });
  publish({ id, phase: 'installed', running: false, error: null, guestKind: 'real-os-guest' });
  window.dispatchEvent(new CustomEvent('mtp2026:guest-image-installed', { detail: { id, result } }));
  return result;
}

async function missingImageState(id, contract, reason = `REAL_GUEST_IMAGE_NOT_INSTALLED_${id}`) {
  const message = reason;
  const next = publish({
    id,
    phase: 'needs-install',
    running: false,
    provider: nativeProvider()?.bootGuest ? 'native-vm' : 'arm64-wasm',
    guestKind: 'real-os-guest',
    error: message,
    recoverable: true,
    requiresGuestImage: true,
    contract,
    progress: 0,
  });
  window.dispatchEvent(new CustomEvent('mtp2026:guest-image-required', {
    detail: { id, contract, code: message, recoverable: true },
  }));
  return next;
}

export async function bootGuest(mode, options = {}) {
  const id = normalizeGuestSystem(mode);
  const system = getGuestSystem(id);
  const controlKernel = options.controlKernel === true;
  const token = `${id}:${Date.now()}`;
  const native = nativeProvider();

  publish({
    id,
    phase: 'splash',
    running: false,
    provider: native?.bootGuest ? 'native-vm' : 'arm64-wasm',
    error: null,
    token,
    guestKind: controlKernel ? 'mtp2026-control-guest' : 'real-os-guest',
    recoverable: false,
    requiresGuestImage: false,
  });

  try {
    const metadata = await loadGuestMetadata(id).catch(() => null);
    const contract = await getGuestImageContract(id);

    if (!controlKernel) {
      if (!system.requiresImage || contract.imageKind !== 'real-os-image') {
        return missingImageState(id, contract, `REAL_GUEST_IMAGE_CONTRACT_MISSING_${id}`);
      }

      const storedImage = await inspectGuestImage(id).catch(() => null);
      const metadataSha = String(metadata?.sha256 || metadata?.image?.sha256 || '').toLowerCase();
      const storedSha = String(storedImage?.metadata?.sha256 || storedImage?.metadata?.imageSha256 || '').toLowerCase();
      const hasInstalledImage = metadata?.status === 'installed' && Boolean(storedImage?.byteLength) && Boolean(metadataSha || storedSha);

      if (!hasInstalledImage) {
        return missingImageState(id, contract);
      }
    }

    publish({ phase: 'prepare', metadata, contract, controlKernel, recoverable: false });
    publish({ phase: 'booting', progress: 35, recoverable: false });

    const result = await bootArm64Guest({
      id,
      image: resolveImageOption(options, metadata),
      storage: options.storage || metadata?.storage || null,
      controlKernel,
      guestContract: contract,
    });

    const provider = result?.provider || 'arm64-wasm';
    await saveGuestMetadata(id, {
      ...metadata,
      image: result?.image || metadata?.image || null,
      provider,
      architecture: system.architecture,
      guestKind: controlKernel ? 'mtp2026-control-guest' : 'real-os-guest',
      bootProtocol: contract.bootProtocol,
      status: 'ready',
      installError: null,
      runningAt: new Date().toISOString(),
    });

    publish({ phase: 'ready', running: true, provider, result, contract, guestKind: controlKernel ? 'mtp2026-control-guest' : 'real-os-guest', error: null, recoverable: false, progress: 100 });
    return getGuestState();
  } catch (error) {
    const message = String(error?.message || error || 'GUEST_BOOT_FAILED');
    publish({ phase: 'error', running: false, error: message, recoverable: true, progress: 0 });
    window.dispatchEvent(new CustomEvent('mtp2026:guest-boot-error', { detail: { id, error: message, recoverable: true } }));
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

window.MTP2026GuestBoot = Object.freeze({ bootGuest, stopGuest, installGuestImage, getGuestState, subscribeGuestState });
