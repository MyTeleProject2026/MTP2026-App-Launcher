/* Dedicated MTP2026 OS native/runtime bridge.
 * Each frontend owns its OS shell. The retired generic shell and chooser are not loaded.
 */
import {
  nativeCapabilities,
  setNativeMode,
  nativeFullscreen,
  nativeOpenExternal,
  notifyNative,
} from './nativePlatformApi.js';

await Promise.all([
  import('./vexaStoreInstaller.js'),
  import('./mtp2026OsPackageRuntime.js'),
  import('./mtp2026GuestPackageRuntime.js'),
  import('./mtp2026GuestProfiles.js'),
  import('./mtp2026UniversalOS.js'),
]);

export function getNativeCapabilities() {
  return nativeCapabilities();
}

export async function applyDeviceMode(mode) {
  const normalized = mode === 'desktop' ? 'desktop' : mode || 'android';
  const result = await setNativeMode(normalized);
  window.dispatchEvent(new CustomEvent('mtp2026:device-mode', { detail: { mode: normalized } }));
  return result;
}

export async function boot(mode, options = {}) {
  const normalized = mode === 'desktop' ? 'desktop' : mode || 'android';
  try {
    const { bootGuest } = await import('./guestBootController.js');
    const result = await bootGuest(normalized, options);
    window.dispatchEvent(new CustomEvent('mtp2026:runtime-boot-result', { detail: result }));
    return result;
  } catch (error) {
    const message = String(error?.message || error || 'GUEST_BOOT_FAILED');
    return { id: normalized, phase: 'error', running: false, error: message, recoverable: false };
  }
}

export async function enterMTPFullscreen(element) {
  return nativeFullscreen(true, element);
}

export async function exitMTPFullscreen() {
  return nativeFullscreen(false);
}

export async function openExternal(url) {
  return nativeOpenExternal(url);
}

export async function notify(title, body) {
  return notifyNative(title, body);
}

window.MTP2026Runtime = Object.freeze({
  getNativeCapabilities,
  applyDeviceMode,
  boot,
  enterMTPFullscreen,
  exitMTPFullscreen,
  openExternal,
  notify,
});
