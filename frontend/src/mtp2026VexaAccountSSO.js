/* Shared VexaAccount SSO bridge for every MTP2026-owned guest profile. */
import { getVexaSession, startVexaLogin, signOut } from './auth/vexaAuth.js';

const ROOT_ID = 'mtp2026-vexaaccount-sso';
const ACCOUNT_URL = 'https://vexaaccount-management.onrender.com';
const VALID_MODES = new Set(['mtp2026', 'ios', 'android', 'windows', 'windows11', 'gaming']);

function mode() { const value = document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'android'; return VALID_MODES.has(value) ? value : 'mtp2026'; }
function esc(v) { return String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
function profileName(session) { return session?.profile?.name || session?.profile?.email || 'VexaAccount User'; }
function openAccountCenter() { window.open(ACCOUNT_URL, '_blank', 'noopener,noreferrer'); }

function ensureStyles() {
  if (document.getElementById(`${ROOT_ID}-style`)) return;
  const style = document.createElement('style'); style.id = `${ROOT_ID}-style`;
  style.textContent = `#${ROOT_ID}{position:fixed;inset:0;z-index:2147483000;display:none;background:rgba(3,7,13,.72);backdrop-filter:blur(18px);align-items:center;justify-content:center;padding:18px}#${ROOT_ID}.open{display:flex}.mtp-sso-card{width:min(430px,100%);border:1px solid rgba(255,255,255,.12);border-radius:24px;background:linear-gradient(145deg,#0b1425,#050812);box-shadow:0 24px 80px rgba(0,0,0,.55);padding:22px;color:#fff}.mtp-sso-card h2{margin:0;font-size:20px}.mtp-sso-card p{margin:7px 0;color:#9aa8bd;font-size:13px}.mtp-sso-profile{display:flex;gap:12px;align-items:center;padding:14px;border-radius:16px;background:rgba(255,255,255,.05);margin:16px 0}.mtp-sso-avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#12c8ff,#6c5ce7);font-weight:800}.mtp-sso-actions{display:grid;gap:9px}.mtp-sso-actions button{border:1px solid rgba(255,255,255,.1);border-radius:13px;padding:11px 13px;background:#0e1a2d;color:#fff;text-align:left}.mtp-sso-actions button.primary{background:#12c8ff;color:#03101a;border-color:#12c8ff;font-weight:800}.mtp-sso-close{text-align:right}.mtp-sso-close button{background:none;border:0;color:#9aa8bd;font-size:22px}`;
  document.head.appendChild(style);
}

function ensureRoot() {
  let root = document.getElementById(ROOT_ID); if (root) return root;
  root = document.createElement('div'); root.id = ROOT_ID;
  root.innerHTML = '<div class="mtp-sso-card"><div class="mtp-sso-close"><button data-close aria-label="Close">×</button></div><h2>MTP2026 · VexaAccount</h2><p>One VexaAccount SSO session is shared across every MTP2026 OS profile.</p><div data-body></div></div>';
  document.body.appendChild(root); root.querySelector('[data-close]').onclick = () => root.classList.remove('open'); return root;
}

export async function openVexaAccountSSO(action = 'account') {
  ensureStyles(); const root = ensureRoot(); root.classList.add('open'); const body = root.querySelector('[data-body]'); body.innerHTML = '<p>Checking VexaAccount session…</p>';
  let session = null; try { session = await getVexaSession(); } catch (_) {}
  if (!session) {
    body.innerHTML = '<div class="mtp-sso-actions"><button class="primary" data-login>Continue with VexaAccount</button><button data-open>Open VexaAccount Management</button></div>';
    root.querySelector('[data-login]').onclick = () => startVexaLogin({ prompt: action === 'login' ? 'login' : '' });
    root.querySelector('[data-open]').onclick = openAccountCenter;
    return null;
  }
  const name = profileName(session);
  body.innerHTML = `<div class="mtp-sso-profile"><div class="mtp-sso-avatar">${esc(name.charAt(0).toUpperCase())}</div><div><b>${esc(name)}</b><p>VexaAccount session active · ${esc(mode())}</p></div></div><div class="mtp-sso-actions"><button class="primary" data-account>Open VexaAccount Management</button><button data-apps>Applications & sessions</button><button data-notify>Notifications</button><button data-profile>Profile & security</button><button data-logout>Sign out</button></div>`;
  root.querySelectorAll('[data-account],[data-apps],[data-notify],[data-profile]').forEach(button => { button.onclick = openAccountCenter; });
  root.querySelector('[data-logout]').onclick = async () => { await signOut(); root.classList.remove('open'); window.dispatchEvent(new CustomEvent('mtp2026:vexaaccount-signed-out')); };
  return session;
}

window.MTP2026VexaAccountSSO = Object.freeze({ open: openVexaAccountSSO });
window.addEventListener('mtp2026:open-account', () => { void openVexaAccountSSO('account'); });
