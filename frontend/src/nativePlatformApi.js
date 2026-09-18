/* MTP2026 unified native platform capability API. */

import './startupOrchestrator.js';
import './nativeGuestStorage.js';
import './osRuntime.js';
import './guestBootController.js';
import { getGuestImageContract } from './guestRuntimeManifest.js';

const hasTauri = () => Boolean(window.__TAURI_INTERNALS__);
const hasIOSBridge = () => Boolean(window.webkit?.messageHandlers?.mtp2026);
const cap = () => window.Capacitor || null;
const browserNotification = () => typeof window !== 'undefined' && 'Notification' in window ? window.Notification : null;
const validModes = new Set(['mtp2026', 'android', 'ios', 'windows', 'windows11', 'gaming']);

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
    native: host !== 'web', host,
    orientation: host === 'android' || host === 'ios', fullscreen: true,
    filesystem: Boolean(plugins.Filesystem) || host === 'windows' || Boolean(window.MTP2026NativeGuestStorage),
    guestStorage: Boolean(window.MTP2026NativeGuestStorage),
    notifications: Boolean(plugins.LocalNotifications) || host === 'windows' || host === 'android' || host === 'ios',
    clipboard: Boolean(navigator.clipboard), externalApps: host !== 'web',
    gamepad: 'getGamepads' in navigator && host !== 'ios', windowManagement: host === 'windows',
    guestRuntime: Boolean(window.MTP2026GuestBoot), packageInstaller: host === 'android' || host === 'windows',
    realArm64GuestRuntime: hasTauri(),
  });
}

export async function setNativeMode(mode) {
  const normalized = mode === 'windows11' ? 'windows' : mode === 'mtp2026' ? 'mtp2026' : mode;
  if (!validModes.has(mode) || !validModes.has(normalized)) throw new Error('Unsupported MTP2026 device mode');
  let nativeResult = null;
  if (hasTauri()) nativeResult = await invoke('set_device_mode', { mode: normalized });
  else if (window.MTP2026Native?.setDeviceMode) nativeResult = await window.MTP2026Native.setDeviceMode(normalized);
  else if (hasIOSBridge()) { window.webkit.messageHandlers.mtp2026.postMessage({ mode: normalized }); nativeResult = true; }
  else {
    const orientation = normalized === 'windows' || normalized === 'gaming' ? 'landscape' : normalized === 'android' || normalized === 'mtp2026' || normalized === 'ios' ? 'portrait' : null;
    if (orientation && document.fullscreenElement && screen.orientation?.lock) { try { await screen.orientation.lock(orientation); } catch (_) {} }
  }
  try { localStorage.setItem('mtp2026-default-system-os', mode); void window.MTP2026Runtime?.boot?.(mode, { nativeResult }); } catch (_) {}
  return nativeResult;
}

async function bootNativeGuest({ id, guestContract }) {
  if (!hasTauri()) return null;
  const source = guestContract?.imageSource || {};
  const bundleUrl = source.url || guestContract?.imageUrl || null;
  const bundleSha256 = source.sha256 || guestContract?.bundleSha256 || null;
  if (!bundleUrl) throw new Error(`GUEST_IMAGE_SOURCE_NOT_CONFIGURED_${id}`);
  if (!bundleSha256) throw new Error(`GUEST_IMAGE_SHA256_NOT_CONFIGURED_${id}`);
  // VexaAccount provider tokens never enter the guest. Only the authenticated
  // session identity/profile is bridged to the native guest as short-lived
  // metadata, allowing Account Center features without exposing secrets.
  try {
    const sessionResponse = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
    if (sessionResponse.ok) {
      const session = await sessionResponse.json();
      const profile = session?.profile || {};
      await invoke('sync_guest_identity', {
        id,
        subject: String(profile.sub || profile.id || ''),
        displayName: String(profile.name || profile.displayName || profile.email || 'VexaAccount'),
        expiresAt: String(session?.expiresAt || session?.expires_at || '')
      });
    }
  } catch (_) {}
  return invoke('boot_guest', { id, bundleUrl, bundleSha256 });
}

async function stopNativeGuest(id) {
  if (hasTauri() && id) return invoke('stop_guest', { id });
  return null;
}

if (hasTauri()) {
  window.MTP2026NativeGuestRuntime = Object.freeze({
    async bootGuest({ id, guestContract }) {
      const result = await bootNativeGuest({ id, guestContract });
      return { ...result, provider: 'tauri-qemu-system-aarch64', realGuest: true };
    },
    async stopGuest(id) { return stopNativeGuest(id); },
    async status(id) { return invoke('guest_runtime_status', { id }); },
  });
}

/** Hand off a verified VexaStore native package to the host installer. */
export async function nativeInstallPackage(url, version = '', metadata = {}) {
  const safeUrl = String(url || '').trim();
  if (!/^https:\/\//i.test(safeUrl)) throw new Error('NATIVE_PACKAGE_HTTPS_REQUIRED');
  const host = nativeHost();
  if (host === 'android' && typeof window.MTP2026Native?.installApkFromUrl === 'function') {
    window.MTP2026Native.installApkFromUrl(safeUrl, metadata.packageName || '');
    return { success: true, status: 'installer_started', host, version, requiresUserApproval: true };
  }
  if (host === 'windows' && hasTauri()) return invoke('install_package', { url: safeUrl, packageType: metadata.packageType || 'windows' });
  if (host === 'ios') { await nativeOpenExternal(safeUrl); return { success: true, status: 'external_install_handoff', host, version, requiresUserApproval: true }; }
  await nativeOpenExternal(safeUrl);
  return { success: true, status: 'external_install_handoff', host, version, requiresUserApproval: true };
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
  const safeTitle = String(title || 'MTP2026');
  const safeBody = String(body || '');
  if (hasTauri()) return invoke('notify_native', { title: safeTitle, body: safeBody });
  if (window.MTP2026Native?.notify) return window.MTP2026Native.notify(safeTitle, safeBody);
  const notifications = cap()?.Plugins?.LocalNotifications;
  if (notifications?.schedule) return notifications.schedule({ notifications: [{ id: Date.now() % 2147483647, title: safeTitle, body: safeBody }] });
  const NotificationAPI = browserNotification();
  if (NotificationAPI?.permission === 'granted') return new NotificationAPI(safeTitle, { body: safeBody });
  if (NotificationAPI?.permission === 'default') { try { const permission = await NotificationAPI.requestPermission(); if (permission === 'granted') return new NotificationAPI(safeTitle, { body: safeBody }); } catch (_) {} }
  return false;
}

window.MTP2026NativePlatform = { nativeHost, nativeCapabilities, setNativeMode, nativeInstallPackage, nativeFullscreen, nativeOpenExternal, notifyNative };

const startupMode = window.localStorage?.getItem('mtp2026-default-system-os');
if (startupMode && validModes.has(startupMode)) void setNativeMode(startupMode).catch(() => {});

(function showStartupLogoBeforeOsPicker() {
  if (window.MTP2026Startup || (startupMode && validModes.has(startupMode))) return;
  const picker = document.getElementById('mtp-os-picker');
  if (!picker || document.getElementById('mtp2026-startup-logo')) return;
  picker.classList.add('mtp-os-hidden');
  const splash = document.createElement('div');
  splash.id = 'mtp2026-startup-logo';
  splash.setAttribute('aria-label', 'MTP2026 starting');
  splash.innerHTML = '<img class="mtp-startup-logo" src="/branding/mtp2026-mark.svg" alt="MTP2026"/><div class="mtp-startup-name">MTP2026</div><div class="mtp-startup-subtitle">MTP2026 Device OS</div>';
  const style = document.createElement('style');
  style.textContent = '#mtp2026-startup-logo{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 42%,#14284a 0,#070811 48%,#03050b 100%);color:#eef6ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;animation:mtp-startup-fade .45s ease-out}.mtp-startup-logo{width:110px;height:110px;object-fit:contain;filter:drop-shadow(0 20px 50px rgba(33,212,253,.28));animation:mtp-startup-pulse 1.1s ease-in-out infinite}.mtp-startup-name{margin-top:22px;font-size:25px;font-weight:800}.mtp-startup-subtitle{margin-top:6px;color:#8fa6c4;font-size:12px;letter-spacing:.08em;text-transform:uppercase}@keyframes mtp-startup-pulse{0%,100%{transform:scale(.96);opacity:.84}50%{transform:scale(1);opacity:1}}@keyframes mtp-startup-fade{from{opacity:0}to{opacity:1}}';
  document.head.appendChild(style); document.body.appendChild(splash);
  window.setTimeout(() => { splash.style.transition = 'opacity .32s ease, visibility .32s ease'; splash.style.opacity = '0'; splash.style.visibility = 'hidden'; picker.classList.remove('mtp-os-hidden'); window.setTimeout(() => { splash.remove(); style.remove(); }, 340); }, 650);
})();
