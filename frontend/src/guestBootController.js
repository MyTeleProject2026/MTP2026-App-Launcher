/* MTP2026 guest boot coordinator. */

import { getGuestSystem, normalizeGuestSystem } from './guestSystemRegistry.js';
import { getGuestImageContract, getGuestImageSource } from './guestRuntimeManifest.js';
import { loadGuestMetadata, saveGuestMetadata } from './guestStorage.js';
import { inspectGuestImage } from './guestImageStore.js';
import { bootArm64Guest, stopArm64Guest } from './arm64GuestRuntime.js';
import { qemuWasmCapabilities } from './qemuWasmGuestRuntime.js';

const listeners = new Set();
let state = Object.freeze({ id: null, phase: 'idle', running: false, provider: 'none', error: null });
function publish(next) { state = Object.freeze({ ...state, ...next }); for (const listener of listeners) { try { listener(state); } catch (_) {} } window.dispatchEvent(new CustomEvent('mtp2026:guest-state', { detail: state })); return state; }
export function getGuestState() { return state; }
export function subscribeGuestState(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function nativeProvider() { return window.MTP2026NativeGuestRuntime || null; }
function resolveImageOption(options, metadata) { return options.image || metadata?.imageBytes || metadata?.image || null; }
async function isInstalledImage(id, metadata) { const stored = await inspectGuestImage(id).catch(() => null); const metadataSha = String(metadata?.sha256 || metadata?.image?.sha256 || '').toLowerCase(); const storedSha = String(stored?.metadata?.sha256 || stored?.metadata?.imageSha256 || '').toLowerCase(); return Boolean(metadata?.status === 'installed' && stored?.byteLength && (metadataSha || storedSha)); }
async function missingImageState(id, contract, reason = `GUEST_IMAGE_NOT_INSTALLED_${id}`) { const next = publish({ id, phase: 'needs-install', running: false, provider: nativeProvider()?.bootGuest ? 'native-vm' : 'native-required', guestKind: 'external-guest-os', error: reason, recoverable: true, requiresGuestImage: true, contract, progress: 0 }); window.dispatchEvent(new CustomEvent('mtp2026:guest-image-required', { detail: { id, contract, code: reason, recoverable: true } })); return next; }

export async function installGuestImage(mode, image, metadata = {}) {
  const id = normalizeGuestSystem(mode);
  const { installGuestImage: install } = await import('./arm64GuestRuntime.js');
  const result = await install(id, image, { ...metadata, guestId: id, architecture: 'arm64' });
  await saveGuestMetadata(id, { ...(await loadGuestMetadata(id).catch(() => null)), image: { stored: true, byteLength: result.byteLength, sha256: metadata.sha256 || metadata.imageSha256 || null }, architecture: 'arm64', sha256: metadata.sha256 || metadata.imageSha256 || null, status: 'installed', installError: null });
  publish({ id, phase: 'installed', running: false, error: null, guestKind: 'mtp2026-owned-guest-os' });
  window.dispatchEvent(new CustomEvent('mtp2026:guest-image-installed', { detail: { id, result } }));
  return result;
}

export async function bootGuest(mode, options = {}) {
  const id = normalizeGuestSystem(mode);
  const system = getGuestSystem(id);
  const controlKernel = options.controlKernel === true;
  const token = `${id}:${Date.now()}`;
  const native = nativeProvider();
  publish({ id, phase: 'splash', running: false, provider: native?.bootGuest ? 'native-vm' : 'native-required', error: null, token, guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os', recoverable: false, requiresGuestImage: !controlKernel });

  try {
    const metadata = await loadGuestMetadata(id).catch(() => null);
    const contract = await getGuestImageContract(id);
    const source = await getGuestImageSource(id);
    const ownProfile = contract.imageKind === 'mtp2026-owned-arm64-linux-profile' || contract.imageKind === 'mtp2026-owned-arm64-linux';
    const externalImage = contract.imageKind === 'real-os-image';

    if (!controlKernel) {
      if (!source.configured || !source.url) {
        return missingImageState(id, contract, `GUEST_IMAGE_SOURCE_NOT_CONFIGURED_${id}`);
      }
      if (!native?.bootGuest && !qemuWasmCapabilities().available) {
        // A normal browser deployment has no native AArch64 VM provider. Do
        // not surface a misleading "image not installed" error in that mode.
        // The guest UI is intentionally provided by the MTP2026 browser shell;
        // real ARM64 execution is reserved for QEMU-WASM or the native host.
        publish({ id, phase: 'browser-shell', running: true, provider: 'web-os-shell', error: null, recoverable: false, requiresGuestImage: false, contract, guestKind: 'mtp2026-owned-guest-os', progress: 100 });
        window.dispatchEvent(new CustomEvent('mtp2026:default-system-os', { detail: { mode: id, browserShell: true } }));
        return getGuestState();
      }
    }

    // A native physical-test provider downloads and verifies the configured
    // release bundle itself. It therefore does not require a browser-stored
    // copy before the first physical boot.
    if (!controlKernel && ownProfile && native?.bootGuest) {
      if (!source.configured || !source.url) return missingImageState(id, contract, `GUEST_IMAGE_SOURCE_NOT_CONFIGURED_${id}`);
    } else if (!controlKernel && !system.requiresImage) {
      return missingImageState(id, contract, `GUEST_IMAGE_CONTRACT_MISSING_${id}`);
    }

    publish({ phase: 'prepare', metadata, contract, controlKernel, recoverable: false });
    publish({ phase: 'booting', progress: 35, recoverable: false });
    const result = await bootArm64Guest({ id, image: resolveImageOption(options, metadata), storage: options.storage || metadata?.storage || null, controlKernel, guestContract: contract });
    const provider = result?.provider || (native?.bootGuest ? 'native-vm' : 'web-os-shell');

    await saveGuestMetadata(id, { ...(metadata || {}), image: result?.image || metadata?.image || null, provider, architecture: system.architecture, guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os', bootProtocol: contract.bootProtocol, status: 'ready', installError: null, runningAt: new Date().toISOString() });
    publish({ phase: 'ready', running: true, provider, result, contract, guestKind: controlKernel ? 'mtp2026-control-guest' : 'mtp2026-owned-guest-os', error: null, recoverable: false, progress: 100 });
    return getGuestState();
  } catch (error) {
    const message = String(error?.message || error || 'GUEST_BOOT_FAILED');
    publish({ phase: 'error', running: false, error: message, recoverable: true, progress: 0 });
    window.dispatchEvent(new CustomEvent('mtp2026:guest-boot-error', { detail: { id, error: message, recoverable: true } }));
    return getGuestState();
  }
}

export async function stopGuest() { const id = state.id; const native = nativeProvider(); try { if (native?.stopGuest) await native.stopGuest(id); else if (id) await stopArm64Guest(id); } finally { publish({ phase: 'stopped', running: false, error: null, recoverable: false }); } }
window.MTP2026GuestBoot = Object.freeze({ bootGuest, stopGuest, installGuestImage, getGuestState, subscribeGuestState });
