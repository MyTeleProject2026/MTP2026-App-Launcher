/* MTP2026 native/runtime compatibility layer.
 * This keeps the existing MTP2026Runtime API stable while connecting the
 * startup orchestrator to the real guest boot controller.
 * Native APK and Web/PWA implementations remain separate underneath.
 */

import {
  nativeCapabilities,
  setNativeMode,
  nativeFullscreen,
  nativeOpenExternal,
  notifyNative,
} from './nativePlatformApi.js';

import './guestSystemSwitcher.js';
import './mtp2026Branding.js';
import './vexaStoreInstaller.js';
import './mtp2026VexaStoreUI.js';
import './mtp2026VexaStoreRuntime.js';
import './mtp2026OsPackageRuntime.js';
import './mtp2026GuestPackageRuntime.js';
import './mtp2026GuestProfiles.js';
import './mtp2026GuestShell.js';
import './mtp2026GuestShell.css';
import './mtp2026GuestShellEnhancements.js';
import './mtp2026UniversalOS.js';
import './mtp2026UniversalOS.css';
import './mtp2026VexaAccountSSO.js';
import './mtp2026SystemApps.js';
import './mtp2026GuestOSRuntime.js';
import './mtp2026GuestOSRuntimeFixes.css';
import './mtp2026GuestOSBridge.js';

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

window.MTP2026Runtime = {
  getNativeCapabilities,
  applyDeviceMode,
  boot,
  enterMTPFullscreen,
  exitMTPFullscreen,
  openExternal,
  notify,
};
