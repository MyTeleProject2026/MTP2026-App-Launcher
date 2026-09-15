import { applyMTP2026GuestProfile, getMTP2026GuestProfile } from './mtp2026GuestProfiles.js';
import { getInstalledVexaApps, syncInstalledVexaApps } from './vexaStoreInstaller.js';

const ROOT_ID = 'mtp2026-guest-shell';
const STORE_URL = 'https://www.vexastore.2bd.net/';

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function mode() { return document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'android'; }
function openUrl(url) { try { window.MTP2026NativePlatform?.nativeOpenExternal?.(url); } catch (_) { window.open(url, '_blank', 'noopener,noreferrer'); } }

function installed() { return getInstalledVexaApps().slice(0, 12); }

async function launchVexaApp(app) {
  try {
    if (window.MTP2026UniversalOS?.openApp) {
      await window.MTP2026UniversalOS.openApp(app);
      return;
    }
  } catch (error) {
    console.warn('MTP2026 guest WebApp runtime failed; using host fallback', error);
  }
  openUrl(app.url);
}

function render() {
  const profile = getMTP2026GuestProfile(mode());
  applyMTP2026GuestProfile(profile.id);
  let root = document.getElementById(ROOT_ID);
  if (!root) { root = document.createElement('section'); root.id = ROOT_ID; document.body.appendChild(root); }
  const apps = installed();
  const appButtons = apps.map(app => `<button data-app-id="${esc(app.id || app.slug || app.url)}"><img src="${esc(app.iconUrl || '/branding/mtp2026-mark.svg')}" alt=""><span>${esc(app.name || 'VexaApp')}</span></button>`).join('');

  if (profile.layout === 'desktop') {
    root.innerHTML = `<div class="mtp-guest-desktop"><header><img src="/branding/mtp2026-mark.svg" alt="MTP2026"><strong>${esc(profile.label)}</strong><span class="mtp-guest-clock">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></header><main><aside><button data-action="start">▦ Start</button><button data-action="store">VexaStore</button><button data-action="settings">Settings</button><button data-action="files">Files</button></aside><section><div class="mtp-guest-desktop-welcome"><span>${esc(profile.shortLabel)}</span><h2>${esc(profile.label)}</h2><p>ARM64 MTP2026 guest workspace · VexaAccount session · VexaStore applications</p></div><div class="mtp-guest-apps">${appButtons || '<small>No VexaStore apps installed yet.</small>'}</div></section></main><footer><span>⌁ ${esc(profile.family)}</span><span>ARM64</span><span>VexaAccount</span></footer></div>`;
  } else if (profile.layout === 'gaming') {
    root.innerHTML = `<div class="mtp-guest-gaming"><header><img src="/branding/mtp2026-mark.svg" alt="MTP2026"><div><small>MTP2026 GAMING OS</small><strong>Game Hub</strong></div><button data-action="store">VexaStore</button></header><div class="mtp-gaming-stats"><div><b>ARM64</b><small>Guest CPU</small></div><div><b>${apps.length}</b><small>Installed apps</small></div><div><b>Vexa</b><small>Account</small></div></div><section class="mtp-gaming-apps">${appButtons || '<small>No installed VexaApps. Open VexaStore to add applications.</small>'}</section><footer><button data-action="settings">Settings</button><button data-action="files">Storage</button><button data-action="store">VexaStore</button></footer></div>`;
  } else {
    root.innerHTML = `<div class="mtp-guest-mobile"><header><div><small>${esc(profile.family.toUpperCase())}</small><strong>${esc(profile.shortLabel)}</strong></div><span>${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></header><section class="mtp-mobile-widgets"><button data-action="store"><b>VexaStore</b><small>Install VexaApps</small></button><button data-action="settings"><b>Settings</b><small>Account · Storage · OS</small></button></section><section class="mtp-mobile-apps">${appButtons || '<small>No installed VexaApps yet.</small>'}</section><nav><button data-action="home">Home</button><button data-action="store">Store</button><button data-action="files">Files</button><button data-action="settings">Settings</button></nav></div>`;
  }

  root.querySelectorAll('[data-app-id]').forEach(b => b.onclick = () => {
    const app = apps.find(item => String(item.id || item.slug || item.url) === String(b.dataset.appId));
    if (app) void launchVexaApp(app);
  });
  root.querySelectorAll('[data-action="store"]').forEach(b => b.onclick = () => openUrl(STORE_URL));
  root.querySelectorAll('[data-action="settings"]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('mtp2026:open-settings')));
  root.querySelectorAll('[data-action="files"]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('mtp2026:open-files')));
  root.querySelectorAll('[data-action="home"]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('mtp2026:guest-home')));
}

async function refreshLibraryAndRender() {
  await syncInstalledVexaApps();
  render();
}

function setVisible(visible) {
  const root = document.getElementById(ROOT_ID);
  if (root) root.hidden = !visible;
}

window.addEventListener('mtp2026:guest-state', event => {
  const state = event.detail || {};
  if (state.phase === 'ready' && state.running) { render(); setVisible(true); refreshLibraryAndRender().catch(() => {}); }
  if (['stopped','error','needs-install'].includes(state.phase)) setVisible(false);
});
window.addEventListener('mtp2026:device-mode', () => refreshLibraryAndRender().catch(() => render()));
window.addEventListener('mtp2026:default-system-os', () => refreshLibraryAndRender().catch(() => render()));
window.addEventListener('mtp2026:vexastore-installed', () => refreshLibraryAndRender().catch(() => render()));
window.addEventListener('mtp2026:vexastore-library-synced', render);

new MutationObserver(() => {
  const root = document.getElementById(ROOT_ID);
  if (root && root.hidden === false) root.querySelector('.mtp-guest-clock');
}).observe(document.documentElement, { childList:true, subtree:true });

render();
refreshLibraryAndRender().catch(() => {});
