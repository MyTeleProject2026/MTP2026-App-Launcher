/*
 * MTP2026 Guest Application Runtime
 *
 * Turns VexaStore web applications into first-class MTP2026 guest apps.
 * WebApps run inside an isolated in-app window instead of forcing the user
 * back out to the browser. Native packages still go through the host OS
 * installer and are never falsely reported as installed by browser code.
 */

const VEXASTORE_ORIGINS = new Set([
  'https://www.vexastore.2bd.net',
  'https://vexastore.2bd.net',
]);
const INSTALL_MESSAGE = 'MTP2026_VEXASTORE_INSTALL';
const OPEN_MESSAGE = 'MTP2026_OPEN_APP';
const MODE_KEY = 'mtp2026-default-system-os';
const REGISTRY_KEY = 'mtp2026-installed-vexastore-apps-v3';

function mode() {
  const value = document.documentElement.dataset.mtpDeviceMode || localStorage.getItem(MODE_KEY) || 'android';
  if (value === 'ios') return 'mtp2026';
  return value === 'windows' ? 'desktop' : value;
}

function registry() {
  try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}'); } catch (_) { return {}; }
}

function saveRegistry(value) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(value));
}

// Any HTTPS WebApp may be manually registered by the user. Messages from
// VexaStore itself remain origin-restricted below; this only expands the
// explicit user URL installation path.
function trusted(url) {
  const parsed = new URL(String(url));
  return parsed.protocol === 'https:';
}

function esc(value) {
  return String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
}

function closeWindow() {
  document.getElementById('mtp2026-app-window')?.remove();
}

function openWindow(app) {
  if (!app?.url) return false;
  const url = String(app.url);
  try { if (!trusted(url)) return false; } catch (_) { return false; }

  closeWindow();
  const root = document.createElement('section');
  root.id = 'mtp2026-app-window';
  root.setAttribute('role', 'dialog');
  root.innerHTML = `
    <div class="mtp2026-app-window-backdrop"></div>
    <div class="mtp2026-app-window-frame">
      <header class="mtp2026-app-window-bar">
        <div class="mtp2026-app-window-title">
          <img src="${esc(app.iconUrl || '/branding/mtp2026-mark.svg')}" alt="">
          <div><b>${esc(app.name || app.title || 'VexaApp')}</b><small>MTP2026 ${esc(mode())} guest</small></div>
        </div>
        <button type="button" data-mtp-app-close aria-label="Close">×</button>
      </header>
      <iframe title="${esc(app.name || 'MTP2026 Application')}" src="${esc(url)}" loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; clipboard-read; clipboard-write"></iframe>
    </div>`;
  document.body.appendChild(root);
  root.querySelector('[data-mtp-app-close]').onclick = closeWindow;
  root.querySelector('.mtp2026-app-window-backdrop').onclick = closeWindow;
  return true;
}

function findInstalled(url) {
  const apps = Object.values(registry());
  return apps.find(app => app?.url === url || app?.webUrl === url) || null;
}

async function installWebApp(payload) {
  const app = payload?.app || payload;
  if (!app?.url) throw new Error('MTP2026_APP_URL_REQUIRED');
  const url = String(app.url).trim();
  if (!trusted(url)) throw new Error('MTP2026_WEBAPP_HTTPS_REQUIRED');

  const current = registry();
  const id = String(app.id || app.slug || url);
  current[id] = {
    ...current[id],
    ...app,
    id,
    name: app.name || app.title || new URL(url).hostname,
    title: app.title || app.name || new URL(url).hostname,
    url,
    source: app.source || 'Manual HTTPS WebApp',
    installMode: 'mtp2026-webapp',
    guestMode: mode(),
    guestModes: ['mtp2026', 'android', 'desktop', 'gaming'],
    installedAt: current[id]?.installedAt || new Date().toISOString(),
  };
  saveRegistry(current);
  window.dispatchEvent(new CustomEvent('mtp2026:vexastore-installed', { detail: current[id] }));
  window.dispatchEvent(new CustomEvent('mtp2026:apps-changed', { detail: current[id] }));
  return current[id];
}

async function handleInstallMessage(event) {
  if (!event?.origin || !VEXASTORE_ORIGINS.has(event.origin)) return;
  const data = event.data || {};
  if (data.type !== INSTALL_MESSAGE) return;

  try {
    const result = await installWebApp({ ...(data.app || data), source: 'VexaStore' });
    event.source?.postMessage({ type: 'MTP2026_VEXASTORE_INSTALL_RESULT', success: true, app: result }, event.origin);
    openWindow(result);
  } catch (error) {
    event.source?.postMessage({ type: 'MTP2026_VEXASTORE_INSTALL_RESULT', success: false, error: String(error?.message || error) }, event.origin);
  }
}

function handleOpenMessage(event) {
  if (!event?.origin || !VEXASTORE_ORIGINS.has(event.origin)) return;
  const data = event.data || {};
  if (data.type !== OPEN_MESSAGE) return;
  openWindow(data.app || data);
}

function interceptInstalledAppClicks(event) {
  const button = event.target?.closest?.('[data-app-url]');
  if (!button) return;
  const url = button.getAttribute('data-app-url');
  const app = findInstalled(url) || { url, name: 'VexaApp' };
  if (!app.url) return;
  if (openWindow(app)) event.stopImmediatePropagation();
}

function installExternalOpenInterceptor() {
  const platform = window.MTP2026NativePlatform;
  if (!platform || platform.__mtpVexaWrapped) return;
  const original = platform.nativeOpenExternal;
  if (typeof original !== 'function') return;
  platform.nativeOpenExternal = async function(url) {
    const installed = findInstalled(String(url || ''));
    if (installed && openWindow(installed)) return { success: true, status: 'in_app_webapp', app: installed };
    return original(url);
  };
  platform.__mtpVexaWrapped = true;
}

function addStyles() {
  if (document.getElementById('mtp2026-app-window-style')) return;
  const style = document.createElement('style');
  style.id = 'mtp2026-app-window-style';
  style.textContent = `
    #mtp2026-app-window{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:clamp(8px,2vw,24px)}
    .mtp2026-app-window-backdrop{position:absolute;inset:0;background:rgba(1,5,12,.78);backdrop-filter:blur(16px)}
    .mtp2026-app-window-frame{position:relative;width:min(1180px,100%);height:min(900px,100%);overflow:hidden;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:#07101b;box-shadow:0 30px 100px rgba(0,0,0,.6);display:flex;flex-direction:column}
    .mtp2026-app-window-bar{height:58px;flex:0 0 58px;display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 16px;background:rgba(10,20,35,.96);border-bottom:1px solid rgba(255,255,255,.08)}
    .mtp2026-app-window-title{display:flex;align-items:center;gap:10px;min-width:0}.mtp2026-app-window-title img{width:34px;height:34px;border-radius:10px;object-fit:cover}.mtp2026-app-window-title div{display:grid}.mtp2026-app-window-title b{font-size:14px;color:#f7fbff}.mtp2026-app-window-title small{font-size:10px;color:#8294aa}.mtp2026-app-window-bar button{width:38px;height:38px;border:0;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;font-size:25px;cursor:pointer}.mtp2026-app-window-frame iframe{border:0;flex:1;width:100%;background:#fff}
    @media(max-width:700px){#mtp2026-app-window{padding:0}.mtp2026-app-window-frame{height:100%;border-radius:0}.mtp2026-app-window-bar{height:52px;flex-basis:52px}}
  `;
  document.head.appendChild(style);
}

export function bootMTP2026VexaStoreRuntime() {
  addStyles();
  installExternalOpenInterceptor();
  window.addEventListener('message', handleInstallMessage);
  window.addEventListener('message', handleOpenMessage);
  document.addEventListener('click', interceptInstalledAppClicks, true);
}

bootMTP2026VexaStoreRuntime();
window.MTP2026VexaStoreRuntime = Object.freeze({ installWebApp, openWindow, closeWindow, findInstalled });
