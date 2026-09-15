import { getMTP2026GuestProfile } from './mtp2026GuestProfiles.js';
import { getInstalledVexaApps } from './vexaStoreInstaller.js';

const SHELL_ID = 'mtp2026-guest-shell';
const MODES = ['mtp2026', 'android', 'windows11', 'gaming'];

function mode() {
  const raw = String(document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'mtp2026').toLowerCase();
  if (raw === 'ios') return 'mtp2026';
  if (raw === 'windows') return 'windows11';
  return MODES.includes(raw) ? raw : 'mtp2026';
}

function shell() { return document.getElementById(SHELL_ID); }
function esc(value) { return String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c])); }
function emit(name, detail = {}) { window.dispatchEvent(new CustomEvent(name, { detail })); }
function openUrl(url) { try { window.MTP2026NativePlatform?.nativeOpenExternal?.(url); } catch (_) { window.open(url, '_blank', 'noopener,noreferrer'); } }

function toast(message) {
  let el = document.querySelector('.mtp-guest-toast');
  if (!el) { el = document.createElement('div'); el.className = 'mtp-guest-toast'; document.body.appendChild(el); }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function modePicker() {
  const profile = getMTP2026GuestProfile(mode());
  const buttons = MODES.map(id => {
    const p = getMTP2026GuestProfile(id);
    return `<button type="button" data-switch-os="${id}" class="mtp-os-switch ${p.id === profile.id ? 'active' : ''}"><img src="/branding/mtp2026-mark.svg" alt=""><span><b>${esc(p.label)}</b><small>${esc(p.family)} · ARM64</small></span></button>`;
  }).join('');
  const wrap = document.createElement('div');
  wrap.className = 'mtp-os-switcher-backdrop';
  wrap.innerHTML = `<div class="mtp-os-switcher"><header><div><small>MTP2026 GUEST PROFILE</small><h2>Choose operating system</h2></div><button data-close>×</button></header><p>All four profiles are MTP2026-owned OS experiences. They share VexaAccount and the VexaStore application layer.</p><section>${buttons}</section></div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-close]').onclick = () => wrap.remove();
  wrap.onclick = e => { if (e.target === wrap) wrap.remove(); };
  wrap.querySelectorAll('[data-switch-os]').forEach(button => button.onclick = () => {
    const next = button.dataset.switchOs;
    localStorage.setItem('mtp2026-default-system-os', next);
    document.documentElement.dataset.mtpDeviceMode = next;
    emit('mtp2026:device-mode', { mode: next, source: 'guest-profile-switcher' });
    emit('mtp2026:default-system-os', { mode: next });
    wrap.remove();
    toast(`${getMTP2026GuestProfile(next).label} selected`);
  });
}

function showAndroidQuickSettings() {
  const panel = document.createElement('div'); panel.className = 'mtp-android-panel-backdrop';
  panel.innerHTML = `<div class="mtp-android-panel"><header><b>Quick Settings</b><button data-close>×</button></header><div class="mtp-quick-grid"><button>Wi-Fi<br><small>Connected</small></button><button>Bluetooth<br><small>On</small></button><button>Airplane<br><small>Off</small></button><button>Focus<br><small>Off</small></button><button>Dark mode<br><small>On</small></button><button data-storage>Storage<br><small>Manage</small></button></div><button class="mtp-panel-action" data-store>Open VexaStore</button><button class="mtp-panel-action" data-settings>Open Settings</button></div>`;
  document.body.appendChild(panel);
  panel.querySelector('[data-close]').onclick = () => panel.remove();
  panel.querySelector('[data-store]').onclick = () => { panel.remove(); openUrl('https://www.vexastore.2bd.net/'); };
  panel.querySelector('[data-settings]').onclick = () => { panel.remove(); emit('mtp2026:open-settings'); };
  panel.querySelector('[data-storage]').onclick = () => { panel.remove(); emit('mtp2026:open-files'); };
}

function showWindowsStart() {
  const panel = document.createElement('div'); panel.className = 'mtp-windows-start-backdrop';
  const apps = getInstalledVexaApps().slice(0, 18);
  panel.innerHTML = `<div class="mtp-windows-start"><div class="mtp-win-search">⌕ <span>Search MTP2026</span></div><h3>Pinned</h3><div class="mtp-win-apps">${apps.map(app => `<button data-url="${esc(app.url)}"><img src="${esc(app.iconUrl || '/branding/mtp2026-mark.svg')}" alt=""><span>${esc(app.name || 'VexaApp')}</span></button>`).join('') || '<small>No installed VexaApps yet.</small>'}</div><footer><button data-store>VexaStore</button><button data-settings>Settings</button><button data-switch>Switch OS</button></footer></div>`;
  document.body.appendChild(panel);
  panel.onclick = e => { if (e.target === panel) panel.remove(); };
  panel.querySelectorAll('[data-url]').forEach(b => b.onclick = () => openUrl(b.dataset.url));
  panel.querySelector('[data-store]').onclick = () => openUrl('https://www.vexastore.2bd.net/');
  panel.querySelector('[data-settings]').onclick = () => { panel.remove(); emit('mtp2026:open-settings'); };
  panel.querySelector('[data-switch]').onclick = () => { panel.remove(); modePicker(); };
}

function showGamingOverlay() {
  const panel = document.createElement('div'); panel.className = 'mtp-gaming-overlay';
  panel.innerHTML = `<div class="mtp-performance"><span>PERFORMANCE</span><b>ARM64 · MTP2026 Gaming OS</b><strong>FPS — host dependent</strong><small>GPU acceleration — host dependent</small><small>VexaStore WebApps — ${getInstalledVexaApps().length} installed</small><button data-close>Close overlay</button></div>`;
  document.body.appendChild(panel);
  panel.querySelector('[data-close]').onclick = () => panel.remove();
}

function enhance() {
  const root = shell(); if (!root) return;
  root.querySelectorAll('[data-action="switch-os"], [data-action="start-os"]').forEach(b => b.onclick = modePicker);
  if (!root.querySelector('[data-action="switch-os"]')) {
    const target = root.querySelector('header');
    if (target) { const button = document.createElement('button'); button.type='button'; button.dataset.action='switch-os'; button.className='mtp-guest-switch-os'; button.textContent='Switch OS'; target.appendChild(button); button.onclick=modePicker; }
  }
  const current = mode();
  if (current === 'android') {
    const header = root.querySelector('header');
    if (header && !header.querySelector('[data-action="quick-settings"]')) { const b=document.createElement('button'); b.dataset.action='quick-settings'; b.className='mtp-guest-quick'; b.textContent='Quick Settings'; header.appendChild(b); b.onclick=showAndroidQuickSettings; }
  }
  if (current === 'windows11') {
    const start = root.querySelector('[data-action="start"]'); if (start) start.onclick=showWindowsStart;
  }
  if (current === 'gaming') {
    const footer = root.querySelector('footer');
    if (footer && !footer.querySelector('[data-action="performance"]')) { const b=document.createElement('button'); b.dataset.action='performance'; b.textContent='Performance'; footer.appendChild(b); b.onclick=showGamingOverlay; }
  }
}

window.addEventListener('mtp2026:guest-state', () => setTimeout(enhance, 40));
window.addEventListener('mtp2026:device-mode', () => setTimeout(enhance, 80));
window.addEventListener('mtp2026:default-system-os', () => setTimeout(enhance, 80));
window.addEventListener('mtp2026:vexastore-installed', e => toast(`${e.detail?.name || 'VexaApp'} installed in MTP2026`));
window.addEventListener('mtp2026:vexastore-install-status', e => { if (e.detail?.status === 'downloading') toast('VexaStore download started…'); if (e.detail?.status === 'completed') toast('VexaStore installation completed'); });
window.addEventListener('load', () => setTimeout(enhance, 300));
setTimeout(enhance, 500);

window.MTP2026GuestShellEnhancements = Object.freeze({ modePicker, showAndroidQuickSettings, showWindowsStart, showGamingOverlay });
