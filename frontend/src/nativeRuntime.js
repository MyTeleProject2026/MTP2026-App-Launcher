/* MTP2026 native/runtime compatibility layer.
 * This keeps the existing MTP2026Runtime API stable while connecting the
 * startup orchestrator to the real guest boot controller and recovery UI.
 * Native APK and Web/PWA implementations remain separate underneath.
 */

import {
  nativeCapabilities,
  setNativeMode,
  nativeFullscreen,
  nativeOpenExternal,
  notifyNative,
} from './nativePlatformApi.js';

// Load the recovery listener in every host so a missing guest image can never
// strand the user on a non-interactive error surface.
import './guestRecovery.js';
// Keep a live OS-switch control available on guest recovery/boot error surfaces.
import './guestSystemSwitcher.js';

export function getNativeCapabilities() {
  return nativeCapabilities();
}

export async function applyDeviceMode(mode) {
  const normalized = mode === 'windows11' ? 'windows' : mode || 'android';
  const result = await setNativeMode(normalized);
  window.dispatchEvent(new CustomEvent('mtp2026:device-mode', { detail: { mode: normalized } }));
  return result;
}

export async function boot(mode, options = {}) {
  const normalized = mode === 'windows11' ? 'windows' : mode || 'android';
  try {
    const { bootGuest } = await import('./guestBootController.js');
    const result = await bootGuest(normalized, options);
    window.dispatchEvent(new CustomEvent('mtp2026:runtime-boot-result', { detail: result }));
    return result;
  } catch (error) {
    const message = String(error?.message || error || 'GUEST_BOOT_FAILED');
    window.dispatchEvent(new CustomEvent('mtp2026:guest-boot-error', { detail: { id: normalized, error: message, recoverable: true } }));
    return { id: normalized, phase: 'error', running: false, error: message, recoverable: true };
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

window.MTP2026Runtime = {
  getNativeCapabilities,
  applyDeviceMode,
  boot,
  enterMTPFullscreen,
  exitMTPFullscreen,
  openExternal,
  notify,
};
