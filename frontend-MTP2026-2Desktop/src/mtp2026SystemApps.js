/* Shared MTP2026 system apps used by every guest profile. */
import { getVexaSession } from './auth/vexaAuth.js';

const ROOT_ID = 'mtp2026-system-apps';
const STORE_URL = 'https://www.vexastore.2bd.net/';
const ACCOUNT_URL = 'https://vexaaccount-management.onrender.com';
const PROFILES = { mtp2026: 'MTP2026 Device OS', ios: 'MTP2026 Device OS', android: 'MTP2026 Android OS', windows: 'MTP2026 Desktop OS', windows11: 'MTP2026 Desktop OS', gaming: 'MTP2026 Gaming OS' };

function esc(v) { return String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
function mode() { const v = document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'mtp2026'; return PROFILES[v] ? v : 'mtp2026'; }
function fmt(n) { const x = Number(n || 0); if (!x) return '0 B'; const u = ['B','KB','MB','GB','TB']; const i = Math.min(Math.floor(Math.log(x) / Math.log(1024)), u.length - 1); return `${(x / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`; }
function root() { let r = document.getElementById(ROOT_ID); if (r) return r; r = document.createElement('div'); r.id = ROOT_ID; r.hidden = true; document.body.appendChild(r); return r; }
function close() { const r = root(); r.hidden = true; }
async function storage() { try { return await navigator.storage?.estimate?.() || {}; } catch (_) { return {}; } }
async function session() { try { return await getVexaSession(); } catch (_) { return null; } }

function shell(title, body) {
  const r = root();
  r.innerHTML = `<div class="mtp-system-overlay"><section class="mtp-system-card"><header><button data-close>‹</button><div><small>MTP2026 SYSTEM APP</small><h2>${esc(title)}</h2></div><button data-account>Vexa</button></header><main>${body}</main></section></div>`;
  r.hidden = false;
  r.querySelector('[data-close]').onclick = close;
  r.querySelector('[data-account]').onclick = () => window.dispatchEvent(new CustomEvent('mtp2026:open-account'));
  return r;
}

async function showSettings() {
  const s = await storage(); const user = await session();
  const profile = PROFILES[mode()];
  const r = shell('Settings', `<div class="mtp-system-profile"><b>${esc(user?.profile?.name || user?.profile?.email || 'VexaAccount User')}</b><small>VexaAccount · ${esc(profile)} · ARM64</small></div><div class="mtp-system-list"><button data-account><b>VexaAccount</b><span>SSO identity, account, applications, notifications and profile</span>›</button><button data-store><b>VexaStore</b><span>Install and update MTP2026 applications</span>›</button><button data-files><b>Storage & RAM</b><span>${fmt(s.usage)} used · ${fmt(s.quota)} quota · ${navigator.deviceMemory ? `${navigator.deviceMemory} GB RAM estimate` : 'RAM not exposed'}</span>›</button><button data-system><b>System</b><span>${esc(profile)} · MTP2026 runtime profile</span>›</button><button data-update><b>Software Update</b><span>Launcher and guest-shell updates</span>›</button><button data-diagnostics><b>Connection diagnostics</b><span>Check API health and whether the guest runtime is actually available</span>›</button><button data-about><b>About</b><span>MTP2026 App Launcher · ${esc(profile)}</span>›</button></div>`);
  r.querySelector('[data-account]').onclick = () => window.dispatchEvent(new CustomEvent('mtp2026:open-account'));
  r.querySelector('[data-store]').onclick = () => window.open(STORE_URL, '_blank', 'noopener,noreferrer');
  r.querySelector('[data-files]').onclick = showFiles;
  r.querySelector('[data-system]').onclick = () => window.dispatchEvent(new CustomEvent('mtp2026:guest-home'));
  r.querySelector('[data-update]').onclick = () => alert('MTP2026 updates are delivered through the launcher and its native packaging channel.');
  r.querySelector('[data-diagnostics]').onclick = () => { void showDiagnostics(); };
  r.querySelector('[data-about]').onclick = () => showAbout();
}


async function showDiagnostics() {
  const api = String(import.meta.env?.VITE_API_BASE_URL || 'https://mtp2026-app-launcher-backend.onrender.com').replace(/\\/$/, '');
  const checks = [
    { name: 'MTP2026 backend API', url: api + '/api/health' },
    { name: 'Guest runtime service', url: api + '/api/runtime/health' }
  ];
  const results = await Promise.all(checks.map(async item => {
    const started = performance.now();
    try {
      const response = await fetch(item.url, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const payload = await response.json().catch(() => ({}));
      return { ...item, ok: response.ok, status: response.status, elapsed: Math.round(performance.now() - started), detail: payload.message || payload.status || payload.error || (response.ok ? 'Endpoint responded' : 'Endpoint returned an error') };
    } catch (error) {
      return { ...item, ok: false, status: 0, elapsed: Math.round(performance.now() - started), detail: error?.name === 'TimeoutError' ? 'Timed out after 8 seconds' : 'Unavailable from this browser; check service, CORS, and route configuration' };
    }
  }));
  const r = shell('Connection diagnostics', `<div class="mtp-system-note">Live read-only checks from this browser. A healthy API does not prove that an ARM64 guest has booted.</div><div class="mtp-system-list">${results.map(item => `<div class="mtp-system-check"><b><i class="${item.ok ? 'ok' : 'bad'}"></i>${esc(item.name)}</b><span>${esc(item.detail)} · HTTP ${item.status || 'unreachable'} · ${item.elapsed} ms</span><small>${esc(item.url)}</small></div>`).join('')}</div><p class="mtp-system-note">Guest boot is verified only by a runtime status backed by a real execution engine and boot media. This panel does not start guests or provision services.</p><button class="mtp-system-retry" data-retry>Run checks again</button>`);
  r.querySelector('[data-retry]').onclick = () => { void showDiagnostics(); };
}

async function showFiles() {
  const s = await storage();
  const partitions = [['System', .08], ['User', .45], ['Applications', .35], ['Cache', .12]];
  const r = shell('Files', `<div class="mtp-system-storage"><b>${fmt(s.usage)} used</b><span>${fmt(s.quota)} storage quota exposed by the host</span></div><div class="mtp-system-list">${partitions.map(([name, share]) => `<button data-partition="${name}"><b>${name}</b><span>Logical MTP2026 partition · ${fmt((s.quota || 0) * share)}</span>›</button>`).join('')}</div><p class="mtp-system-note">These are MTP2026 logical storage areas. Browser mode cannot expose raw physical disk partitions or physical RAM. Native MTP2026 builds can add deeper filesystem capabilities through the platform bridge.</p>`);
  r.querySelectorAll('[data-partition]').forEach(b => b.onclick = () => alert(`${b.dataset.partition} is managed by the MTP2026 application/runtime storage layer.`));
}

async function showAbout() {
  const s = await storage(); const user = await session();
  shell('About This Device', `<div class="mtp-system-about"><b>Device</b><span>MTP2026 Device</span><b>OS</b><span>${esc(PROFILES[mode()])}</span><b>Architecture</b><span>ARM64</span><b>VexaAccount</b><span>${esc(user?.profile?.name || user?.profile?.email || 'Not signed in')}</span><b>Storage</b><span>${fmt(s.usage)} / ${fmt(s.quota)}</span><b>RAM</b><span>${navigator.deviceMemory ? `${navigator.deviceMemory} GB estimate` : 'Host does not expose RAM to browser'}</span></div>`);
}

const style = document.createElement('style');
style.textContent = `#${ROOT_ID}[hidden]{display:none}.mtp-system-overlay{position:fixed;inset:0;z-index:2147482900;background:rgba(3,7,13,.78);backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;padding:16px}.mtp-system-card{width:min(680px,100%);max-height:92vh;overflow:auto;background:#071121;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:24px;box-shadow:0 30px 100px rgba(0,0,0,.55)}.mtp-system-card header{position:sticky;top:0;display:flex;align-items:center;gap:12px;padding:15px 17px;background:rgba(7,17,33,.96);border-bottom:1px solid rgba(255,255,255,.08)}.mtp-system-card header>div{flex:1}.mtp-system-card header button{border:0;background:#102038;color:#fff;border-radius:11px;padding:8px 11px}.mtp-system-card header small{font-size:10px;color:#6e819c}.mtp-system-card header h2{margin:2px 0;font-size:20px}.mtp-system-card main{padding:17px}.mtp-system-profile,.mtp-system-storage{padding:16px;border-radius:17px;background:linear-gradient(135deg,rgba(18,200,255,.12),rgba(108,92,231,.08));border:1px solid rgba(18,200,255,.18);margin-bottom:14px}.mtp-system-profile small,.mtp-system-storage span{display:block;color:#91a2ba;margin-top:5px;font-size:12px}.mtp-system-list{display:grid;gap:9px}.mtp-system-list button{display:grid;grid-template-columns:1fr auto;gap:3px;text-align:left;border:1px solid rgba(255,255,255,.08);background:#0c192b;color:#fff;border-radius:15px;padding:13px}.mtp-system-list button span{grid-column:1;color:#91a2ba;font-size:12px}.mtp-system-check{padding:13px;border:1px solid rgba(255,255,255,.08);background:#0c192b;border-radius:14px}.mtp-system-check b{display:flex;align-items:center;gap:9px;font-size:12px}.mtp-system-check span,.mtp-system-check small{display:block;color:#91a2ba;font-size:11px;margin-top:7px;overflow-wrap:anywhere}.mtp-system-check i{width:8px;height:8px;border-radius:50%;background:#fb7185}.mtp-system-check i.ok{background:#34d399}.mtp-system-retry{margin-top:14px;border:1px solid #245a7b;background:#0b2840;color:#dff5ff;border-radius:12px;padding:11px 14px}.mtp-system-note{color:#8292a9;font-size:12px;line-height:1.5;margin-top:14px}.mtp-system-about{display:grid;grid-template-columns:150px 1fr;gap:1px 14px}.mtp-system-about b,.mtp-system-about span{padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)}.mtp-system-about span{color:#aab8c9}`;
document.head.appendChild(style);
window.addEventListener('mtp2026:open-settings', () => { void showSettings(); });
window.addEventListener('mtp2026:open-files', () => { void showFiles(); });
window.MTP2026SystemApps = Object.freeze({ openSettings: showSettings, openFiles: showFiles, openAbout: showAbout });
