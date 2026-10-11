/* MTP2026 Universal Guest OS runtime.
 * Four MTP2026-owned guest personalities share one application/runtime contract.
 * WebApps published by VexaStore run inside the active guest shell. Native APK/
 * EXE/IPA packages are handed to the real host installer when supported.
 */
import { getInstalledVexaApps, installVexaStoreSlug, syncInstalledVexaApps, uninstallVexaStoreApp } from './vexaStoreInstaller.js';

const PROFILE_KEY = 'mtp2026-active-guest-profile';
const PROFILES = Object.freeze({
  mtp2026: { name: 'MTP2026 Device OS', layout: 'mobile', nav: 'gesture', storeLabel: 'VexaStore' },
  ios: { name: 'MTP2026 Device OS', alias: 'mtp2026', layout: 'mobile', nav: 'gesture', storeLabel: 'VexaStore' },
  android: { name: 'MTP2026 Android OS', layout: 'mobile', nav: 'gesture', storeLabel: 'VexaStore' },
  windows: { name: 'MTP2026 Desktop OS', alias: 'desktop', layout: 'desktop', nav: 'taskbar', storeLabel: 'VexaStore' },
  desktop: { name: 'MTP2026 Desktop OS', layout: 'desktop', nav: 'taskbar', storeLabel: 'VexaStore' },
  gaming: { name: 'MTP2026 Gaming OS', layout: 'gaming', nav: 'controller', storeLabel: 'VexaStore' },
});

let runningApp = null;

function normalize(mode) {
  const value = String(mode || '').toLowerCase();
  if (value === 'ios') return 'mtp2026';
  if (value === 'windows') return 'desktop';
  return PROFILES[value] ? value : 'mtp2026';
}
function currentProfile() { return normalize(document.documentElement.dataset.mtpDeviceMode || localStorage.getItem(PROFILE_KEY) || 'mtp2026'); }
function setProfile(mode) {
  const id = normalize(mode);
  localStorage.setItem(PROFILE_KEY, id);
  document.documentElement.dataset.mtpGuestProfile = id;
  document.documentElement.dataset.mtpGuestLayout = PROFILES[id].layout;
  document.documentElement.dataset.mtpGuestNavigation = PROFILES[id].nav;
  document.documentElement.dataset.mtpGuestName = PROFILES[id].name;
  window.dispatchEvent(new CustomEvent('mtp2026:universal-os-profile', { detail: { id, ...PROFILES[id] } }));
  return { id, ...PROFILES[id] };
}
function emitStatus(status, detail = {}) { window.dispatchEvent(new CustomEvent('mtp2026:app-install-status', { detail: { status, mode: currentProfile(), ...detail } })); }
function appUrl(app) { return app?.url || app?.launchUrl || app?.webApp?.url || null; }
function appKey(app) { return String(app?.id || app?.slug || app?.url || '').trim(); }
function ensureRuntimeHost() {
  let host = document.getElementById('mtp2026-app-runtime');
  if (host) return host;
  host = document.createElement('section');
  host.id = 'mtp2026-app-runtime';
  host.hidden = true;
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', 'MTP2026 application window');
  host.innerHTML = `
    <div class="mtp2026-app-runtime-toolbar">
      <div class="mtp2026-app-runtime-brand"><span data-runtime-icon aria-hidden="true">◈</span><div><b data-runtime-title>MTP2026 App</b><small data-runtime-profile></small></div></div>
      <div class="mtp2026-app-runtime-controls">
        <button type="button" data-reload-runtime title="Reload application">↻ <span>Reload</span></button>
        <button type="button" data-external-runtime title="Open in browser">↗ <span>Open in browser</span></button>
        <button type="button" data-minimize-runtime title="Minimize application">−</button>
        <button type="button" data-maximize-runtime title="Maximize application">□</button>
        <button type="button" data-close-runtime title="Close application" aria-label="Close application">×</button>
      </div>
    </div>
    <div class="mtp2026-app-runtime-frame"><div class="mtp2026-app-runtime-loading" data-runtime-loading>Launching WebApp…</div></div>
    <div class="mtp2026-app-runtime-footer"><span data-runtime-status>Application window</span><span>Sites that block embedded display can be opened in the browser.</span></div>`;
  document.body.appendChild(host);
  host.querySelector('[data-reload-runtime]')?.addEventListener('click', () => {
    const frame = host.querySelector('iframe');
    if (frame && runningApp?.url) {
      const loading = host.querySelector('[data-runtime-loading]');
      if (loading) loading.textContent = 'Reloading ' + (runningApp.name || runningApp.title || 'WebApp') + '…';
      frame.src = runningApp.url;
    }
  });
  host.querySelector('[data-external-runtime]')?.addEventListener('click', () => {
    if (runningApp?.url) { if (runningApp.kind === 'browser') openExternalBrowser(runningApp.url); else window.open(runningApp.url, '_blank', 'noopener,noreferrer'); }
  });
  host.querySelector('[data-minimize-runtime]')?.addEventListener('click', minimizeApp);
  host.querySelector('[data-maximize-runtime]')?.addEventListener('click', toggleMaximize);
  host.querySelector('[data-close-runtime]')?.addEventListener('click', closeApp);
  return host;
}
function ensureMinimizedDock() {
  let dock = document.getElementById('mtp2026-app-runtime-dock');
  if (!dock) {
    dock = document.createElement('button');
    dock.id = 'mtp2026-app-runtime-dock';
    dock.type = 'button';
    dock.className = 'mtp2026-app-runtime-dock';
    dock.addEventListener('click', () => {
      const host = document.getElementById('mtp2026-app-runtime');
      if (host) host.hidden = false;
      dock.hidden = true;
    });
    document.body.appendChild(dock);
  }
  dock.textContent = '▣  ' + (runningApp?.name || runningApp?.title || 'WebApp') + ' · Restore';
  dock.hidden = false;
}
function minimizeApp() {
  const host = document.getElementById('mtp2026-app-runtime');
  if (host) host.hidden = true;
  if (runningApp) ensureMinimizedDock();
  window.dispatchEvent(new CustomEvent('mtp2026:app-minimize', { detail: runningApp }));
}
function toggleMaximize() {
  const host = document.getElementById('mtp2026-app-runtime');
  if (!host) return;
  const maximized = host.classList.toggle('maximized');
  const button = host.querySelector('[data-maximize-runtime]');
  if (button) { button.textContent = maximized ? '❐' : '□'; button.title = maximized ? 'Restore application window' : 'Maximize application'; }
}
function trustedWebAppUrl(url) {
  const parsed = new URL(String(url || ''), window.location.href);
  if (parsed.protocol !== 'https:') throw new Error('MTP2026_APP_HTTPS_REQUIRED');
  return parsed.toString();
}
function closeApp() {
  const host = document.getElementById('mtp2026-app-runtime');
  if (host) {
    host.hidden = true;
    host.classList.remove('maximized');
    const frame = host.querySelector('.mtp2026-app-runtime-frame');
    if (frame) frame.innerHTML = '';
  }
  document.getElementById('mtp2026-app-runtime-dock')?.remove();
  const previous = runningApp;
  runningApp = null;
  window.dispatchEvent(new CustomEvent('mtp2026:app-close', { detail: previous }));
}

let browserHistory = [];
let browserHistoryIndex = -1;
function openExternalBrowser(url) {
  try {
    if (window.MTP2026Native?.openInChrome) { window.MTP2026Native.openInChrome(url); return true; }
    const chrome = window.MTP2026NativePlatform?.nativeOpenChrome;
    if (typeof chrome === 'function') {
      const result = chrome(url);
      if (result && typeof result.then === 'function') {
        result.then(opened => { if (opened === false) window.MTP2026NativePlatform?.nativeOpenExternal?.(url); })
          .catch(() => window.MTP2026NativePlatform?.nativeOpenExternal?.(url));
        return true;
      }
      if (result) return true;
    }
    const result = window.MTP2026NativePlatform?.nativeOpenExternal?.(url);
    if (result !== undefined) return result;
  } catch (_) {}
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
  return opened;
}
function normalizeBrowserAddress(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'https://www.google.com/';
  if (/^https?:\/\//i.test(value)) {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS pages are supported.');
    return parsed.toString();
  }
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(value)) return 'https://' + value;
  return 'https://www.google.com/search?q=' + encodeURIComponent(value);
}
function openBrowser(initialUrl = 'https://www.google.com/') {
  const mode = currentProfile();
  const profile = PROFILES[mode];
  let startUrl;
  try { startUrl = normalizeBrowserAddress(initialUrl); }
  catch (_) { startUrl = 'https://www.google.com/'; }

  // Chrome is a host application, not an embeddable website engine. Native
  // Android builds request the Chrome package; web deployments can only hand
  // off to a new system-browser tab and cannot force a specific desktop browser.
  const app = { id: 'google-chrome', slug: 'mtp2026-browser', name: 'Google Chrome', title: 'Google Chrome', kind: 'browser', url: startUrl, key: 'google-chrome', mode, ownerOS: profile.name };
  runningApp = app;
  window.dispatchEvent(new CustomEvent('mtp2026:app-launch', { detail: { app, mode, url: startUrl, ownerOS: profile.name, externalHandoff: true } }));
  if (window.MTP2026Native?.openInChrome) {
    try {
      window.MTP2026Native.openInChrome(startUrl);
      window.dispatchEvent(new CustomEvent('mtp2026:app-running', { detail: { ...app, launchMode: 'native-chrome' } }));
      return { success: true, mode, profile: profile.name, type: 'native-chrome-handoff', url: startUrl, ownerOS: profile.name };
    } catch (_) { /* Continue to the native capability adapter. */ }
  }
  const nativeChrome = window.MTP2026NativePlatform?.nativeOpenChrome;
  if (typeof nativeChrome === 'function') {
    try {
      const launch = nativeChrome(startUrl);
      if (launch && typeof launch.then === 'function') {
        launch.then(result => {
          if (result === false) {
            openExternalBrowser(startUrl);
            window.dispatchEvent(new CustomEvent('mtp2026:app-running', { detail: { ...app, launchMode: 'system-browser-fallback', ownerOS: profile.name } }));
          } else {
            window.dispatchEvent(new CustomEvent('mtp2026:app-running', { detail: { ...app, launchMode: 'native-chrome', ownerOS: profile.name } }));
          }
        }).catch(() => {
          openExternalBrowser(startUrl);
          window.dispatchEvent(new CustomEvent('mtp2026:app-running', { detail: { ...app, launchMode: 'system-browser-fallback', ownerOS: profile.name } }));
        });
        return { success: true, mode, profile: profile.name, type: 'native-chrome-requested', url: startUrl, ownerOS: profile.name };
      }
      if (launch) {
        window.dispatchEvent(new CustomEvent('mtp2026:app-running', { detail: { ...app, launchMode: 'native-chrome', ownerOS: profile.name } }));
        return { success: true, mode, profile: profile.name, type: 'native-chrome-handoff', url: startUrl, ownerOS: profile.name };
      }
    } catch (_) { /* Use the system-browser fallback below. */ }
  }
  try {
    const opened = window.open(startUrl, '_blank');
    if (opened) {
      try { opened.opener = null; } catch (_) {}
      window.dispatchEvent(new CustomEvent('mtp2026:app-running', { detail: { ...app, launchMode: 'system-browser' } }));
      return { success: true, mode, profile: profile.name, type: 'system-browser-handoff', url: startUrl, ownerOS: profile.name };
    }
  } catch (_) { /* Popup restrictions can require same-tab navigation. */ }
  window.location.assign(startUrl);
  return { success: true, mode, profile: profile.name, type: 'system-browser-navigation', url: startUrl, ownerOS: profile.name };
}
async function openApp(app) {
  if (app?.kind === 'browser' || app?.id === 'browser' || app?.slug === 'mtp2026-browser') return openBrowser(app?.url || app?.launchUrl || 'https://www.google.com/');
  const url = appUrl(app);
  if (!url) throw new Error('MTP2026_APP_URL_MISSING');
  const mode = currentProfile();
  const profile = PROFILES[mode];
  const safeUrl = trustedWebAppUrl(url);
  runningApp = { ...app, url: safeUrl, key: appKey(app), mode, ownerOS: profile.name, launchMode: 'in-os-webapp' };
  window.dispatchEvent(new CustomEvent('mtp2026:app-launch', { detail: { app: runningApp, mode, url: safeUrl } }));
  const target = ensureRuntimeHost();
  target.classList.remove('maximized');
  target.querySelector('[data-external-runtime]').textContent = '↗ Open in browser';
  target.querySelector('.mtp2026-app-runtime-frame').style.cssText = '';
  target.querySelector('[data-runtime-title]').textContent = app?.name || app?.title || 'VexaApp';
  target.querySelector('[data-runtime-profile]').textContent = profile.name + ' · ' + mode;
  target.querySelector('[data-runtime-status]').textContent = safeUrl;
  const icon = target.querySelector('[data-runtime-icon]');
  icon.textContent = '◈';
  icon.replaceChildren();
  try {
    const iconUrl = app?.userIconUrl || app?.iconUrl || null;
    if (iconUrl && new URL(iconUrl, window.location.href).protocol === 'https:') {
      const image = document.createElement('img');
      image.src = iconUrl; image.alt = ''; image.referrerPolicy = 'no-referrer';
      image.onerror = () => { image.remove(); icon.textContent = '◈'; };
      icon.appendChild(image);
    } else icon.textContent = '◈';
  } catch (_) { icon.textContent = '◈'; }
  const frame = target.querySelector('.mtp2026-app-runtime-frame');
  frame.innerHTML = '';
  const loading = document.createElement('div');
  loading.className = 'mtp2026-app-runtime-loading';
  loading.dataset.runtimeLoading = '';
  loading.textContent = 'Launching ' + (app?.name || app?.title || 'WebApp') + '…';
  frame.appendChild(loading);
  const iframe = document.createElement('iframe');
  iframe.title = (app?.name || app?.title || 'MTP2026 WebApp') + ' inside ' + profile.name;
  iframe.src = safeUrl;
  iframe.allow = 'fullscreen; autoplay; clipboard-read; clipboard-write; camera; microphone; geolocation; notifications';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.loading = 'eager';
  iframe.setAttribute('sandbox', 'allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-downloads');
  iframe.addEventListener('load', () => {
    const current = target.querySelector('[data-runtime-loading]');
    current?.remove();
    window.dispatchEvent(new CustomEvent('mtp2026:app-running', { detail: runningApp }));
  });
  iframe.addEventListener('error', () => {
    const current = target.querySelector('[data-runtime-loading]');
    if (current) current.textContent = 'The site could not be displayed here. Use “Open in browser” above.';
    window.dispatchEvent(new CustomEvent('mtp2026:app-error', { detail: { app: runningApp, error: 'WEBAPP_FRAME_LOAD_FAILED' } }));
  });
  frame.appendChild(iframe);
  target.hidden = false;
  const dock = document.getElementById('mtp2026-app-runtime-dock');
  if (dock) dock.hidden = true;
  return { success: true, mode, profile: profile.name, type: 'webapp-runtime', url: safeUrl, appKey: runningApp.key };
}

async function installFromLocation(slug, requestedMode = null) {
  if (!slug) return null;
  if (requestedMode) setProfile(requestedMode);
  emitStatus('starting', { slug, requestedMode: requestedMode || null });
  try {
    const result = await installVexaStoreSlug(slug, requestedMode || currentProfile());
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
  const requestedMode = payload.app?.guestMode || null;
  if (slug) void installFromLocation(slug, requestedMode).catch(() => {});
}

function uninstallApp(appOrSlug) {
  const slug = typeof appOrSlug === 'string' ? appOrSlug : appOrSlug?.slug;
  if (!slug) return false;
  if (runningApp && String(runningApp.slug || '') === String(slug)) closeApp();
  const removed = uninstallVexaStoreApp(slug);
  window.dispatchEvent(new CustomEvent('mtp2026:app-uninstalled', { detail: { slug, removed } }));
  return removed;
}

async function boot() {
  ensureRuntimeHost();
  setProfile(currentProfile());
  await syncInstalledVexaApps();
  const params = new URLSearchParams(location.search);
  if (params.get('vexastoreInstall') === '1' && params.get('slug')) void installFromLocation(params.get('slug'), params.get('guestMode')).catch(() => {});
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
  openBrowser,
  closeApp,
  uninstallApp,
  getRunningApp: () => runningApp ? { ...runningApp } : null,
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
