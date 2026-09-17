import { applyMTP2026GuestProfile, getMTP2026GuestProfile } from './mtp2026GuestProfiles.js';
import { getInstalledVexaApps, syncInstalledVexaApps, installManualWebApp, uninstallVexaStoreApp } from './vexaStoreInstaller.js';

const ROOT_ID = 'mtp2026-guest-shell';
const STORE_URL = 'https://www.vexastore.2bd.net/';
const GUEST_MODES = [
  { id: 'mtp2026', label: 'MTP2026 Device OS', note: 'MTP2026-owned device shell' },
  { id: 'android', label: 'MTP2026 Android OS', note: 'MTP2026 Android-compatible shell' },
  { id: 'windows11', label: 'MTP2026 Desktop OS', note: 'MTP2026 desktop shell' },
  { id: 'gaming', label: 'MTP2026 Gaming OS', note: 'MTP2026 gaming shell' },
];

function esc(v) { return String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
function mode() { const value = document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'android'; return value === 'windows' ? 'windows11' : value === 'ios' ? 'mtp2026' : value; }
function openUrl(url) { try { window.MTP2026NativePlatform?.nativeOpenExternal?.(url); } catch (_) { window.open(url, '_blank', 'noopener,noreferrer'); } }
function openAccount() { window.dispatchEvent(new CustomEvent('mtp2026:open-account')); }
function installed() { return getInstalledVexaApps().slice(0, 24); }
function applyMode(nextMode) {
  const normalized = nextMode === 'windows' ? 'windows11' : nextMode === 'ios' ? 'mtp2026' : nextMode;
  const apply = window.MTP2026Runtime?.applyDeviceMode;
  if (typeof apply === 'function') return apply(normalized);
  localStorage.setItem('mtp2026-default-system-os', normalized);
  document.documentElement.dataset.mtpDeviceMode = normalized;
  window.dispatchEvent(new CustomEvent('mtp2026:device-mode', { detail: { mode: normalized } }));
  return Promise.resolve(normalized);
}

function ensureStyles() {
  if (document.getElementById(`${ROOT_ID}-controls-style`)) return;
  const style = document.createElement('style');
  style.id = `${ROOT_ID}-controls-style`;
  style.textContent = `#${ROOT_ID} .mtp-guest-control-panel{position:fixed;inset:0;z-index:2147482500;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(2,7,15,.76);backdrop-filter:blur(14px)}#${ROOT_ID} .mtp-guest-control-panel.open{display:flex}#${ROOT_ID} .mtp-guest-control-card{width:min(620px,100%);max-height:90vh;overflow:auto;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:#081223;color:#fff;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.55)}#${ROOT_ID} .mtp-guest-control-card h3{margin:0 0 6px;font-size:18px}#${ROOT_ID} .mtp-guest-control-card p{margin:5px 0 12px;color:#9aa8bd;font-size:12px}#${ROOT_ID} .mtp-guest-control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}#${ROOT_ID} .mtp-guest-control-grid button,#${ROOT_ID} .mtp-guest-control-actions button{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:11px;background:#0e1a2d;color:#fff;text-align:left}#${ROOT_ID} .mtp-guest-control-grid button.active{border-color:#12c8ff;background:#103148}#${ROOT_ID} .mtp-guest-control-grid small{display:block;color:#8292aa;margin-top:3px}#${ROOT_ID} .mtp-guest-control-actions{display:flex;gap:8px;margin-top:12px}#${ROOT_ID} .mtp-guest-control-actions button{flex:1}#${ROOT_ID} .mtp-guest-control-input{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:#050b15;color:#fff;padding:11px;margin:5px 0}#${ROOT_ID} .mtp-guest-control-status{font-size:11px;color:#9aa8bd;min-height:16px}#${ROOT_ID} .mtp-guest-installed{display:grid;gap:7px;margin-top:10px}#${ROOT_ID} .mtp-guest-installed-row{display:flex;align-items:center;gap:8px;padding:9px;border-radius:11px;background:rgba(255,255,255,.045)}#${ROOT_ID} .mtp-guest-installed-row span{flex:1;min-width:0;font-size:12px}#${ROOT_ID} .mtp-guest-installed-row button{border:0;border-radius:8px;padding:6px 8px;background:#18263b;color:#fff}@media(max-width:560px){#${ROOT_ID} .mtp-guest-control-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}

function controlPanel() {
  ensureStyles();
  let panel = document.getElementById(`${ROOT_ID}-controls`);
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = `${ROOT_ID}-controls`;
  panel.className = 'mtp-guest-control-panel';
  panel.innerHTML = `<div class="mtp-guest-control-card"><h3 data-panel-title>Device & OS</h3><p data-panel-subtitle>Switch between the four MTP2026-owned ARM64 guest profiles.</p><div data-panel-body></div><div class="mtp-guest-control-actions"><button type="button" data-panel-close>Close</button></div></div>`;
  document.body.appendChild(panel);
  panel.querySelector('[data-panel-close]').onclick = () => panel.classList.remove('open');
  return panel;
}

function openDevicePanel() {
  const panel = controlPanel();
  panel.querySelector('[data-panel-title]').textContent = 'Device & OS';
  panel.querySelector('[data-panel-subtitle]').textContent = 'Switch between the four MTP2026-owned ARM64 guest profiles.';
  const body = panel.querySelector('[data-panel-body]');
  body.innerHTML = `<div class="mtp-guest-control-grid">${GUEST_MODES.map(item => `<button type="button" data-mode="${item.id}" class="${mode() === item.id ? 'active' : ''}"><b>${esc(item.label)}</b><small>${esc(item.note)}</small></button>`).join('')}</div>`;
  body.querySelectorAll('[data-mode]').forEach(button => button.onclick = async () => {
    const next = button.dataset.mode;
    button.disabled = true;
    try { await applyMode(next); panel.classList.remove('open'); render(); } catch (error) { window.dispatchEvent(new CustomEvent('mtp2026:guest-control-error', { detail: { error: String(error?.message || error) } })); } finally { button.disabled = false; }
  });
  panel.classList.add('open');
}

function openWebAppPanel() {
  const panel = controlPanel();
  panel.querySelector('[data-panel-title]').textContent = 'Install WebApp';
  panel.querySelector('[data-panel-subtitle]').textContent = 'Add any HTTPS WebApp to the MTP2026 application library. VexaStore apps can still be installed from VexaStore.';
  const body = panel.querySelector('[data-panel-body]');
  const apps = installed();
  body.innerHTML = `<input class="mtp-guest-control-input" data-web-url type="url" inputmode="url" placeholder="https://example.com/app" autocomplete="url"><input class="mtp-guest-control-input" data-web-name type="text" placeholder="App name (optional)" maxlength="80"><div class="mtp-guest-control-actions"><button type="button" data-install-web>Install WebApp</button><button type="button" data-open-store>Open VexaStore</button></div><div class="mtp-guest-control-status" data-install-status></div><div class="mtp-guest-installed"><b>Installed WebApps</b>${apps.map(app => `<div class="mtp-guest-installed-row"><span>${esc(app.name || app.title || app.url)}</span><button type="button" data-launch="${esc(app.id || app.slug || app.url)}">Open</button><button type="button" data-remove="${esc(app.slug || app.id || app.url)}">Remove</button></div>`).join('') || '<small>No WebApps installed yet.</small>'}</div>`;
  const status = body.querySelector('[data-install-status]');
  body.querySelector('[data-open-store]').onclick = () => openUrl(STORE_URL);
  body.querySelector('[data-install-web]').onclick = async () => {
    const url = body.querySelector('[data-web-url]').value.trim();
    const name = body.querySelector('[data-web-name]').value.trim();
    status.textContent = 'Installing…';
    try {
      const result = await installManualWebApp({ url, name, guestMode: mode() });
      status.textContent = result.cloudRegistered ? 'Installed and synced to your MTP2026 account.' : 'Installed locally. Sign in to sync it to your MTP2026 account.';
      setTimeout(() => openWebAppPanel(), 250);
    } catch (error) { status.textContent = String(error?.message || error); }
  };
  body.querySelectorAll('[data-launch]').forEach(button => button.onclick = () => {
    const app = apps.find(item => String(item.id || item.slug || item.url) === String(button.dataset.launch));
    if (app) void launchVexaApp(app);
    panel.classList.remove('open');
  });
  body.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {
    uninstallVexaStoreApp(button.dataset.remove); openWebAppPanel();
  });
  panel.classList.add('open');
}

async function launchVexaApp(app) {
  try {
    if (window.MTP2026UniversalOS?.openApp) { await window.MTP2026UniversalOS.openApp(app); return; }
  } catch (error) { console.warn('MTP2026 guest WebApp runtime failed; using host fallback', error); }
  openUrl(app.url);
}

function render() {
  ensureStyles();
  const profile = getMTP2026GuestProfile(mode());
  applyMTP2026GuestProfile(profile.id);
  let root = document.getElementById(ROOT_ID);
  if (!root) { root = document.createElement('section'); root.id = ROOT_ID; document.body.appendChild(root); }
  const apps = installed();
  const appButtons = apps.map(app => `<button data-app-id="${esc(app.id || app.slug || app.url)}"><img src="${esc(app.iconUrl || '/branding/mtp2026-mark.svg')}" alt=""><span>${esc(app.name || 'VexaApp')}</span></button>`).join('');
  const controls = `<button data-action="device-os">Device & OS</button><button data-action="webapp">Install WebApp</button>`;

  if (profile.layout === 'desktop') {
    root.innerHTML = `<div class="mtp-guest-desktop"><header><img src="/branding/mtp2026-mark.svg" alt="MTP2026"><strong>${esc(profile.label)}</strong><button data-action="account" class="mtp-guest-account">VexaAccount</button><span class="mtp-guest-clock">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></header><main><aside><button data-action="start">▦ Start</button><button data-action="store">VexaStore</button>${controls}<button data-action="settings">Settings</button><button data-action="files">Files</button></aside><section><div class="mtp-guest-desktop-welcome"><span>${esc(profile.shortLabel)}</span><h2>${esc(profile.label)}</h2><p>ARM64 MTP2026 guest workspace · VexaAccount session · VexaStore applications</p></div><div class="mtp-guest-apps">${appButtons || '<small>No VexaStore apps installed yet.</small>'}</div></section></main><footer><span>⌁ ${esc(profile.family)}</span><span>ARM64</span><span>VexaAccount</span></footer></div>`;
  } else if (profile.layout === 'gaming') {
    root.innerHTML = `<div class="mtp-guest-gaming"><header><img src="/branding/mtp2026-mark.svg" alt="MTP2026"><div><small>MTP2026 GAMING OS</small><strong>Game Hub</strong></div><button data-action="account">VexaAccount</button><button data-action="store">VexaStore</button></header><div class="mtp-gaming-stats"><div><b>ARM64</b><small>Guest CPU</small></div><div><b>${apps.length}</b><small>Installed apps</small></div><div><b>Vexa</b><small>Account</small></div></div><div class="mtp-guest-control-actions" style="padding:10px"><button data-action="device-os">Device & OS</button><button data-action="webapp">Install WebApp</button></div><section class="mtp-gaming-apps">${appButtons || '<small>No installed VexaApps. Open VexaStore to add applications.</small>'}</section><footer><button data-action="settings">Settings</button><button data-action="files">Storage</button><button data-action="account">Account</button><button data-action="store">VexaStore</button></footer></div>`;
  } else {
    root.innerHTML = `<div class="mtp-guest-mobile"><header><div><small>${esc(profile.family.toUpperCase())}</small><strong>${esc(profile.shortLabel)}</strong></div><button data-action="account" class="mtp-guest-account">Vexa</button><span>${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></header><section class="mtp-mobile-widgets"><button data-action="store"><b>VexaStore</b><small>Install VexaApps</small></button><button data-action="device-os"><b>Device & OS</b><small>Switch MTP2026 guest</small></button><button data-action="webapp"><b>Install WebApp</b><small>HTTPS WebApp URL</small></button><button data-action="settings"><b>Settings</b><small>Account · Storage · OS</small></button></section><section class="mtp-mobile-apps">${appButtons || '<small>No installed VexaApps yet.</small>'}</section><nav><button data-action="home">Home</button><button data-action="store">Store</button><button data-action="files">Files</button><button data-action="settings">Settings</button><button data-action="account">Account</button></nav></div>`;
  }

  root.querySelectorAll('[data-app-id]').forEach(b => b.onclick = () => { const app = apps.find(item => String(item.id || item.slug || item.url) === String(b.dataset.appId)); if (app) void launchVexaApp(app); });
  root.querySelectorAll('[data-action="store"]').forEach(b => b.onclick = () => openUrl(STORE_URL));
  root.querySelectorAll('[data-action="account"]').forEach(b => b.onclick = openAccount);
  root.querySelectorAll('[data-action="device-os"]').forEach(b => b.onclick = openDevicePanel);
  root.querySelectorAll('[data-action="webapp"]').forEach(b => b.onclick = openWebAppPanel);
  root.querySelectorAll('[data-action="settings"]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('mtp2026:open-settings')));
  root.querySelectorAll('[data-action="files"]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('mtp2026:open-files')));
  root.querySelectorAll('[data-action="home"]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('mtp2026:guest-home')));
}

async function refreshLibraryAndRender() { await syncInstalledVexaApps(); render(); }
function setVisible(visible) { const root = document.getElementById(ROOT_ID); if (root) root.hidden = !visible; }

window.addEventListener('mtp2026:guest-state', event => { const state = event.detail || {}; if (state.phase === 'ready' && state.running) { render(); setVisible(true); refreshLibraryAndRender().catch(() => {}); } if (['stopped','error','needs-install'].includes(state.phase)) setVisible(false); });
window.addEventListener('mtp2026:device-mode', () => refreshLibraryAndRender().catch(() => render()));
window.addEventListener('mtp2026:default-system-os', () => refreshLibraryAndRender().catch(() => render()));
window.addEventListener('mtp2026:vexastore-installed', () => refreshLibraryAndRender().catch(() => render()));
window.addEventListener('mtp2026:vexastore-uninstalled', () => refreshLibraryAndRender().catch(() => render()));
window.addEventListener('mtp2026:vexastore-library-synced', render);
render();
refreshLibraryAndRender().catch(() => {});
