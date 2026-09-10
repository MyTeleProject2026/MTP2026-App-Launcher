/* MTP2026 native capability bridge.
 * Browser/PWA remains supported. Capacitor mobile shells and the Tauri Windows
 * shell expose native capabilities without changing VexaAccount authentication.
 */

const capacitor = () => window.Capacitor || null;
const capPlugins = () => capacitor()?.Plugins || {};

const DEFAULT_CAPABILITIES = Object.freeze({
  native: false, platform: 'web', orientationLock: false, fullscreen: true,
  filesystem: false, notifications: false, clipboard: !!navigator.clipboard,
  externalApps: false, gamepad: 'getGamepads' in navigator, windowControls: false,
});

export function getNativeCapabilities() {
  const cap = capacitor();
  const platform = cap?.getPlatform?.() || 'web';
  return {
    ...DEFAULT_CAPABILITIES,
    native: platform !== 'web' || !!window.__TAURI_INTERNALS__,
    platform,
    orientationLock: !!capPlugins().ScreenOrientation || !!window.MTP2026Native?.capabilities?.orientationLock,
    filesystem: !!capPlugins().Filesystem || !!window.MTP2026Native?.capabilities?.filesystem,
    notifications: !!capPlugins().LocalNotifications || !!window.MTP2026Native?.capabilities?.notifications,
    externalApps: platform === 'android' || platform === 'ios' || !!window.MTP2026Native?.capabilities?.externalApps,
    ...(window.MTP2026Native?.capabilities || {})
  };
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
  const platform = capacitor()?.getPlatform?.() || 'web';
  if (platform === 'android' || platform === 'ios') return capacitorOrientation(normalized);
  const orientation = normalized === 'windows' ? 'landscape' : normalized === 'android' || normalized === 'ios' ? 'portrait' : null;
  if (orientation && document.fullscreenElement && screen.orientation?.lock) {
    try { await screen.orientation.lock(orientation); } catch {}
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
export async function openExternal(url) {
  if (window.MTP2026Native?.openExternal) return window.MTP2026Native.openExternal(url);
  const browser = capPlugins().Browser;
  if (browser?.open) return browser.open({ url });
  window.open(url, '_blank', 'noopener,noreferrer');
}

window.addEventListener('mtp2026:device-mode', event => { applyDeviceMode(event.detail?.mode).catch(() => {}); });
window.MTP2026Runtime = { getNativeCapabilities, applyDeviceMode, enterMTPFullscreen, exitMTPFullscreen, openExternal };
