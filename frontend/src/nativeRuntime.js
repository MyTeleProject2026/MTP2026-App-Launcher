/* MTP2026 native capability bridge.
 * The React/PWA build remains fully functional in a browser. Native shells can
 * expose the same contract through window.MTP2026Native. This module never
 * replaces VexaAccount authentication or application APIs.
 */

const DEFAULT_CAPABILITIES = Object.freeze({
  native: false,
  platform: 'web',
  orientationLock: false,
  fullscreen: true,
  filesystem: false,
  notifications: false,
  clipboard: !!navigator.clipboard,
  externalApps: false,
  gamepad: 'getGamepads' in navigator,
  windowControls: false,
});

export function getNativeCapabilities() {
  return { ...DEFAULT_CAPABILITIES, ...(window.MTP2026Native?.capabilities || {}) };
}

export async function applyDeviceMode(mode) {
  const normalized = mode === 'windows11' ? 'windows' : mode || 'android';
  const native = window.MTP2026Native;

  if (native?.setDeviceMode) {
    return native.setDeviceMode(normalized);
  }

  // Browser/PWA best-effort behavior. The OS itself remains in control.
  const orientation = normalized === 'windows' ? 'landscape' : normalized === 'android' || normalized === 'ios' ? 'portrait' : null;
  if (orientation && document.fullscreenElement && screen.orientation?.lock) {
    try { await screen.orientation.lock(orientation); } catch { /* browser/device may refuse */ }
  }
  return { native: false, platform: 'web', mode: normalized, orientation };
}

export async function enterMTPFullscreen(element) {
  if (window.MTP2026Native?.enterFullscreen) return window.MTP2026Native.enterFullscreen();
  if (element?.requestFullscreen) return element.requestFullscreen();
  return false;
}

export async function exitMTPFullscreen() {
  if (window.MTP2026Native?.exitFullscreen) return window.MTP2026Native.exitFullscreen();
  if (document.fullscreenElement && document.exitFullscreen) return document.exitFullscreen();
  return false;
}

export function openExternal(url) {
  if (window.MTP2026Native?.openExternal) return window.MTP2026Native.openExternal(url);
  window.open(url, '_blank', 'noopener,noreferrer');
}

window.addEventListener('mtp2026:device-mode', event => {
  applyDeviceMode(event.detail?.mode).catch(() => {});
});

window.MTP2026Runtime = { getNativeCapabilities, applyDeviceMode, enterMTPFullscreen, exitMTPFullscreen, openExternal };
