import { getMTP2026GuestProfile } from './mtp2026GuestProfiles.js';
import { getInstalledVexaApps } from './vexaStoreInstaller.js';
import { nativeInstallPackage } from './nativePlatformApi.js';

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
  el.textContent = message; el.classList.add('show'); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove('show'), 3000);
}

function modePicker() {
  const profile = getMTP2026GuestProfile(mode());
  const buttons = MODES.map(id => { const p = getMTP2026GuestProfile(id); return `<button type="button" data-switch-os="${id}" class="mtp-os-switch ${p.id === profile.id ? 'active' : ''}"><img src="/branding/mtp2026-mark.svg" alt=""><span><b>${esc(p.label)}</b><small>${esc(p.family)} · ARM64</small></span>${p.id === profile.id ? '<strong>✓</strong>' : ''}</button>`; }).join('');
  const wrap = document.createElement('div'); wrap.className = 'mtp-os-switcher-backdrop';
  wrap.innerHTML = `<div class="mtp-os-switcher"><header><div><small>MTP2026 DEVICE & OS</small><h2>Choose operating system</h2></div><button data-close>×</button></header><p>Switch between all four MTP2026-owned ARM64 guest experiences. Your VexaAccount SSO session and installed WebApps remain shared.</p><section>${buttons}</section></div>`;
  document.body.appendChild(wrap); wrap.querySelector('[data-close]').onclick = () => wrap.remove(); wrap.onclick = e => { if (e.target === wrap) wrap.remove(); };
  wrap.querySelectorAll('[data-switch-os]').forEach(button => button.onclick = async () => {
    const next = button.dataset.switchOs;
    localStorage.setItem('mtp2026-default-system-os', next); document.documentElement.dataset.mtpDeviceMode = next;
    try { await window.MTP2026NativePlatform?.setNativeMode?.(next); } catch (_) {}
    emit('mtp2026:device-mode', { mode: next, source: 'guest-profile-switcher' }); emit('mtp2026:default-system-os', { mode: next }); wrap.remove(); toast(`${getMTP2026GuestProfile(next).label} selected`);
  });
}

async function installWebAppFromUrl() {
  const runtime = window.MTP2026VexaStoreRuntime;
  if (!runtime?.installWebApp) { toast('WebApp runtime is still starting. Try again in a moment.'); return; }
  const root = document.createElement('div'); root.className = 'mtp-manual-install-backdrop';
  root.innerHTML = `<div class="mtp-manual-install"><header><div><small>MTP2026 APPLICATIONS</small><h2>Install WebApp</h2></div><button data-close>×</button></header><p>Paste an HTTPS WebApp URL. The WebApp is registered for all four MTP2026 guest modes and opens inside the MTP2026 application runtime.</p><label><span>WebApp URL</span><input data-url type="url" inputmode="url" autocomplete="url" placeholder="https://example.com/app"></label><label><span>Application name <small>(optional)</small></span><input data-name maxlength="160" placeholder="My WebApp"></label><div class="mtp-manual-install-actions"><button data-cancel>Cancel</button><button data-install>Install WebApp</button></div><small data-status></small></div>`;
  document.body.appendChild(root); root.querySelector('[data-close]').onclick = () => root.remove(); root.querySelector('[data-cancel]').onclick = () => root.remove();
  root.querySelector('[data-install]').onclick = async () => {
    const url = root.querySelector('[data-url]').value.trim(); const name = root.querySelector('[data-name]').value.trim(); const status = root.querySelector('[data-status]');
    if (!/^https:\/\//i.test(url)) { status.textContent = 'Use a valid HTTPS URL.'; return; }
    status.textContent = 'Registering WebApp…';
    try {
      const app = await runtime.installWebApp({ url, name: name || undefined, title: name || undefined, source: 'Manual HTTPS WebApp', guestMode: mode(), guestModes: MODES });
      root.remove(); toast(`${app.name} installed in MTP2026`); emit('mtp2026:apps-changed', { app });
      try { runtime.openWindow(app); } catch (_) {}
    } catch (error) { status.textContent = String(error?.message || error); }
  };
}

async function installNativePackageFromUrl() {
  const root = document.createElement('div'); root.className = 'mtp-manual-install-backdrop';
  root.innerHTML = `<div class="mtp-manual-install"><header><div><small>MTP2026 NATIVE PACKAGE</small><h2>Install APK / Native App</h2></div><button data-close>×</button></header><p>Paste the HTTPS package URL. Android/Windows native hosts can hand it to their real installer. Browser mode only downloads/opens the package and never falsely reports a native installation.</p><label><span>Package URL</span><input data-url type="url" inputmode="url" placeholder="https://example.com/app.apk"></label><label><span>Package type</span><select data-type><option value="apk">Android APK</option><option value="windows">Windows package</option><option value="native">Native package</option></select></label><div class="mtp-manual-install-actions"><button data-cancel>Cancel</button><button data-install>Continue to native installer</button></div><small data-status></small></div>`;
  document.body.appendChild(root); root.querySelector('[data-close]').onclick = () => root.remove(); root.querySelector('[data-cancel]').onclick = () => root.remove();
  root.querySelector('[data-install]').onclick = async () => {
    const url = root.querySelector('[data-url]').value.trim(); const packageType = root.querySelector('[data-type]').value; const status = root.querySelector('[data-status]');
    if (!/^https:\/\//i.test(url)) { status.textContent = 'Use a valid HTTPS URL.'; return; }
    status.textContent = 'Starting host installer…';
    try {
      const result = await nativeInstallPackage(url, '', { packageType });
      status.textContent = result?.status === 'installer_started' ? 'Host installer started. User approval may be required.' : `Host handoff: ${result?.status || 'completed'}.`;
      emit('mtp2026:native-package-handoff', { url, packageType, result, mode: mode() });
    } catch (error) { status.textContent = String(error?.message || error); }
  };
}

function addSharedControls(root) {
  const target = root.querySelector('header') || root.querySelector('footer');
  if (!target) return;
  if (!root.querySelector('[data-action="switch-os"]')) { const b = document.createElement('button'); b.type='button'; b.dataset.action='switch-os'; b.className='mtp-guest-switch-os'; b.textContent='Device & OS'; target.appendChild(b); b.onclick=modePicker; }
  if (!root.querySelector('[data-action="install-webapp"]')) { const b = document.createElement('button'); b.type='button'; b.dataset.action='install-webapp'; b.className='mtp-guest-install-app'; b.textContent='Install WebApp'; target.appendChild(b); b.onclick=installWebAppFromUrl; }
  if (!root.querySelector('[data-action="install-native"]')) { const b = document.createElement('button'); b.type='button'; b.dataset.action='install-native'; b.className='mtp-guest-install-native'; b.textContent='APK / Native'; target.appendChild(b); b.onclick=installNativePackageFromUrl; }
}

function showAndroidQuickSettings() {
  const panel = document.createElement('div'); panel.className = 'mtp-android-panel-backdrop';
  panel.innerHTML = `<div class="mtp-android-panel"><header><b>Quick Settings</b><button data-close>×</button></header><div class="mtp-quick-grid"><button>Wi-Fi<br><small>Connected</small></button><button>Bluetooth<br><small>On</small></button><button>Airplane<br><small>Off</small></button><button>Focus<br><small>Off</small></button><button>Dark mode<br><small>On</small></button><button data-storage>Storage<br><small>Manage</small></button></div><button class="mtp-panel-action" data-store>Open VexaStore</button><button class="mtp-panel-action" data-settings>Open Settings</button><button class="mtp-panel-action" data-switch>Device & OS</button><button class="mtp-panel-action" data-webapp>Install WebApp</button><button class="mtp-panel-action" data-native>APK / Native</button></div>`;
  document.body.appendChild(panel); panel.querySelector('[data-close]').onclick = () => panel.remove(); panel.querySelector('[data-store]').onclick = () => { panel.remove(); openUrl('https://www.vexastore.2bd.net/'); }; panel.querySelector('[data-settings]').onclick = () => { panel.remove(); emit('mtp2026:open-settings'); }; panel.querySelector('[data-storage]').onclick = () => { panel.remove(); emit('mtp2026:open-files'); }; panel.querySelector('[data-switch]').onclick = () => { panel.remove(); modePicker(); }; panel.querySelector('[data-webapp]').onclick = () => { panel.remove(); void installWebAppFromUrl(); }; panel.querySelector('[data-native]').onclick = () => { panel.remove(); void installNativePackageFromUrl(); };
}

function showWindowsStart() {
  const panel = document.createElement('div'); panel.className = 'mtp-windows-start-backdrop'; const apps = getInstalledVexaApps().slice(0, 18);
  panel.innerHTML = `<div class="mtp-windows-start"><div class="mtp-win-search">⌕ <span>Search MTP2026</span></div><h3>Pinned</h3><div class="mtp-win-apps">${apps.map(app => `<button data-url="${esc(app.url)}"><img src="${esc(app.iconUrl || '/branding/mtp2026-mark.svg')}" alt=""><span>${esc(app.name || 'VexaApp')}</span></button>`).join('') || '<small>No installed VexaApps yet.</small>'}</div><footer><button data-store>VexaStore</button><button data-settings>Settings</button><button data-switch>Device & OS</button><button data-webapp>Install WebApp</button><button data-native>APK / Native</button></footer></div>`;
  document.body.appendChild(panel); panel.onclick = e => { if (e.target === panel) panel.remove(); }; panel.querySelectorAll('[data-url]').forEach(b => b.onclick = () => openUrl(b.dataset.url)); panel.querySelector('[data-store]').onclick = () => openUrl('https://www.vexastore.2bd.net/'); panel.querySelector('[data-settings]').onclick = () => { panel.remove(); emit('mtp2026:open-settings'); }; panel.querySelector('[data-switch]').onclick = () => { panel.remove(); modePicker(); }; panel.querySelector('[data-webapp]').onclick = () => { panel.remove(); void installWebAppFromUrl(); }; panel.querySelector('[data-native]').onclick = () => { panel.remove(); void installNativePackageFromUrl(); };
}

function showGamingOverlay() {
  const panel = document.createElement('div'); panel.className = 'mtp-gaming-overlay'; panel.innerHTML = `<div class="mtp-performance"><span>PERFORMANCE</span><b>ARM64 · MTP2026 Gaming OS</b><strong>FPS — host dependent</strong><small>GPU acceleration — host dependent</small><small>VexaStore WebApps — ${getInstalledVexaApps().length} installed</small><button data-switch>Device & OS</button><button data-webapp>Install WebApp</button><button data-native>APK / Native</button><button data-close>Close overlay</button></div>`; document.body.appendChild(panel); panel.querySelector('[data-close]').onclick = () => panel.remove(); panel.querySelector('[data-switch]').onclick = () => { panel.remove(); modePicker(); }; panel.querySelector('[data-webapp]').onclick = () => { panel.remove(); void installWebAppFromUrl(); }; panel.querySelector('[data-native]').onclick = () => { panel.remove(); void installNativePackageFromUrl(); };
}

function enhance() {
  const root = shell(); if (!root) return;
  addSharedControls(root);
  root.querySelectorAll('[data-action="switch-os"]').forEach(b => b.onclick = modePicker);
  if (mode() === 'android') { const header = root.querySelector('header'); if (header && !header.querySelector('[data-action="quick-settings"]')) { const b=document.createElement('button'); b.dataset.action='quick-settings'; b.className='mtp-guest-quick'; b.textContent='Quick Settings'; header.appendChild(b); b.onclick=showAndroidQuickSettings; } }
  if (mode() === 'windows11') { const start = root.querySelector('[data-action="start"]'); if (start) start.onclick=showWindowsStart; }
  if (mode() === 'gaming') { const footer = root.querySelector('footer'); if (footer && !footer.querySelector('[data-action="performance"]')) { const b=document.createElement('button'); b.dataset.action='performance'; b.textContent='Performance'; footer.appendChild(b); b.onclick=showGamingOverlay; } }
}

window.addEventListener('mtp2026:guest-state', () => setTimeout(enhance, 40));
window.addEventListener('mtp2026:device-mode', () => setTimeout(enhance, 80));
window.addEventListener('mtp2026:default-system-os', () => setTimeout(enhance, 80));
window.addEventListener('mtp2026:vexastore-installed', e => toast(`${e.detail?.name || 'VexaApp'} installed in MTP2026`));
window.addEventListener('mtp2026:vexastore-install-status', e => { if (e.detail?.status === 'downloading') toast('VexaStore download started…'); if (e.detail?.status === 'completed') toast('VexaStore installation completed'); });
window.addEventListener('load', () => setTimeout(enhance, 300));
setTimeout(enhance, 500);
window.MTP2026GuestShellEnhancements = Object.freeze({ modePicker, installWebAppFromUrl, installNativePackageFromUrl, showAndroidQuickSettings, showWindowsStart, showGamingOverlay });
