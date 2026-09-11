/* MTP2026 guest-system runtime coordinator.
 * This is the browser/native orchestration layer: it owns the visible splash,
 * boot state machine and runtime capability contract. It never pretends that
 * a web page is a real Android/iOS/Windows kernel; a native/VM provider can
 * attach through window.MTP2026Native when one is available.
 */

const MODES = {
  android: { name: 'Android', subtitle: 'ARM64 mobile runtime' },
  ios: { name: 'iOS', subtitle: 'Apple platform profile' },
  windows: { name: 'Windows 11', subtitle: 'ARM64 desktop runtime' },
  gaming: { name: 'Gaming', subtitle: 'ARM64 gaming runtime' },
};

let state = { mode: null, phase: 'idle', provider: 'launcher', ready: false, error: null };
let bootToken = 0;

function normalize(mode) {
  return mode === 'windows11' ? 'windows' : MODES[mode] ? mode : 'android';
}

function capabilities() {
  const native = window.MTP2026Native;
  const platform = window.MTP2026NativePlatform;
  return {
    nativeHost: platform?.nativeHost?.() || 'web',
    native: Boolean(platform?.nativeCapabilities?.().native),
    provider: typeof native?.bootSystem === 'function' ? 'native-runtime' : 'launcher-runtime',
    physicalKernel: Boolean(native?.getArm64BootStatus?.()?.physicalOsBoot),
  };
}

function ensureStyle() {
  if (document.getElementById('mtp2026-os-runtime-style')) return;
  const style = document.createElement('style');
  style.id = 'mtp2026-os-runtime-style';
  style.textContent = `
    #mtp2026-os-runtime{position:fixed;inset:0;z-index:2147483590;display:none;align-items:center;justify-content:center;background:#03050b;color:#eef6ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
    #mtp2026-os-runtime.show{display:flex;animation:mtp-os-in .18s ease-out}
    .mtp-runtime-bg{position:absolute;inset:-20%;background:radial-gradient(circle at 50% 40%,rgba(32,94,154,.34),transparent 34%),radial-gradient(circle at 25% 80%,rgba(74,51,153,.22),transparent 30%);animation:mtp-runtime-drift 4s ease-in-out infinite alternate}
    .mtp-runtime-card{position:relative;width:min(430px,88vw);text-align:center;padding:34px 26px;border:1px solid rgba(148,190,255,.18);border-radius:28px;background:rgba(8,18,35,.9);box-shadow:0 35px 120px rgba(0,0,0,.62)}
    .mtp-runtime-logo{width:76px;height:76px;margin:0 auto 20px;border-radius:23px;display:grid;place-items:center;background:linear-gradient(135deg,#21d4fd,#4f46e5);font-size:36px;font-weight:900;box-shadow:0 0 50px rgba(33,212,253,.2)}
    .mtp-runtime-eyebrow{font-size:10px;letter-spacing:.16em;color:#79d9ff;font-weight:800}
    .mtp-runtime-title{font-size:27px;margin:7px 0 4px;font-weight:800}.mtp-runtime-subtitle{font-size:12px;color:#91a4bd}
    .mtp-runtime-progress{height:5px;margin:25px 0 13px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}.mtp-runtime-progress span{display:block;height:100%;width:8%;border-radius:99px;background:linear-gradient(90deg,#21d4fd,#8b5cf6);transition:width .28s ease}
    .mtp-runtime-status{font-size:11px;color:#7f91aa;min-height:17px}.mtp-runtime-badge{margin-top:18px;font-size:10px;color:#a6b6cb}.mtp-runtime-badge strong{color:#b8f4df}
    @keyframes mtp-os-in{from{opacity:0}to{opacity:1}}@keyframes mtp-runtime-drift{from{transform:translate3d(-2%,0,0) scale(1)}to{transform:translate3d(2%,2%,0) scale(1.05)}}
  `;
  document.head.appendChild(style);
}

function ensureOverlay() {
  let el = document.getElementById('mtp2026-os-runtime');
  if (el) return el;
  ensureStyle();
  el = document.createElement('div');
  el.id = 'mtp2026-os-runtime';
  el.innerHTML = '<div class="mtp-runtime-bg"></div><div class="mtp-runtime-card"><div class="mtp-runtime-logo">M</div><div class="mtp-runtime-eyebrow">MTP2026 GUEST SYSTEM</div><div class="mtp-runtime-title">Starting system…</div><div class="mtp-runtime-subtitle">Preparing runtime</div><div class="mtp-runtime-progress"><span></span></div><div class="mtp-runtime-status">Initializing</div><div class="mtp-runtime-badge">Runtime provider: <strong>launcher</strong></div></div>';
  document.body.appendChild(el);
  return el;
}

function render(phase, progress, status, mode, provider) {
  const el = ensureOverlay();
  el.querySelector('.mtp-runtime-title').textContent = MODES[mode]?.name || 'MTP2026';
  el.querySelector('.mtp-runtime-subtitle').textContent = MODES[mode]?.subtitle || '';
  el.querySelector('.mtp-runtime-progress span').style.width = `${Math.max(5, Math.min(100, progress))}%`;
  el.querySelector('.mtp-runtime-status').textContent = status;
  el.querySelector('.mtp-runtime-badge strong').textContent = provider;
  el.dataset.phase = phase;
  el.classList.add('show');
}

function hide(token) {
  if (token !== bootToken) return;
  const el = document.getElementById('mtp2026-os-runtime');
  if (!el) return;
  el.classList.remove('show');
  setTimeout(() => { if (token === bootToken) el.remove(); }, 220);
}

async function boot(mode, options = {}) {
  const normalized = normalize(mode);
  const token = ++bootToken;
  const caps = capabilities();
  const provider = options.provider || caps.provider;
  state = { mode: normalized, phase: 'splash', provider, ready: false, error: null };
  document.documentElement.dataset.mtpRuntime = normalized;
  render('splash', 8, `${MODES[normalized].name} splash`, normalized, provider);
  await new Promise(r => setTimeout(r, 380));
  if (token !== bootToken) return state;

  state.phase = 'firmware'; render('firmware', 24, 'Checking runtime firmware', normalized, provider);
  await new Promise(r => setTimeout(r, 260));
  if (token !== bootToken) return state;

  state.phase = 'kernel'; render('kernel', 48, caps.physicalKernel ? 'Starting native ARM64 kernel' : 'Preparing ARM64 runtime boundary', normalized, provider);
  let nativeResult = null;
  try {
    if (typeof window.MTP2026Native?.bootSystem === 'function') {
      nativeResult = await window.MTP2026Native.bootSystem(normalized);
    }
  } catch (error) {
    state.error = String(error?.message || error);
  }
  await new Promise(r => setTimeout(r, 300));
  if (token !== bootToken) return state;

  state.phase = 'services'; render('services', 72, nativeResult ? 'Native runtime services online' : 'Launcher services online', normalized, provider);
  await new Promise(r => setTimeout(r, 260));
  if (token !== bootToken) return state;

  state.phase = 'desktop'; render('desktop', 90, `${MODES[normalized].name} workspace ready`, normalized, provider);
  await new Promise(r => setTimeout(r, 300));
  state.phase = 'ready'; state.ready = true;
  hide(token);
  window.dispatchEvent(new CustomEvent('mtp2026:runtime-ready', { detail: { ...state, nativeResult } }));
  return state;
}

function stop() {
  bootToken += 1;
  state = { ...state, phase: 'stopped', ready: false };
  document.documentElement.dataset.mtpRuntime = '';
  document.getElementById('mtp2026-os-runtime')?.remove();
}

window.MTP2026Runtime = Object.freeze({ boot, stop, getState: () => ({ ...state }), capabilities });
window.addEventListener('mtp2026:device-mode', event => { if (event.detail?.mode) void boot(event.detail.mode); });

const initial = localStorage.getItem('mtp2026-default-system-os');
if (initial && MODES[normalize(initial)]) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot(initial), { once: true });
  else void boot(initial);
}
