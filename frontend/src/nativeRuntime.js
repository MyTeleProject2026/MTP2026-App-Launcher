/* MTP2026 native runtime compatibility layer.
 * The unified implementation lives in nativePlatformApi.js. This module keeps
 * the existing MTP2026Runtime global/API stable without issuing duplicate
 * native-mode commands when launcherPlatform changes device mode. */

import {
  nativeCapabilities,
  setNativeMode,
  nativeFullscreen,
  nativeOpenExternal,
} from './nativePlatformApi.js';

export function getNativeCapabilities() {
  return nativeCapabilities();
}

export async function applyDeviceMode(mode) {
  const normalized = mode === 'windows11' ? 'windows' : mode || 'android';
  return setNativeMode(normalized);
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

window.MTP2026Runtime = {
  getNativeCapabilities,
  applyDeviceMode,
  enterMTPFullscreen,
  exitMTPFullscreen,
  openExternal,
};
