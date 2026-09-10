/* MTP2026 unified native platform capability API.
 * Keeps the existing React/VexaAccount session architecture intact and
 * exposes only capabilities supplied by the current native host. */

const hasTauri = () => Boolean(window.__TAURI_INTERNALS__);
const hasIOSBridge = () => Boolean(window.webkit?.messageHandlers?.mtp2026);
const cap = () => window.Capacitor || null;

let invokePromise;
async function invoke(command, args) {
  if (!hasTauri()) return null;
  invokePromise ||= import('@tauri-apps/api/core').then((m) => m.invoke);
  return (await invokePromise)(command, args);
}

export function nativeHost() {
  const capacitor = cap();
  if (hasTauri()) return 'windows';
  if (capacitor?.getPlatform) return capacitor.getPlatform();
  if (hasIOSBridge()) return 'ios';
  return 'web';
}

export function nativeCapabilities() {
  const host = nativeHost();
  const plugins = cap()?.Plugins || {};
  return Object.freeze({
    native: host !== 'web',
    host,
    orientation: host === 'windows' || host === 'android' || host === 'ios' || host === 'gaming',
    fullscreen: true,
    filesystem: Boolean(plugins.Filesystem) || host === 'windows',
    notifications: Boolean(plugins.LocalNotifications) || host === 'windows',
    clipboard: Boolean(navigator.clipboard) || host !== 'web',
    externalApps: host !== 'web',
    gamepad: 'getGamepads' in navigator,
    windowManagement: host === 'windows',
  });
}

export async function setNativeMode(mode) {
  const normalized = mode === 'windows11' ? 'windows' : mode;
  if (hasTauri()) return invoke('set_device_mode', { mode: normalized });
  if (window.MTP2026Native?.setDeviceMode) return window.MTP2026Native.setDeviceMode(normalized);
  if (hasIOSBridge()) {
    window.webkit.messageHandlers.mtp2026.postMessage({ mode: normalized });
    return true;
  }
  const orientation = normalized === 'windows' ? 'landscape' : normalized === 'android' || normalized === 'ios' ? 'portrait' : null;
  if (orientation && document.fullscreenElement && screen.orientation?.lock) {
    try { await screen.orientation.lock(orientation); } catch (_) {}
  }
  return false;
}

export async function nativeFullscreen(enter, element) {
  if (hasTauri()) return invoke(enter ? 'enter_fullscreen' : 'exit_fullscreen');
  if (enter) return element?.requestFullscreen ? element.requestFullscreen() : false;
  return document.fullscreenElement && document.exitFullscreen ? document.exitFullscreen() : false;
}

export async function nativeOpenExternal(url) {
  if (hasTauri()) return invoke('open_external', { url });
  if (window.MTP2026Native?.openExternal) return window.MTP2026Native.openExternal(url);
  const browser = cap()?.Plugins?.Browser;
  if (browser?.open) return browser.open({ url });
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function notifyNative(title, body) {
  const notifications = cap()?.Plugins?.LocalNotifications;
  if (notifications?.schedule) {
    return notifications.schedule({ notifications: [{ id: Date.now() % 2147483647, title, body }] });
  }
  if (Notification?.permission === 'granted') new Notification(title, { body });
  return false;
}

window.MTP2026NativePlatform = { nativeHost, nativeCapabilities, setNativeMode, nativeFullscreen, nativeOpenExternal, notifyNative };
