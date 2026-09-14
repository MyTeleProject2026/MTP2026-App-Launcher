/* MTP2026 Universal Guest OS runtime.
 *
 * This is the common application layer shared by the four MTP2026-owned
 * guest personalities. It deliberately does not pretend to replace Apple,
 * Microsoft, or Google firmware. Each profile owns its UI/navigation while
 * VexaStore supplies the application contract shared across profiles.
 */

import { getInstalledVexaApps, installVexaStoreSlug, syncInstalledVexaApps } from './vexaStoreInstaller.js';

const PROFILE_KEY = 'mtp2026-active-guest-profile';
const PROFILES = Object.freeze({
  mtp2026: { name: 'MTP2026 Device OS', layout: 'mobile', nav: 'gesture' },
  ios: { name: 'MTP2026 Device OS', layout: 'mobile', nav: 'gesture' },
  android: { name: 'MTP2026 Android OS', layout: 'mobile', nav: 'gesture' },
  windows: { name: 'MTP2026 Desktop OS', layout: 'desktop', nav: 'taskbar' },
  windows11: { name: 'MTP2026 Desktop OS', layout: 'desktop', nav: 'taskbar' },
  gaming: { name: 'MTP2026 Gaming OS', layout: 'gaming', nav: 'controller' },
});

function normalize(mode) {
  const value = String(mode || '').toLowerCase();
  return PROFILES[value] ? value : 'mtp2026';
}

function currentProfile() {
  return normalize(document.documentElement.dataset.mtpDeviceMode || localStorage.getItem(PROFILE_KEY) || 'mtp2026');
}

function setProfile(mode) {
  const id = normalize(mode);
  localStorage.setItem(PROFILE_KEY, id);
  document.documentElement.dataset.mtpGuestProfile = id;
  document.documentElement.dataset.mtpGuestLayout = PROFILES[id].layout;
  document.documentElement.dataset.mtpGuestNavigation = PROFILES[id].nav;
  window.dispatchEvent(new CustomEvent('mtp2026:universal-os-profile', { detail: { id, ...PROFILES[id] } }));
  return { id, ...PROFILES[id] };
}

function emitStatus(status, detail = {}) {
  window.dispatchEvent(new CustomEvent('mtp2026:app-install-status', { detail: { status, mode: currentProfile(), ...detail } }));
}

function appUrl(app) {
  return app?.url || app?.launchUrl || app?.webApp?.url || null;
}

async function openApp(app) {
  const url = appUrl(app);
  if (!url) throw new Error('MTP2026_APP_URL_MISSING');

  const mode = currentProfile();
  window.dispatchEvent(new CustomEvent('mtp2026:app-launch', { detail: { app, mode } }));

  // MTP2026-owned profiles launch the WebApp inside the launcher shell.
  // Native hosts may replace this event with a WebView/window implementation.
  if (typeof window.MTP2026NativePlatform?.nativeOpenExternal === 'function' && mode !== 'mtp2026' && mode !== 'ios') {
    return window.MTP2026NativePlatform.nativeOpenExternal(url);
  }

  const target = document.querySelector('#mtp2026-app-runtime');
  if (target) {
    target.innerHTML = `<iframe title="${String(app?.name || app?.title || 'VexaApp').replace(/"/g, '&quot;')}" src="${String(url).replace(/"/g, '&quot;')}" allow="fullscreen; autoplay; clipboard-read; clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    target.hidden = false;
    return true;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

async function installFromLocation(slug) {
  if (!slug) return null;
  emitStatus('starting', { slug });
  try {
    const result = await installVexaStoreSlug(slug);
    emitStatus('completed', { slug, result });
    return result;
  } catch (error) {
    emitStatus('failed', { slug, error: String(error?.message || error) });
    throw error;
  }
}

function installBridgeListener(event) {
  const payload = event?.data;
  if (!payload || payload.type !== 'MTP2026_VEXASTORE_INSTALL') return;
  if (event.origin !== 'https://www.vexastore.2bd.net') return;
  const slug = payload.app?.slug;
  if (slug) void installFromLocation(slug).catch(() => {});
}

function ensureRuntimeHost() {
  if (document.getElementById('mtp2026-app-runtime')) return;
  const host = document.createElement('section');
  host.id = 'mtp2026-app-runtime';
  host.hidden = true;
  host.setAttribute('aria-label', 'MTP2026 application runtime');
  host.innerHTML = '<div class="mtp2026-app-runtime-toolbar"><b>MTP2026 App</b><button type="button" data-close-runtime>Close</button></div><div class="mtp2026-app-runtime-frame"></div>';
  document.body.appendChild(host);
  host.querySelector('[data-close-runtime]')?.addEventListener('click', () => { host.hidden = true; });
}

async function boot() {
  ensureRuntimeHost();
  setProfile(currentProfile());
  await syncInstalledVexaApps();

  const params = new URLSearchParams(location.search);
  if (params.get('vexastoreInstall') === '1' && params.get('slug')) {
    void installFromLocation(params.get('slug')).catch(() => {});
  }

  window.addEventListener('message', installBridgeListener);
  window.addEventListener('mtp2026:device-mode', event => setProfile(event.detail?.mode));
  window.addEventListener('mtp2026:guest-profile-applied', event => setProfile(event.detail?.id));
  window.addEventListener('mtp2026:vexastore-installed', event => emitStatus('registered', { app: event.detail }));
}

window.MTP2026UniversalOS = Object.freeze({
  profiles: PROFILES,
  getProfile: currentProfile,
  setProfile,
  getInstalledApps: getInstalledVexaApps,
  syncApps: syncInstalledVexaApps,
  install: installFromLocation,
  openApp,
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
