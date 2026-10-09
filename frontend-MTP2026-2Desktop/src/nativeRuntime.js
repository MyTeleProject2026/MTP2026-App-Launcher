/* Dedicated MTP2026 Desktop OS native/runtime adapter.
 * Do not import the retired shared multi-OS shell or its profile switchers here.
 * The Desktop shell and its own app/runtime modules are mounted by main.jsx.
 */
import {
  nativeCapabilities,
  setNativeMode,
  nativeFullscreen,
  nativeOpenExternal,
  notifyNative,
} from './nativePlatformApi.js';

function assertDesktopMode(mode) {
  const value = String(mode || 'desktop').trim().toLowerCase();
  if (!['desktop', 'windows', 'windows11', 'win11'].includes(value)) {
    throw new Error('This package runs MTP2026 Desktop OS only.');
  }
  return 'desktop';
}

export function getNativeCapabilities() {
  return nativeCapabilities();
}

export async function applyDeviceMode(mode = 'desktop') {
  const normalized = assertDesktopMode(mode);
  const result = await setNativeMode(normalized);
  window.dispatchEvent(new CustomEvent('mtp2026:device-mode', { detail: { mode: normalized } }));
  return result;
}

export async function boot(mode = 'desktop', options = {}) {
  const normalized = assertDesktopMode(mode);
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
