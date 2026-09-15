/* MTP2026 guest boot coordinator.
 *
 * The deployed web launcher uses the four MTP2026-owned guest personalities
 * as production Web-OS shells. Native VM/emulator hosts may additionally boot
 * the real ARM64 image. Proprietary/external media remains explicitly gated.
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
  for (const listener of listeners) { try { listener(state); } catch (_) {} }
  window.dispatchEvent(new CustomEvent('mtp2026:guest-state', { detail: state }));
  return state;
}

export function getGuestState() { return state; }
export function subscribeGuestState(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function nativeProvider() { return window.MTP2026NativeGuestRuntime || null; }
function resolveImageOption(options, metadata) { return options.image || metadata?.imageBytes || metadata?.image || null; }

async function isInstalledImage(id, metadata) {
  const stored = await inspectGuestImage(id).catch(() => null);
  const metadataSha = String(metadata?.sha256 || metadata?.image?.sha256 || '').toLowerCase();
  const storedSha = String(stored?.metadata?.sha256 || stored?.metadata?.imageSha256 || '').toLowerCase();
  return Boolean(metadata?.status === 'installed' && stored?.byteLength && (metadataSha || storedSha));
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
  publish({ id, phase: 'installed', running: false, error: null, guestKind: 'mtp2026-owned-guest-os' });
  window.dispatchEvent(new CustomEvent('mtp2026:guest-image-installed', { detail: { id, result } }));
  return result;
}

async function missingImageState(id, contract, reason = `GUEST_IMAGE_NOT_INSTALLED_${id}`) {
  const next = publish({ id, phase: 'needs-install', running: false, provider: nativeProvider()?.bootGuest ? 'native-vm' : 'native-required', guestKind: 'external-guest-os', error: reason, recoverable: true, requiresGuestImage: true, contract, progress: 0 });
  window.dispatchEvent(new CustomEvent('mtp2026:guest-image-required', { detail: { id, contract, code: reason, recoverable: true } }));
  return next;
}

export async function bootGuest(mode, options = {}) {
  const id = normalizeGuestSystem(mode);
  const system = getGuestSystem(id);
  const controlKernel = options.controlKernel === true;
  const token = `${id}:${Date.now()}`;
  const native = nativeProvider();

  publish({ id, phase: 'splash', running: false, provider: native?.bootGuest ? 'native-vm' : 'web-os-shell', error: null, token, guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os', recoverable: false, requiresGuestImage: false });

  try {
    const metadata = await loadGuestMetadata(id).catch(() => null);
    const contract = await getGuestImageContract(id);
    const ownProfile = contract.imageKind === 'mtp2026-owned-arm64-linux-profile' || contract.imageKind === 'mtp2026-owned-arm64-linux';
    const externalImage = contract.imageKind === 'real-os-image';

    // The deployed web product is a Web-OS. Its four MTP2026-owned profiles
    // are usable without pretending that a browser has booted a Linux kernel.
    // A native VM/emulator can replace the shell with the real ARM64 guest.
    if (!controlKernel && ownProfile && !native?.bootGuest) {
      publish({ phase: 'prepare', metadata, contract, controlKernel: false, provider: 'web-os-shell', guestKind: 'mtp2026-owned-guest-os', recoverable: false });
      const result = { success: true, provider: 'web-os-shell', id, architecture: 'arm64', execution: 'MTP2026-owned-web-os-profile' };
      await saveGuestMetadata(id, { ...(metadata || {}), provider: 'web-os-shell', architecture: 'arm64', guestKind: 'mtp2026-owned-guest-os', bootProtocol: contract.bootProtocol, status: 'ready', installError: null, runningAt: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('mtp2026:guest-shell-ready', { detail: { id, contract, result } }));
      publish({ phase: 'ready', running: true, provider: 'web-os-shell', result, contract, guestKind: 'mtp2026-owned-guest-os', error: null, recoverable: false, progress: 100 });
      return getGuestState();
    }

    if (!controlKernel && externalImage) {
      if (!native?.bootGuest && !(await isInstalledImage(id, metadata))) return missingImageState(id, contract, `REAL_GUEST_IMAGE_NOT_INSTALLED_${id}`);
      if (!native?.bootGuest) return missingImageState(id, contract, `REAL_GUEST_NATIVE_PROVIDER_REQUIRED_${id}`);
    }

    if (!controlKernel && !system.requiresImage) return missingImageState(id, contract, `GUEST_IMAGE_CONTRACT_MISSING_${id}`);
    if (!controlKernel && !ownProfile && !externalImage) return missingImageState(id, contract, `GUEST_IMAGE_CONTRACT_MISSING_${id}`);

    if (!controlKernel && ownProfile && native?.bootGuest && !(await isInstalledImage(id, metadata))) {
      return missingImageState(id, contract, `MTP2026_NATIVE_IMAGE_NOT_INSTALLED_${id}`);
    }

    publish({ phase: 'prepare', metadata, contract, controlKernel, recoverable: false });
    publish({ phase: 'booting', progress: 35, recoverable: false });

    const result = await bootArm64Guest({ id, image: resolveImageOption(options, metadata), storage: options.storage || metadata?.storage || null, controlKernel, guestContract: contract });
    const provider = result?.provider || (native?.bootGuest ? 'native-vm' : 'web-os-shell');

    await saveGuestMetadata(id, {
      ...(metadata || {}),
      image: result?.image || metadata?.image || null,
      provider,
      architecture: system.architecture,
      guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os',
      bootProtocol: contract.bootProtocol,
      status: 'ready',
      installError: null,
      runningAt: new Date().toISOString(),
    });

    publish({ phase: 'ready', running: true, provider, result, contract, guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os', error: null, recoverable: false, progress: 100 });
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
    if (native?.stopGuest) await native.stopGuest(id); else if (id) await stopArm64Guest(id);
  } finally { publish({ phase: 'stopped', running: false, error: null, recoverable: false }); }
}

window.MTP2026GuestBoot = Object.freeze({ bootGuest, stopGuest, installGuestImage, getGuestState, subscribeGuestState });
