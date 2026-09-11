/* MTP2026 guest-system runtime coordinator.
 * The launcher owns the visible splash/boot UI while guestBootController owns
 * actual execution. The launcher never reports READY unless the guest provider
 * has really started the selected ARM64 guest.
 */

import './guestBootController.js';

const MODES = {
  android: { name: 'Android', subtitle: 'ARM64 mobile guest' },
  ios: { name: 'iOS', subtitle: 'ARM64 mobile guest' },
  windows: { name: 'Windows 11', subtitle: 'ARM64 desktop guest' },
  gaming: { name: 'Gaming OS', subtitle: 'ARM64 gaming guest' },
};

let state = { mode: null, phase: 'idle', provider: 'none', ready: false, error: null };
let bootToken = 0;

function normalize(mode) {
  return mode === 'windows11' ? 'windows' : MODES[mode] ? mode : 'android';
}

function capabilities() {
  const platform = window.MTP2026NativePlatform;
  const arm64 = window.MTP2026Arm64GuestRuntime;
  return {
    nativeHost: platform?.nativeHost?.() || 'web',
    native: Boolean(platform?.nativeCapabilities?.().native),
    provider: arm64?.arm64RuntimeCapabilities?.().backend || 'none',
    physicalKernel: Boolean(window.MTP2026Native?.getArm64BootStatus?.()?.physicalOsBoot),
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
    .mtp-runtime-error{margin-top:16px;color:#ff9caa;font-size:11px;line-height:1.45}.mtp-runtime-actions{display:flex;justify-content:center;margin-top:18px}.mtp-runtime-actions button{border:1px solid rgba(148,190,255,.2);background:#101d33;color:#eef6ff;border-radius:12px;padding:9px 14px;font-weight:700;cursor:pointer}
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
  el.innerHTML = '<div class="mtp-runtime-bg"></div><div class="mtp-runtime-card"><div class="mtp-runtime-logo">M</div><div class="mtp-runtime-eyebrow">MTP2026 GUEST SYSTEM</div><div class="mtp-runtime-title">Starting system…</div><div class="mtp-runtime-subtitle">Preparing runtime</div><div class="mtp-runtime-progress"><span></span></div><div class="mtp-runtime-status">Initializing</div><div class="mtp-runtime-badge">Runtime provider: <strong>none</strong></div><div class="mtp-runtime-error" hidden></div><div class="mtp-runtime-actions"><button type="button" data-action="close">Back to systems</button></div></div>';
  el.querySelector('[data-action="close"]').addEventListener('click', stop);
  document.body.appendChild(el);
  return el;
}

function render(phase, progress, status, mode, provider, error = null) {
  const el = ensureOverlay();
  el.querySelector('.mtp-runtime-title').textContent = MODES[mode]?.name || 'MTP2026';
  el.querySelector('.mtp-runtime-subtitle').textContent = MODES[mode]?.subtitle || '';
  el.querySelector('.mtp-runtime-progress span').style.width = `${Math.max(5, Math.min(100, progress))}%`;
  el.querySelector('.mtp-runtime-status').textContent = status;
  el.querySelector('.mtp-runtime-badge strong').textContent = provider;
  const errorEl = el.querySelector('.mtp-runtime-error');
  errorEl.hidden = !error;
  errorEl.textContent = error || '';
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
  state = { mode: normalized, phase: 'splash', provider: caps.provider, ready: false, error: null };
  document.documentElement.dataset.mtpRuntime = normalized;
  render('splash', 8, `${MODES[normalized].name} splash`, normalized, caps.provider);
  await new Promise(r => setTimeout(r, 380));
  if (token !== bootToken) return state;

  state.phase = 'prepare';
  render('prepare', 24, 'Preparing guest storage and execution backend', normalized, caps.provider);
  await new Promise(r => setTimeout(r, 100));
  if (token !== bootToken) return state;

  try {
    state.phase = 'kernel';
    render('kernel', 48, 'Starting ARM64 guest execution', normalized, caps.provider);
    const guestState = await window.MTP2026GuestBoot.bootGuest(normalized, options);
    if (token !== bootToken) return state;

    state.phase = 'services';
    render('services', 82, 'Guest runtime services online', normalized, guestState.provider);
    await new Promise(r => setTimeout(r, 120));
    if (token !== bootToken) return state;

    state.phase = 'desktop';
    render('desktop', 94, `${MODES[normalized].name} guest surface ready`, normalized, guestState.provider);
    await new Promise(r => setTimeout(r, 160));
    if (token !== bootToken) return state;

    state.phase = 'ready';
    state.ready = true;
    state.provider = guestState.provider;
    hide(token);
    window.dispatchEvent(new CustomEvent('mtp2026:runtime-ready', { detail: { ...state, guestState } }));
    return state;
  } catch (error) {
    if (token !== bootToken) return state;
    state.phase = 'error';
    state.ready = false;
    state.error = String(error?.message || error || 'GUEST_BOOT_FAILED');
    render('error', 100, 'Guest did not start', normalized, caps.provider, state.error);
    window.dispatchEvent(new CustomEvent('mtp2026:runtime-error', { detail: { ...state } }));
    return state;
  }
}

function stop() {
  bootToken += 1;
  void window.MTP2026GuestBoot?.stopGuest?.().catch?.(() => {});
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
