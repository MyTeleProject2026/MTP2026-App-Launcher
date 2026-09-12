/* MTP2026 guest boot coordinator.
 *
 * The launcher has two distinct boot targets:
 *  1. controlKernel=true: the bundled MTP2026 ARM64 control guest used to
 *     validate the host/emulator pipeline.
 *  2. real guest mode: an independently installed ARM64 OS image is mandatory.
 *
 * This prevents the launcher from incorrectly reporting the same 5 KB control
 * kernel as Android, iOS, Windows 11, or Gaming OS.
 */

import { getGuestSystem, normalizeGuestSystem } from './guestSystemRegistry.js';
import { getGuestImageContract } from './guestRuntimeManifest.js';
import { loadGuestMetadata, saveGuestMetadata } from './guestStorage.js';
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
    image: { stored: true, byteLength: result.byteLength },
    architecture: 'arm64',
    sha256: metadata.sha256 || metadata.imageSha256 || null,
    status: 'installed',
  });
  return result;
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
  });

  try {
    const metadata = await loadGuestMetadata(id).catch(() => null);
    const contract = await getGuestImageContract(id);

    if (!controlKernel) {
      if (!system.requiresImage || contract.imageKind !== 'real-os-image') {
        throw new Error(`REAL_GUEST_IMAGE_CONTRACT_MISSING_${id}`);
      }
      if (metadata?.status !== 'installed' || !(metadata?.sha256 || metadata?.image?.sha256)) {
        throw new Error(`REAL_GUEST_IMAGE_NOT_INSTALLED_${id}`);
      }
    }

    publish({ phase: 'prepare', metadata, contract, controlKernel });
    publish({ phase: 'booting', progress: 35 });

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
      runningAt: new Date().toISOString(),
    });

    publish({ phase: 'ready', running: true, provider, result, contract, guestKind: controlKernel ? 'mtp2026-control-guest' : 'real-os-guest', error: null, progress: 100 });
    return getGuestState();
  } catch (error) {
    const message = String(error?.message || error || 'GUEST_BOOT_FAILED');
    publish({ phase: 'error', running: false, error: message, progress: 0 });
    throw error;
  }
}

export async function stopGuest() {
  const id = state.id;
  const native = nativeProvider();
  try {
    if (native?.stopGuest) await native.stopGuest(id);
    else if (id) await stopArm64Guest(id);
  } finally {
    publish({ phase: 'stopped', running: false });
  }
}

window.MTP2026GuestBoot = Object.freeze({ bootGuest, stopGuest, installGuestImage, getGuestState, subscribeGuestState });
