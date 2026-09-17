/* Shared VexaAccount SSO bridge for every MTP2026-owned guest profile. */
import { getVexaSession, startVexaLogin, signOut, api } from './auth/vexaAuth.js';

const ROOT_ID = 'mtp2026-vexaaccount-sso';
const VALID_MODES = new Set(['mtp2026', 'ios', 'android', 'windows', 'windows11', 'gaming']);

function mode() { const value = document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'android'; return VALID_MODES.has(value) ? (value === 'ios' ? 'mtp2026' : value === 'windows' ? 'windows11' : value) : 'mtp2026'; }
function esc(v) { return String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
function profileName(session) { return session?.profile?.name || session?.profile?.email || 'VexaAccount User'; }
function emit(name, detail={}) { window.dispatchEvent(new CustomEvent(name,{detail})); }

function ensureStyles() {
  if (document.getElementById(`${ROOT_ID}-style`)) return;
  const style = document.createElement('style'); style.id = `${ROOT_ID}-style`;
  style.textContent = `#${ROOT_ID}{position:fixed;inset:0;z-index:2147483000;display:none;background:rgba(3,7,13,.72);backdrop-filter:blur(18px);align-items:center;justify-content:center;padding:18px}#${ROOT_ID}.open{display:flex}.mtp-sso-card{width:min(560px,100%);max-height:min(760px,92vh);overflow:auto;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:linear-gradient(145deg,#0b1425,#050812);box-shadow:0 24px 80px rgba(0,0,0,.55);padding:22px;color:#fff}.mtp-sso-card h2{margin:0;font-size:20px}.mtp-sso-card p{margin:7px 0;color:#9aa8bd;font-size:13px}.mtp-sso-profile{display:flex;gap:12px;align-items:center;padding:14px;border-radius:16px;background:rgba(255,255,255,.05);margin:16px 0}.mtp-sso-avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#12c8ff,#6c5ce7);font-weight:800}.mtp-sso-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.mtp-sso-actions button{border:1px solid rgba(255,255,255,.1);border-radius:13px;padding:11px 13px;background:#0e1a2d;color:#fff;text-align:left}.mtp-sso-actions button.primary{background:#12c8ff;color:#03101a;border-color:#12c8ff;font-weight:800}.mtp-sso-close{text-align:right}.mtp-sso-close button{background:none;border:0;color:#9aa8bd;font-size:22px}.mtp-sso-panel{margin-top:15px;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.035)}.mtp-sso-panel h3{margin:0 0 9px;font-size:15px}.mtp-sso-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px}.mtp-sso-row:last-child{border-bottom:0}.mtp-sso-row span{color:#9aa8bd}.mtp-sso-list{display:grid;gap:8px}.mtp-sso-note{font-size:11px!important;color:#7f91a9!important}.mtp-sso-back{margin-top:12px;width:100%;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px;background:#0e1a2d;color:#fff}@media(max-width:560px){.mtp-sso-card{padding:16px;border-radius:18px}.mtp-sso-actions{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}

function ensureRoot() {
  let root = document.getElementById(ROOT_ID); if (root) return root;
  root = document.createElement('div'); root.id = ROOT_ID;
  root.innerHTML = '<div class="mtp-sso-card"><div class="mtp-sso-close"><button data-close aria-label="Close">×</button></div><h2>MTP2026 · VexaAccount SSO</h2><p>VexaAccount identity is provided through the MTP2026 SSO integration. Account surfaces stay inside this launcher.</p><div data-body></div></div>';
  document.body.appendChild(root); root.querySelector('[data-close]').onclick = () => root.classList.remove('open'); return root;
}

async function requestLogin(prompt='') { startVexaLogin(prompt ? { prompt } : {}); }

async function fetchNotifications() {
  const response = await api('/notifications?limit=50');
  const data = await response.json().catch(()=>[]);
  if (!response.ok) throw new Error(data.error || `NOTIFICATIONS_FAILED_${response.status}`);
  return Array.isArray(data) ? data : [];
}

function panelButton(root, label, handler) { const b=document.createElement('button'); b.className='mtp-sso-back'; b.textContent=label; b.onclick=handler; root.querySelector('[data-body]').appendChild(b); }

async function showNotifications(root) {
  const body=root.querySelector('[data-body]'); body.innerHTML='<p>Loading notifications…</p>';
  try { const items=await fetchNotifications(); body.innerHTML=`<div class="mtp-sso-panel"><h3>Notifications</h3><div class="mtp-sso-list">${items.map(n=>`<div class="mtp-sso-row"><div><b>${esc(n.title)}</b><div>${esc(n.message)}</div></div><span>${n.readAt?'Read':'New'}</span></div>`).join('')||'<p>No notifications yet.</p>'}</div><button class="mtp-sso-back" data-readall>Mark all as read</button>`; body.querySelector('[data-readall]').onclick=async()=>{const r=await api('/notifications/read-all',{method:'POST'}); if(!r.ok) throw new Error('NOTIFICATIONS_UPDATE_FAILED'); await showNotifications(root);}; panelButton(root,'Back to VexaAccount',()=>renderAccount(root)); } catch(e) { body.innerHTML=`<p>${esc(e.message||e)}</p>`; panelButton(root,'Back to VexaAccount',()=>renderAccount(root)); }
}

function showProfile(root, session) {
  const p=session?.profile||{}; const body=root.querySelector('[data-body]');
  body.innerHTML=`<div class="mtp-sso-panel"><h3>Profile</h3><div class="mtp-sso-row"><span>Name</span><b>${esc(p.name||'Not supplied')}</b></div><div class="mtp-sso-row"><span>Email</span><b>${esc(p.email||'Not supplied')}</b></div><div class="mtp-sso-row"><span>VexaAccount subject</span><b>${esc(p.sub||'')}</b></div></div><div class="mtp-sso-panel"><h3>Security</h3><p>Your identity and authentication are handled by the VexaAccount SSO provider. Use the sign-in flow for password, MFA, recovery and verification operations.</p><button class="mtp-sso-back" data-reauth>Re-authenticate with VexaAccount</button></div>`;
  body.querySelector('[data-reauth]').onclick=()=>requestLogin('login'); panelButton(root,'Back to VexaAccount',()=>renderAccount(root));
}

function showSessions(root, session) {
  const body=root.querySelector('[data-body]'); body.innerHTML=`<div class="mtp-sso-panel"><h3>Sessions</h3><div class="mtp-sso-row"><span>Current MTP2026 session</span><b>Active</b></div><div class="mtp-sso-row"><span>OS mode</span><b>${esc(mode())}</b></div><div class="mtp-sso-row"><span>Identity</span><b>${esc(profileName(session))}</b></div><p class="mtp-sso-note">MTP2026 exposes the authenticated launcher session here. Session revocation remains available through the VexaAccount SSO sign-in flow.</p></div>`; panelButton(root,'Back to VexaAccount',()=>renderAccount(root));
}

function renderLogin(root) {
  const body=root.querySelector('[data-body]'); body.innerHTML='<div class="mtp-sso-actions"><button class="primary" data-login>Sign in with VexaAccount</button><button data-register>Create VexaAccount</button><button data-forgot>Forgot password</button><button data-otp>Resend verification / OTP</button><button data-help>Help with sign-in</button></div><p class="mtp-sso-note">These actions use the registered VexaAccount SSO authorization flow; no VexaAccount frontend-user website is opened by MTP2026.</p>';
  body.querySelector('[data-login]').onclick=()=>requestLogin('login'); body.querySelector('[data-register]').onclick=()=>requestLogin('register'); body.querySelector('[data-forgot]').onclick=()=>requestLogin('forgot_password'); body.querySelector('[data-otp]').onclick=()=>requestLogin('resend_otp'); body.querySelector('[data-help]').onclick=()=>requestLogin('help');
}

function renderAccount(root, session) {
  if (!session) return renderLogin(root);
  const name=profileName(session); const body=root.querySelector('[data-body]');
  body.innerHTML=`<div class="mtp-sso-profile"><div class="mtp-sso-avatar">${esc(name.charAt(0).toUpperCase())}</div><div><b>${esc(name)}</b><p>VexaAccount SSO active · ${esc(mode())}</p></div></div><div class="mtp-sso-actions"><button class="primary" data-profile>Profile</button><button data-notify>Notifications</button><button data-session>Current session</button><button data-switch>Account switcher</button><button data-email>Email & identity</button><button data-security>Security & verification</button><button data-login>Sign in again</button><button data-logout>Sign out</button></div>`;
  body.querySelector('[data-profile]').onclick=()=>showProfile(root,session); body.querySelector('[data-notify]').onclick=()=>showNotifications(root); body.querySelector('[data-session]').onclick=()=>showSessions(root,session); body.querySelector('[data-switch]').onclick=()=>requestLogin('login'); body.querySelector('[data-email]').onclick=()=>showProfile(root,session); body.querySelector('[data-security]').onclick=()=>showProfile(root,session); body.querySelector('[data-login]').onclick=()=>requestLogin('login'); body.querySelector('[data-logout]').onclick=async()=>{await signOut(); root.classList.remove('open'); emit('mtp2026:vexaaccount-signed-out');};
}

export async function openVexaAccountSSO(action = 'account') {
  ensureStyles(); const root=ensureRoot(); root.classList.add('open'); const body=root.querySelector('[data-body]'); body.innerHTML='<p>Checking VexaAccount SSO session…</p>';
  let session=null; try { session=await getVexaSession(); } catch (_) {}
  if (!session && action !== 'account') { renderLogin(root); return null; }
  renderAccount(root,session); return session;
}

window.MTP2026VexaAccountSSO=Object.freeze({open:openVexaAccountSSO});
window.addEventListener('mtp2026:open-account',()=>{void openVexaAccountSSO('account');});
