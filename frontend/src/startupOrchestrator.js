const SESSION_API = (import.meta.env.VITE_API_BASE_URL || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
const SESSION_KEY = 'mtp2026-startup-session';
const MODE_KEY = 'mtp2026-default-system-os';
const VALID_MODES = new Set(['android', 'ios', 'windows', 'gaming']);

function getRoot() { return document.documentElement; }
function getPicker() { return document.getElementById('mtp-os-picker'); }
function savedMode() { const mode = localStorage.getItem(MODE_KEY); return VALID_MODES.has(mode) ? mode : null; }

function createOverlay() {
  let el = document.getElementById('mtp2026-boot-orchestrator');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'mtp2026-boot-orchestrator';
  el.innerHTML = `<div class="mtp-boot-card">
    <div class="mtp-boot-mark">M</div>
    <div class="mtp-boot-eyebrow">MTP2026 STARTUP</div>
    <h1 id="mtp-boot-title">Starting MTP2026…</h1>
    <p id="mtp-boot-copy">Restoring launcher session and checking ARM64 boot readiness.</p>
    <div class="mtp-boot-steps">
      <div data-step="session"><i></i><span>VexaAccount session</span><b>Checking…</b></div>
      <div data-step="arm64"><i></i><span>ARM64 boot readiness</span><b>Waiting…</b></div>
      <div data-step="system"><i></i><span>System mode</span><b>Waiting…</b></div>
    </div>
    <button id="mtp-boot-continue" type="button" hidden>Continue</button>
  </div>`;
  const style = document.createElement('style');
  style.id = 'mtp2026-boot-orchestrator-style';
  style.textContent = `#mtp2026-boot-orchestrator{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:18px;background:radial-gradient(circle at 50% 35%,#152c50 0,#070811 52%,#03050b 100%);color:#eef6ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;transition:opacity .25s ease,visibility .25s ease}#mtp2026-boot-orchestrator.mtp-boot-hidden{opacity:0;visibility:hidden;pointer-events:none}.mtp-boot-card{width:min(520px,100%);padding:28px;border:1px solid rgba(148,190,255,.18);border-radius:26px;background:rgba(8,18,35,.92);box-shadow:0 30px 100px rgba(0,0,0,.55);backdrop-filter:blur(24px)}.mtp-boot-mark{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,#21d4fd,#4f46e5);font-size:28px;font-weight:900;box-shadow:0 12px 36px rgba(33,212,253,.24);margin-bottom:20px}.mtp-boot-eyebrow{font-size:10px;letter-spacing:.16em;font-weight:800;color:#79d9ff}.mtp-boot-card h1{font-size:24px;margin:7px 0 7px}.mtp-boot-card>p{font-size:13px;line-height:1.55;color:#9fb1c9;margin:0 0 20px}.mtp-boot-steps{display:grid;gap:8px}.mtp-boot-steps>div{display:grid;grid-template-columns:10px 1fr auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid rgba(148,190,255,.10);border-radius:12px;background:rgba(255,255,255,.035);font-size:12px}.mtp-boot-steps i{width:8px;height:8px;border-radius:50%;background:#64748b}.mtp-boot-steps b{font-size:10px;color:#8192aa;font-weight:600}.mtp-boot-steps .done i{background:#43e0a3;box-shadow:0 0 10px rgba(67,224,163,.45)}.mtp-boot-steps .ready i{background:#22d3ee;box-shadow:0 0 10px rgba(34,211,238,.45)}.mtp-boot-steps .blocked i{background:#f5c86b}.mtp-boot-steps .done b,.mtp-boot-steps .ready b{color:#b8f4df}.mtp-boot-steps .blocked b{color:#f6d895}.mtp-boot-card button{margin-top:16px;width:100%;border:0;border-radius:12px;padding:11px;background:linear-gradient(135deg,#21d4fd,#4f46e5);color:white;font-weight:800;cursor:pointer}`;
  document.head.appendChild(style);
  document.body.appendChild(el);
  return el;
}

function step(name, state, label) {
  const el = document.querySelector(`#mtp2026-boot-orchestrator [data-step="${name}"]`);
  if (!el) return;
  el.className = state;
  const b = el.querySelector('b');
  if (b) b.textContent = label;
}

function setText(title, copy) {
  const root = document.getElementById('mtp2026-boot-orchestrator');
  if (!root) return;
  root.querySelector('#mtp-boot-title').textContent = title;
  root.querySelector('#mtp-boot-copy').textContent = copy;
}

function hideOverlay() {
  const el = document.getElementById('mtp2026-boot-orchestrator');
  if (!el) return;
  el.classList.add('mtp-boot-hidden');
  window.setTimeout(() => { el.remove(); document.getElementById('mtp2026-boot-orchestrator-style')?.remove(); }, 280);
}

function hidePicker() { getPicker()?.classList.add('mtp-os-hidden'); }
function showPicker() { const picker = getPicker(); if (picker && savedMode() === null) picker.classList.remove('mtp-os-hidden'); }

async function getSession() {
  try {
    const response = await fetch(`${SESSION_API}/auth/session`, { credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(`AUTH_SESSION_${response.status}`);
    return await response.json();
  } catch (error) {
    return { __error: error };
  }
}

async function getArm64BootStatus() {
  try {
    const native = window.MTP2026Native;
    if (native?.getArm64BootStatus) {
      const raw = native.getArm64BootStatus();
      const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return value || { state: 'unknown' };
    }
  } catch (_) {}
  const host = window.MTP2026NativePlatform?.nativeHost?.() || 'web';
  const architecture = navigator.userAgentData?.architecture || navigator.platform || 'unknown';
  return { state: 'launcher-host-ready', host, architecture, physicalOsBoot: false, kernelControl: false };
}

function persistState(session, arm64) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ checkedAt: Date.now(), authenticated: Boolean(session?.profile), arm64: arm64?.state || 'unknown' }));
}

async function run() {
  const overlay = createOverlay();
  hidePicker();
  getRoot().dataset.mtpStartup = 'checking';

  const session = await getSession();
  if (session?.__error) {
    setText('MTP2026 is offline', 'The launcher could not reach the VexaAccount session service. The normal sign-in screen remains available.');
    step('session', 'blocked', 'Service unavailable');
    step('arm64', '', 'Waiting for sign-in');
    step('system', '', 'Waiting for sign-in');
    const btn = overlay.querySelector('#mtp-boot-continue');
    btn.hidden = false; btn.textContent = 'Open sign-in'; btn.onclick = hideOverlay;
    return;
  }

  if (!session?.profile) {
    step('session', 'blocked', 'Sign-in required');
    step('arm64', '', 'After sign-in');
    step('system', '', 'After sign-in');
    setText('Sign in to MTP2026', 'Use VexaAccount SSO first. After authentication, MTP2026 will automatically re-check ARM64 boot readiness and continue to system selection.');
    const btn = overlay.querySelector('#mtp-boot-continue');
    btn.hidden = false; btn.textContent = 'Continue to VexaAccount'; btn.onclick = hideOverlay;
    const poll = window.setInterval(async () => {
      const next = await getSession();
      if (next?.profile) { window.clearInterval(poll); hideOverlay(); void run(); }
    }, 1500);
    return;
  }

  step('session', 'done', 'Authenticated');
  setText('Checking ARM64 boot…', 'Preparing the native host and validating what the current device can actually boot.');
  const arm64 = await getArm64BootStatus();
  persistState(session, arm64);
  const physical = arm64?.physicalOsBoot === true;
  const nativeReady = arm64?.state === 'native-arm64-ready' || arm64?.state === 'launcher-host-ready' || arm64?.state === 'guest-arm64-ready';
  if (nativeReady) step('arm64', 'ready', physical ? 'Device boot target ready' : 'Host ready');
  else step('arm64', 'blocked', arm64?.state || 'Unavailable');

  const mode = savedMode();
  if (mode) {
    step('system', 'done', `${mode} selected`);
    setText('Starting MTP2026…', physical ? 'ARM64 boot target is ready. Restoring your selected system mode.' : 'ARM64 host readiness is confirmed. Restoring your selected launcher mode.');
    getRoot().dataset.mtpStartup = 'ready';
    window.setTimeout(hideOverlay, 350);
    return;
  }

  step('system', 'ready', 'Choose a mode');
  setText('Choose your MTP2026 system', physical ? 'ARM64 boot target is ready. Choose the system mode to open.' : 'Choose the launcher system mode. Physical phone-kernel boot is device-specific and is not claimed by the launcher until a compatible boot target is installed.');
  getRoot().dataset.mtpStartup = 'selecting';
  showPicker();
  window.addEventListener('mtp2026:default-system-os', () => {
    step('system', 'done', 'Selected');
    getRoot().dataset.mtpStartup = 'ready';
    hideOverlay();
  }, { once: true });
  window.setTimeout(hideOverlay, 500);
}

window.MTP2026Startup = { run, getArm64BootStatus };
window.addEventListener('mtp2026:startup-recheck', () => void run());

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void run(), { once: true });
else void run();
