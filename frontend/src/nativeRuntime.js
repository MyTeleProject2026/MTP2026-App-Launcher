/* MTP2026 native capability bridge. Browser/PWA remains supported; native
 * shells expose real platform APIs without changing VexaAccount authentication. */

const capacitor = () => window.Capacitor || null;
const capPlugins = () => capacitor()?.Plugins || {};
const isTauri = () => !!window.__TAURI_INTERNALS__;
let tauriInvokePromise;
async function tauriInvoke(command, args) {
  if (!isTauri()) return null;
  tauriInvokePromise ||= import('@tauri-apps/api/core').then(m => m.invoke);
  return (await tauriInvokePromise)(command, args);
}

const DEFAULT_CAPABILITIES = Object.freeze({ native: false, platform: 'web', orientationLock: false, fullscreen: true, filesystem: false, notifications: false, clipboard: !!navigator.clipboard, externalApps: false, gamepad: 'getGamepads' in navigator, windowControls: false });

export function getNativeCapabilities() {
  const cap = capacitor();
  const platform = cap?.getPlatform?.() || (isTauri() ? 'windows' : 'web');
  return { ...DEFAULT_CAPABILITIES, native: platform !== 'web', platform, filesystem: !!capPlugins().Filesystem || isTauri(), notifications: !!capPlugins().LocalNotifications || isTauri(), orientationLock: !!capPlugins().ScreenOrientation, externalApps: platform === 'android' || platform === 'ios' || isTauri(), windowControls: isTauri(), ...(window.MTP2026Native?.capabilities || {}) };
}

async function capacitorOrientation(mode) {
  const plugin = capPlugins().ScreenOrientation;
  if (!plugin) return false;
  const type = mode === 'windows' ? 'landscape-primary' : mode === 'android' || mode === 'ios' ? 'portrait-primary' : null;
  if (!type) { try { await plugin.unlock(); } catch {} return false; }
  try { await plugin.lock({ orientation: type }); return true; } catch { return false; }
}

export async function applyDeviceMode(mode) {
  const normalized = mode === 'windows11' ? 'windows' : mode || 'android';
  if (window.MTP2026Native?.setDeviceMode) return window.MTP2026Native.setDeviceMode(normalized);
  if (isTauri()) return tauriInvoke('set_device_mode', { mode: normalized });
  const platform = capacitor()?.getPlatform?.() || 'web';
  if (platform === 'android' || platform === 'ios') {
    const messageHandler = window.webkit?.messageHandlers?.mtp2026;
    if (platform === 'ios' && messageHandler) messageHandler.postMessage({ mode: normalized });
    return capacitorOrientation(normalized);
  }
  const orientation = normalized === 'windows' ? 'landscape' : normalized === 'android' || normalized === 'ios' ? 'portrait' : null;
  if (orientation && document.fullscreenElement && screen.orientation?.lock) { try { await screen.orientation.lock(orientation); } catch {} }
  return { native: false, platform: 'web', mode: normalized, orientation };
}

export async function enterMTPFullscreen(element) {
  if (window.MTP2026Native?.enterFullscreen) return window.MTP2026Native.enterFullscreen();
  if (isTauri()) return tauriInvoke('enter_fullscreen');
  if (element?.requestFullscreen) return element.requestFullscreen();
  return false;
}
export async function exitMTPFullscreen() {
  if (window.MTP2026Native?.exitFullscreen) return window.MTP2026Native.exitFullscreen();
  if (isTauri()) return tauriInvoke('exit_fullscreen');
  if (document.fullscreenElement && document.exitFullscreen) return document.exitFullscreen();
  return false;
}
export async function openExternal(url) {
  if (window.MTP2026Native?.openExternal) return window.MTP2026Native.openExternal(url);
  if (isTauri()) return tauriInvoke('open_external', { url });
  const browser = capPlugins().Browser;
  if (browser?.open) return browser.open({ url });
  window.open(url, '_blank', 'noopener,noreferrer');
}

window.addEventListener('mtp2026:device-mode', event => { applyDeviceMode(event.detail?.mode).catch(() => {}); });
window.MTP2026Runtime = { getNativeCapabilities, applyDeviceMode, enterMTPFullscreen, exitMTPFullscreen, openExternal };
