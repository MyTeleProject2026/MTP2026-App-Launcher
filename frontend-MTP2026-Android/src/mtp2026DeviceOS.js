import { API, api, getVexaSession } from './auth/vexaAuth';
import './mtp2026DeviceOS.css';

const MODE = 'mtp2026';
const ROOT_ID = 'mtp2026-device-os';
const STORE_URL = 'https://www.vexastore.2bd.net/';
const ACCOUNT_URL = 'https://vexaaccount-management.onrender.com';
const BRAND_MARK = '/branding/mtp2026-mark.svg';

const SYSTEM_APPS = [
  { id: 'vexastore', name: 'VexaStore', glyph: '▦', url: STORE_URL, subtitle: 'Apps & updates', kind: 'store' },
  { id: 'vexaaccount', name: 'VexaAccount', glyph: '◉', url: ACCOUNT_URL, subtitle: 'Identity & security', kind: 'account' },
  { id: 'settings', name: 'Settings', glyph: '⚙', subtitle: 'Device settings', kind: 'settings' },
  { id: 'files', name: 'Files', glyph: '▤', url: '', subtitle: 'MTP storage', kind: 'files' },
  { id: 'browser', name: 'Browser', glyph: '◎', url: 'https://www.google.com/', subtitle: 'Web browsing', kind: 'browser' },
  { id: 'email', name: 'VexaEmail', glyph: '✉', subtitle: 'Coming soon', kind: 'coming' },
  { id: 'tube', name: 'VexaTube', glyph: '▶', subtitle: 'Coming soon', kind: 'coming' },
  { id: 'cloud', name: 'VexaCloud', glyph: '☁', subtitle: 'Coming soon', kind: 'coming' },
  { id: 'passwords', name: 'Vexa Passwords', glyph: '▣', subtitle: 'Coming soon', kind: 'coming' },
];

const state = { session: null, apps: [], page: 'home', modal: null, search: '', storage: null, files: [] };

function esc(value) { return String(value ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c])); }
function isMTP2026Mode() {
  const mode = String(document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || '').toLowerCase();
  return mode === 'mtp2026' || mode === 'ios';
}
function fmtBytes(bytes) {
  const n = Number(bytes || 0); if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}
async function refreshStorage() {
  let estimate = { usage: 0, quota: 0 };
  try { estimate = await navigator.storage?.estimate?.() || estimate; } catch (_) {}
  const memory = Number(navigator.deviceMemory || 0);
  state.storage = { usage: estimate.usage || 0, quota: estimate.quota || 0, memory };
  return state.storage;
}
function logicalPartitions(storage) {
  const quota = storage?.quota || 0;
  return [
    { id: 'system', name: 'System', icon: 'M', size: Math.round(quota * .08), desc: 'MTP2026 Device OS shell and configuration' },
    { id: 'user', name: 'User', icon: '⌂', size: Math.round(quota * .45), desc: 'User documents and imported files' },
    { id: 'apps', name: 'Applications', icon: '▦', size: Math.round(quota * .35), desc: 'Installed VexaStore WebApps and metadata' },
    { id: 'cache', name: 'Cache', icon: '◌', size: Math.round(quota * .12), desc: 'Temporary browser and runtime data' },
  ];
}
async function loadSessionAndApps() {
  try { state.session = await getVexaSession(); } catch (_) { state.session = null; }
  try { const response = await api('/apps'); if (response.ok) state.apps = await response.json(); } catch (_) { state.apps = []; }
}
function profileName() { return state.session?.profile?.name || state.session?.profile?.email || 'VexaAccount User'; }
function appItems() {
  const external = state.apps.map(app => ({ id: `external-${app.id}`, name: app.title || 'Application', glyph: '●', url: app.url, subtitle: app.pwaSupported ? 'Installed WebApp' : 'WebApp', kind: 'external', source: app }));
  return [...SYSTEM_APPS, ...external];
}
function openUrl(url) { try { window.MTP2026NativePlatform?.nativeOpenExternal?.(url); } catch (_) { window.open(url, '_blank', 'noopener,noreferrer'); } }
function hideRoot(hidden) { const root = document.getElementById('root'); if (root) root.style.display = hidden ? 'none' : ''; }
function ensureRoot() { let root = document.getElementById(ROOT_ID); if (!root) { root = document.createElement('div'); root.id = ROOT_ID; document.body.appendChild(root); } return root; }
function appIcon(item) { if (item.source?.userIconUrl || item.source?.iconUrl) return `<img src="${esc(item.source.userIconUrl || item.source.iconUrl)}" alt=""/>`; return `<span>${esc(item.glyph)}</span>`; }

function renderHome() {
  const root = ensureRoot();
  const items = appItems().filter(item => { const q = state.search.trim().toLowerCase(); return !q || `${item.name} ${item.subtitle}`.toLowerCase().includes(q); });
  root.innerHTML = `
    <div class="mtp-ios-shell">
      <div class="mtp-ios-status"><span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span class="mtp-ios-status-center">MTP2026 Device</span><span>▮▮▮ ᯤ 100%</span></div>
      <div class="mtp-ios-home">
        <header class="mtp-ios-header"><div class="mtp-device-brand"><img src="${BRAND_MARK}" alt="MTP2026"><div><span class="mtp-ios-eyebrow">MTP2026 DEVICE OS</span><h1>MTP2026 Device</h1><p>${esc(profileName())}</p></div></div><button class="mtp-ios-avatar" data-action="account">${esc((profileName()[0] || 'V').toUpperCase())}</button></header>
        <div class="mtp-ios-search"><span>⌕</span><input data-search value="${esc(state.search)}" placeholder="Search MTP2026"/></div>
        <section class="mtp-ios-widget-row"><button data-action="control" class="mtp-ios-widget"><b>Control Center</b><small>Connectivity · Focus · Display</small></button><button data-action="storage" class="mtp-ios-widget"><b>Storage</b><small>${state.storage ? `${fmtBytes(state.storage.usage)} used` : 'Checking local storage…'}</small></button></section>
        <section class="mtp-ios-app-grid">${items.map(item => `<button class="mtp-ios-app" data-app="${esc(item.id)}"><span class="mtp-ios-app-icon">${appIcon(item)}</span><b>${esc(item.name)}</b><small>${esc(item.subtitle)}</small></button>`).join('')}</section>
        <div class="mtp-ios-dock"><button data-app="vexastore"><span class="mtp-ios-dock-icon store">▦</span><b>Store</b></button><button data-app="files"><span class="mtp-ios-dock-icon">▤</span><b>Files</b></button><button data-app="settings"><span class="mtp-ios-dock-icon">⚙</span><b>Settings</b></button><button data-app="browser"><span class="mtp-ios-dock-icon">◎</span><b>Browser</b></button></div>
      </div><div class="mtp-ios-home-indicator"></div>
    </div>`;
  root.querySelector('[data-search]')?.addEventListener('input', e => { state.search = e.target.value; renderHome(); const input = root.querySelector('[data-search]'); input?.focus(); input?.setSelectionRange(state.search.length, state.search.length); });
  root.querySelectorAll('[data-app]').forEach(button => button.addEventListener('click', () => openApp(button.dataset.app)));
  root.querySelectorAll('[data-action="storage"]').forEach(button => button.addEventListener('click', () => openApp('files')));
  root.querySelectorAll('[data-action="account"]').forEach(button => button.addEventListener('click', () => openApp('vexaaccount')));
  root.querySelectorAll('[data-action="control"]').forEach(button => button.addEventListener('click', () => openControlCenter()));
}

function renderSettings() {
  const root = ensureRoot(); const storage = state.storage || { usage: 0, quota: 0, memory: 0 };
  root.innerHTML = `<div class="mtp-ios-shell"><div class="mtp-ios-status"><span>‹</span><span class="mtp-ios-status-center">Settings</span><span>▮▮▮ ᯤ</span></div><main class="mtp-ios-page"><button class="mtp-ios-back" data-back>‹ MTP2026</button><h2>Settings</h2><p class="mtp-ios-subtitle">MTP2026 Device OS</p><div class="mtp-settings-profile"><div class="mtp-ios-avatar">${esc((profileName()[0] || 'V').toUpperCase())}</div><div><b>${esc(profileName())}</b><small>VexaAccount · Connected</small></div><button data-account>›</button></div><section class="mtp-settings-group"><button data-account><span class="mtp-setting-icon blue">◉</span><span><b>VexaAccount</b><small>Identity, security, recovery and account management</small></span><em>›</em></button><button data-store><span class="mtp-setting-icon violet">▦</span><span><b>VexaStore</b><small>Download and install MTP2026 WebApps</small></span><em>›</em></button></section><section class="mtp-settings-group"><button data-storage><span class="mtp-setting-icon orange">▤</span><span><b>Storage & RAM</b><small>${fmtBytes(storage.usage)} used · ${storage.memory ? `${storage.memory} GB RAM estimate` : 'RAM estimate unavailable'}</small></span><em>›</em></button><button data-system><span class="mtp-setting-icon gray">⌘</span><span><b>System</b><small>MTP2026 Device OS · ARM64 application shell</small></span><em>›</em></button><button data-display><span class="mtp-setting-icon green">☀</span><span><b>Display & Brightness</b><small>Appearance, motion and accessibility</small></span><em>›</em></button></section><section class="mtp-settings-group"><button data-coming><span class="mtp-setting-icon red">↯</span><span><b>Software Update</b><small>MTP2026 OS updates are delivered through the launcher</small></span><em>›</em></button><button data-about><span class="mtp-setting-icon dark">ⓘ</span><span><b>About This Device</b><small>Version, architecture, storage and runtime</small></span><em>›</em></button></section></main><div class="mtp-ios-home-indicator"></div></div>`;
  root.querySelectorAll('[data-back]').forEach(b => b.onclick = () => openApp('home')); root.querySelectorAll('[data-account]').forEach(b => b.onclick = () => openApp('vexaaccount')); root.querySelector('[data-store]').onclick = () => openUrl(STORE_URL); root.querySelector('[data-storage]').onclick = () => openApp('files'); root.querySelector('[data-system]').onclick = () => openSystemInfo(); root.querySelector('[data-display]').onclick = () => openModal('Display & Brightness', '<p>MTP2026 uses the current launcher theme and device accessibility preferences.</p><button data-close>Done</button>'); root.querySelector('[data-coming]').onclick = () => openModal('Software Update', '<p>Your MTP2026 OS shell is delivered as part of the launcher. Native firmware updates require a device-specific build and signed boot chain.</p><button data-close>Close</button>'); root.querySelector('[data-about]').onclick = () => openSystemInfo();
}
function openSystemInfo() { const s = state.storage || {}; openModal('About This Device', `<div class="mtp-about-grid"><b>Device name</b><span>MTP2026 Device</span><b>Operating system</b><span>MTP2026 Device OS</span><b>Architecture</b><span>ARM64</span><b>VexaAccount</b><span>${esc(profileName())}</span><b>Storage</b><span>${fmtBytes(s.usage || 0)} used / ${fmtBytes(s.quota || 0)} quota</span><b>RAM</b><span>${s.memory ? `${s.memory} GB estimated by browser` : 'Not exposed by this host'}</span></div><p class="mtp-note">MTP2026 Device OS is an MTP2026-owned OS shell/runtime. It does not claim to replace Apple firmware or the iPhone boot chain.</p><button data-close>Close</button>`); }
async function renderFiles() { await refreshStorage(); const root = ensureRoot(); const partitions = logicalPartitions(state.storage); root.innerHTML = `<div class="mtp-ios-shell"><div class="mtp-ios-status"><span>‹</span><span class="mtp-ios-status-center">Files</span><span>▮▮▮ ᯤ</span></div><main class="mtp-ios-page"><button class="mtp-ios-back" data-back>‹ MTP2026</button><div class="mtp-page-head"><div><h2>Files</h2><p>Local MTP2026 storage</p></div><button class="mtp-small-button" data-import>Import</button></div><section class="mtp-storage-summary"><div class="mtp-storage-ring"><b>${Math.min(100, state.storage.quota ? Math.round((state.storage.usage / state.storage.quota) * 100) : 0)}%</b><small>used</small></div><div><b>${fmtBytes(state.storage.usage)}</b><small>browser/native storage currently used</small><b>${fmtBytes(state.storage.quota)}</b><small>available quota exposed to MTP2026</small></div></section><section class="mtp-settings-group">${partitions.map(p => `<button data-partition="${p.id}"><span class="mtp-setting-icon blue">${p.icon}</span><span><b>${p.name}</b><small>${p.desc}</small></span><strong>${fmtBytes(p.size)}</strong><em>›</em></button>`).join('')}</section><p class="mtp-note">MTP2026 creates logical storage partitions inside its application sandbox. A browser cannot expose raw iPhone disk partitions or physical RAM directly; native Capacitor/Tauri bridges can provide deeper device access when installed.</p></main><div class="mtp-ios-home-indicator"></div></div>`; root.querySelector('[data-back]').onclick = () => openApp('home'); root.querySelector('[data-import]').onclick = () => importFiles(); root.querySelectorAll('[data-partition]').forEach(b => b.onclick = () => openPartition(b.dataset.partition)); }
function openPartition(id) { const labels = { system: 'System', user: 'User', apps: 'Applications', cache: 'Cache' }; openModal(labels[id] || 'Partition', `<p>This is a logical MTP2026 storage partition backed by the app sandbox.</p><div class="mtp-about-grid"><b>Partition</b><span>${esc(labels[id] || id)}</span><b>Backend</b><span>IndexedDB / OPFS when available</span><b>Access</b><span>User-approved application storage</span></div><button data-close>Close</button>`); }
function importFiles() { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = '*/*'; input.onchange = () => { state.files = Array.from(input.files || []); openModal('Imported files', `<p>${state.files.length} file(s) selected for the MTP2026 User partition.</p><div class="mtp-file-list">${state.files.map(f => `<div><b>${esc(f.name)}</b><span>${fmtBytes(f.size)}</span></div>`).join('')}</div><p class="mtp-note">The browser grants MTP2026 access only to files you explicitly select.</p><button data-close>Done</button>`); }; input.click(); }
function openControlCenter() { openModal('Control Center', '<div class="mtp-control-grid"><button data-close>Wi-Fi<br><small>Host controlled</small></button><button data-close>Bluetooth<br><small>Host controlled</small></button><button data-close>Focus<br><small>MTP2026</small></button><button data-close>Dark Mode<br><small>Launcher theme</small></button><button data-close>Airplane<br><small>Unavailable in Web shell</small></button><button data-close>Brightness<br><small>Host controlled</small></button></div><button data-close>Done</button>'); }
function openModal(title, body) { const root = ensureRoot(); let modal = root.querySelector('.mtp-modal'); if (!modal) { modal = document.createElement('div'); modal.className = 'mtp-modal'; root.appendChild(modal); } modal.innerHTML = `<div class="mtp-modal-card"><header><b>${esc(title)}</b><button data-close>×</button></header><section>${body}</section></div>`; modal.querySelectorAll('[data-close]').forEach(b => b.onclick = () => modal.remove()); }
function openApp(id) { if (id === 'home') { state.page = 'home'; render(); return; } const item = appItems().find(x => x.id === id); if (!item) return; state.page = item.kind; if (item.kind === 'settings') return renderSettings(); if (item.kind === 'files') return renderFiles(); if (item.kind === 'store' || item.kind === 'account' || item.kind === 'browser' || item.kind === 'external') return openUrl(item.url); if (item.kind === 'coming') return openModal(item.name, `<p>${esc(item.name)} is registered in the MTP2026 Device OS shell and will become available when its official VexaApp web service is published.</p><button data-close>Close</button>`); }
async function render() { if (!isMTP2026Mode()) { document.getElementById(ROOT_ID)?.remove(); hideRoot(false); return; } hideRoot(true); await loadSessionAndApps(); await refreshStorage(); if (state.page === 'settings') return renderSettings(); if (state.page === 'files') return renderFiles(); renderHome(); }
function syncMode() { if (isMTP2026Mode()) { if (!document.getElementById(ROOT_ID)) render(); } else { document.getElementById(ROOT_ID)?.remove(); hideRoot(false); } }
window.addEventListener('mtp2026:default-system-os', syncMode); window.addEventListener('storage', e => { if (e.key === 'mtp2026-default-system-os') syncMode(); }); const modeObserver = new MutationObserver(() => syncMode()); modeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mtpDeviceMode'] }); window.addEventListener('load', () => setTimeout(syncMode, 80)); setTimeout(syncMode, 250);
