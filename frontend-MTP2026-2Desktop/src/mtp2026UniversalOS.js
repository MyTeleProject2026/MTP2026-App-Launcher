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
  browserHistory = [startUrl];
  browserHistoryIndex = 0;
  runningApp = { id: 'mtp2026-browser', slug: 'mtp2026-browser', name: 'Browser', title: 'Browser', kind: 'browser', url: startUrl, key: 'mtp2026-browser', mode };
  window.dispatchEvent(new CustomEvent('mtp2026:app-launch', { detail: { app: runningApp, mode, url: startUrl } }));
  const host = ensureRuntimeHost();
  host.classList.remove('maximized');
  host.querySelector('[data-runtime-title]').textContent = 'Browser';
  host.querySelector('[data-runtime-profile]').textContent = profile.name + ' · browser';
  const icon = host.querySelector('[data-runtime-icon]');
  icon.replaceChildren(); icon.textContent = '🌐';
  const frame = host.querySelector('.mtp2026-app-runtime-frame');
  frame.innerHTML = '';
  frame.style.cssText = 'display:flex;flex-direction:column;min-height:0;overflow:hidden;background:#0a1422';
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:9px;border-bottom:1px solid rgba(255,255,255,.12);background:#0d1b2e';
  const button = (label, title, action) => { const b=document.createElement('button'); b.type='button'; b.textContent=label; b.title=title; b.style.cssText='min-width:34px;height:34px;border:1px solid rgba(160,195,230,.2);border-radius:9px;background:#152840;color:#edf6ff;cursor:pointer'; b.addEventListener('click',action); toolbar.appendChild(b); return b; };
  const addressForm = document.createElement('form');
  addressForm.style.cssText='display:flex;flex:1;min-width:150px;gap:5px';
  const address = document.createElement('input');
  address.type='text'; address.value=startUrl; address.autocomplete='url'; address.spellcheck=false;
  address.setAttribute('aria-label','Search or enter website address');
  address.placeholder='Search or enter website address';
  address.style.cssText='min-width:0;flex:1;height:34px;box-sizing:border-box;border:1px solid rgba(160,195,230,.2);border-radius:9px;padding:0 10px;background:#07101d;color:#eef6ff';
  const go = document.createElement('button'); go.type='submit'; go.textContent='Go'; go.style.cssText='border:0;border-radius:8px;padding:0 12px;background:#2376c9;color:white;font-weight:700';
  addressForm.append(address,go);
  const view = document.createElement('div'); view.style.cssText='position:relative;flex:1;min-height:160px;overflow:hidden';
  const iframe = document.createElement('iframe'); iframe.title='MTP2026 Browser page'; iframe.src=startUrl;
  iframe.referrerPolicy='strict-origin-when-cross-origin'; iframe.allow='fullscreen; clipboard-read; clipboard-write; autoplay; gamepad; picture-in-picture';
  iframe.setAttribute('sandbox','allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-pointer-lock allow-scripts allow-same-origin allow-downloads');
  iframe.style.cssText='width:100%;height:100%;min-height:100%;border:0;background:white';
  const blocked = document.createElement('div');
  blocked.style.cssText='display:none;position:absolute;inset:auto 12px 12px;padding:10px 12px;border:1px solid #52677f;border-radius:10px;background:#0b1727;color:#eaf4ff;font-size:12px';
  blocked.textContent='Some websites prohibit embedded browsing. Use “Open in Chrome / system browser” to view the full site.';
  const setUrl = (url, push = true) => {
    let safe;
    try { safe = normalizeBrowserAddress(url); }
    catch (error) { blocked.textContent=error.message; blocked.style.display='block'; return; }
    if (push) { browserHistory=browserHistory.slice(0,browserHistoryIndex+1); browserHistory.push(safe); browserHistoryIndex=browserHistory.length-1; }
    address.value=safe; iframe.src=safe; runningApp={...runningApp,url:safe}; host.querySelector('[data-runtime-status]').textContent=safe;
    back.disabled=browserHistoryIndex<=0; forward.disabled=browserHistoryIndex>=browserHistory.length-1;
    window.dispatchEvent(new CustomEvent('mtp2026:browser-navigation',{detail:{url:safe,mode}}));
  };
  const back=button('‹','Back',()=>{if(browserHistoryIndex>0){browserHistoryIndex--;setUrl(browserHistory[browserHistoryIndex],false)}});
  const forward=button('›','Forward',()=>{if(browserHistoryIndex<browserHistory.length-1){browserHistoryIndex++;setUrl(browserHistory[browserHistoryIndex],false)}});
  back.disabled=true; forward.disabled=true;
  button('↻','Reload page',()=>{try{iframe.contentWindow.location.reload()}catch(_){iframe.src=address.value}});
  addressForm.addEventListener('submit',event=>{event.preventDefault();try{setUrl(normalizeBrowserAddress(address.value))}catch(error){blocked.textContent=error.message;blocked.style.display='block'}});
  toolbar.appendChild(addressForm);
  button('☆','Bookmark current page',()=>{try{const key='mtp2026-browser-bookmarks-v1';const saved=JSON.parse(localStorage.getItem(key)||'[]');const current=address.value;const next=saved.includes(current)?saved.filter(x=>x!==current):[current,...saved].slice(0,30);localStorage.setItem(key,JSON.stringify(next));bookmarkMenu.hidden=!bookmarkMenu.hidden;renderBookmarks()}catch(error){blocked.textContent='Bookmarks are unavailable: '+error.message;blocked.style.display='block'}});
  button('↗','Open in Chrome / system browser',()=>openExternalBrowser(address.value));
  const bookmarkMenu=document.createElement('div'); bookmarkMenu.hidden=true; bookmarkMenu.style.cssText='padding:8px 10px;background:#101f33;border-bottom:1px solid rgba(255,255,255,.1);display:flex;gap:6px;flex-wrap:wrap';
  const renderBookmarks=()=>{bookmarkMenu.replaceChildren();let saved=[];try{saved=JSON.parse(localStorage.getItem('mtp2026-browser-bookmarks-v1')||'[]')}catch{};if(!saved.length){const note=document.createElement('small');note.textContent='No bookmarks yet. Tap ☆ to save this page.';note.style.color='#9eb4cd';bookmarkMenu.appendChild(note)}saved.forEach(url=>{const b=document.createElement('button');b.type='button';b.textContent=new URL(url).hostname;b.title=url;b.style.cssText='border:1px solid #344d69;border-radius:7px;padding:6px 9px;background:#172b43;color:#eaf4ff';b.onclick=()=>setUrl(url);bookmarkMenu.appendChild(b)})};
  const loading=document.createElement('div');loading.textContent='Page loading…';loading.style.cssText='position:absolute;top:10px;left:10px;padding:5px 8px;border-radius:6px;background:#07101dcc;color:#eaf4ff;font-size:11px;pointer-events:none';
  iframe.addEventListener('load',()=>{loading.remove();blocked.style.display='none';window.dispatchEvent(new CustomEvent('mtp2026:app-running',{detail:runningApp}))});
  iframe.addEventListener('error',()=>{blocked.style.display='block'});
  view.append(iframe,loading,blocked); frame.append(toolbar,bookmarkMenu,view);
  host.querySelector('[data-reload-runtime]').onclick=()=>{iframe.src=address.value};
  host.querySelector('[data-external-runtime]').textContent='↗ Open in Chrome / system browser';
  host.querySelector('[data-external-runtime]').textContent='↗ Open in Chrome / system browser';
  host.querySelector('[data-runtime-status]').textContent=startUrl;
  host.hidden=false;
  const dock=document.getElementById('mtp2026-app-runtime-dock'); if(dock)dock.hidden=true;
  window.dispatchEvent(new CustomEvent('mtp2026:app-running',{detail:runningApp}));
  return {success:true,mode,profile:profile.name,type:'browser-runtime',url:startUrl};
}
async function openApp(app) {
  if (app?.kind === 'browser' || app?.id === 'browser' || app?.slug === 'mtp2026-browser') return openBrowser(app?.url || app?.launchUrl || 'https://www.google.com/');
  const url = appUrl(app);
  if (!url) throw new Error('MTP2026_APP_URL_MISSING');
  const mode = currentProfile();
  const profile = PROFILES[mode];
  const safeUrl = trustedWebAppUrl(url);
  runningApp = { ...app, url: safeUrl, key: appKey(app), mode };
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
