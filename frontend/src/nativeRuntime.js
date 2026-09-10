/* MTP2026 native runtime compatibility layer.
 * The unified implementation lives in nativePlatformApi.js. This module keeps
 * the existing MTP2026Runtime global/API stable without issuing duplicate
 * native-mode commands when launcherPlatform changes device mode. */

import {
  nativeCapabilities,
  setNativeMode,
  nativeFullscreen,
  nativeOpenExternal,
  notifyNative,
} from './nativePlatformApi.js';

export function getNativeCapabilities() {
  return nativeCapabilities();
}

export async function applyDeviceMode(mode) {
  const normalized = mode === 'windows11' ? 'windows' : mode || 'android';
  const result = await setNativeMode(normalized);
  window.dispatchEvent(new CustomEvent('mtp2026:device-mode', { detail: { mode: normalized } }));
  return result;
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
  enterMTPFullscreen,
  exitMTPFullscreen,
  openExternal,
  notify,
};
