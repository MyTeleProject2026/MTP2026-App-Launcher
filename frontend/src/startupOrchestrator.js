/* MTP2026 startup orchestration.
 * Contract: fresh launcher session -> choose guest OS -> VexaAccount login ->
 * selected guest runtime. The OS picker is never allowed to block the shell.
 */
const API = (import.meta.env.VITE_API_BASE_URL || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
const MODE_KEY = 'mtp2026-default-system-os';
const SESSION_SELECTION = 'mtp2026-selection-in-progress';
const MODES = Object.freeze({ android: 'Android', ios: 'iOS', windows: 'Windows 11', gaming: 'Gaming OS' });

function selected() { try { const value = sessionStorage.getItem(SESSION_SELECTION); return value && MODES[value] ? value : null; } catch (_) { return null; } }
function saveMode(mode) { try { localStorage.setItem(MODE_KEY, mode); sessionStorage.setItem(SESSION_SELECTION, mode); } catch (_) {} }
function currentMode() { try { const value = localStorage.getItem(MODE_KEY); return MODES[value] ? value : null; } catch (_) { return null; } }

function ensurePicker() {
  let picker = document.getElementById('mtp-os-picker');
  if (picker) {
    picker.classList.remove('mtp-os-hidden');
    picker.style.pointerEvents = 'auto';
    return picker;
  }
  picker = document.createElement('div'); picker.id = 'mtp-os-picker'; picker.setAttribute('role', 'dialog'); picker.setAttribute('aria-modal', 'true');
  picker.innerHTML = `<div class="mtp-os-card"><div class="mtp-os-brand"><div class="mtp-os-mark">M</div><b>MTP2026 App Launcher</b></div><div class="mtp-os-eyebrow">STARTUP · GUEST SYSTEM</div><h1 class="mtp-os-title">Choose your system</h1><p class="mtp-os-copy">Select the guest environment first. VexaAccount sign-in continues immediately after your selection.</p><div class="mtp-os-grid">${Object.entries(MODES).map(([id,name]) => `<button type="button" class="mtp-os-option" data-mtp-mode="${id}"><span class="mtp-os-logo">${id === 'android' ? '⌂' : id === 'ios' ? '●' : id === 'windows' ? '⊞' : '◆'}</span><b>${name}</b><small>ARM64 guest profile</small></button>`).join('')}</div><div class="mtp-os-foot">The selected guest is booted only after VexaAccount authentication.</div></div>`;
  const style = document.createElement('style'); style.id = 'mtp2026-startup-picker-style'; style.textContent = '#mtp-os-picker{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:radial-gradient(circle at 50% 0%,#14284a 0,#070811 48%,#03050b 100%);color:#eef6ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}#mtp-os-picker.mtp-os-hidden{display:none}.mtp-os-card{width:min(900px,100%);padding:26px;border:1px solid rgba(148,190,255,.18);border-radius:26px;background:rgba(8,18,35,.94);box-shadow:0 28px 90px rgba(0,0,0,.55)}.mtp-os-brand{display:flex;align-items:center;gap:10px}.mtp-os-mark{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#21d4fd,#4f46e5);font-weight:900}.mtp-os-eyebrow{margin-top:22px;font-size:10px;letter-spacing:.16em;color:#79d9ff;font-weight:800}.mtp-os-title{margin:5px 0 8px;font-size:32px}.mtp-os-copy{margin:0 0 20px;color:#9fb1c9;font-size:13px}.mtp-os-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.mtp-os-option{min-height:145px;padding:16px;text-align:left;border:1px solid rgba(148,190,255,.14);border-radius:18px;background:#0f1e35;color:inherit;cursor:pointer}.mtp-os-option:hover,.mtp-os-option:focus{border-color:#63daff;background:#142844;outline:none}.mtp-os-logo{width:48px;height:48px;display:grid;place-items:center;border-radius:14px;background:rgba(255,255,255,.07);font-size:24px;margin-bottom:14px}.mtp-os-option b,.mtp-os-option small{display:block}.mtp-os-option small{margin-top:5px;color:#8ea2bd;font-size:11px}.mtp-os-foot{text-align:center;margin-top:16px;color:#71849f;font-size:11px}@media(max-width:700px){.mtp-os-grid{grid-template-columns:repeat(2,1fr)}.mtp-os-card{padding:19px}.mtp-os-title{font-size:26px}}'; document.head.appendChild(style); document.body.appendChild(picker);
  picker.querySelectorAll('[data-mtp-mode]').forEach(button => button.addEventListener('click', () => { const mode = button.dataset.mtpMode; if (!MODES[mode]) return; saveMode(mode); document.documentElement.dataset.mtpDefaultSystem = mode; picker.classList.add('mtp-os-hidden'); window.dispatchEvent(new CustomEvent('mtp2026:default-system-os', { detail: { mode } })); window.dispatchEvent(new CustomEvent('mtp2026:startup-recheck', { detail: { mode } })); }));
  return picker;
}

async function session() {
  try { const response = await fetch(`${API}/auth/session`, { credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' }); if (response.status === 401) return null; return response.ok ? response.json() : null; } catch (_) { return null; }
}
async function persistServerMode(mode) { try { await fetch(`${API}/settings`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ deviceMode: mode }) }); } catch (_) {} }

async function continueAfterSelection(mode) {
  document.documentElement.dataset.mtpStartup = 'authenticating';
  const s = await session();
  if (!s?.profile) return;
  document.documentElement.dataset.mtpStartup = 'booting';
  await persistServerMode(mode);
  if (window.MTP2026Runtime?.boot) await window.MTP2026Runtime.boot(mode);
}

async function run() {
  const inProgress = selected();
  const mode = inProgress || currentMode();
  if (!inProgress) {
    const picker = ensurePicker();
    document.documentElement.dataset.mtpStartup = 'selecting';
    // A fresh launcher session must choose again; do not auto-boot a previous mode.
    return;
  }
  const picker = document.getElementById('mtp-os-picker'); if (picker) picker.classList.add('mtp-os-hidden');
  document.documentElement.dataset.mtpDefaultSystem = inProgress;
  await continueAfterSelection(inProgress);
}

window.MTP2026Startup = Object.freeze({ run, currentMode, ensurePicker });
window.addEventListener('mtp2026:startup-recheck', event => { const mode = event.detail?.mode; if (mode) void continueAfterSelection(mode); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void run(), { once: true }); else void run();
