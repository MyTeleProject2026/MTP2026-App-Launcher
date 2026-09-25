/* MTP2026 guest OS interaction layer.
 * Adds operational desktop/mobile/gaming controls on top of the existing
 * guest shell without replacing its boot, account, store, or app contracts.
 * It is intentionally MTP2026-owned UI/runtime logic; it does not emulate or
 * redistribute proprietary Apple, Microsoft, ASUS/ROG, or Google firmware.
 */

const ROOT = 'mtp2026-guest-shell';
const APPS_KEY = 'mtp2026-installed-vexastore-apps-v3';
const SETTINGS_KEY = 'mtp2026-guest-settings-v1';

const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
const getMode = () => {
  const mode = document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'android';
  return mode === 'windows' ? 'desktop' : mode === 'ios' ? 'mtp2026' : mode;
};
const apps = () => { try { return JSON.parse(localStorage.getItem(APPS_KEY) || '[]'); } catch (_) { return []; } };
const settings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (_) { return {}; } };
const saveSettings = value => localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));

function style() {
  if (document.getElementById('mtp2026-os-runtime-style')) return;
  const s = document.createElement('style');
  s.id = 'mtp2026-os-runtime-style';
  s.textContent = `
#${ROOT} .mtp-os-runtime-layer{position:fixed;inset:0;z-index:2147482400;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#eef6ff}
#${ROOT} .mtp-os-runtime-layer>*{pointer-events:auto}
#${ROOT} .mtp-os-overlay{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding:7vh 14px;background:rgba(2,6,13,.62);backdrop-filter:blur(16px)}
#${ROOT} .mtp-os-overlay.open{display:flex}
#${ROOT} .mtp-os-panel{width:min(760px,100%);max-height:86vh;overflow:auto;border:1px solid rgba(148,190,255,.18);border-radius:22px;background:#081223;box-shadow:0 28px 90px rgba(0,0,0,.65);padding:18px}
#${ROOT} .mtp-os-panel h2{margin:0;font-size:20px}.mtp-os-panel p{color:#94a6bf;font-size:12px;margin:5px 0 14px}
#${ROOT} .mtp-os-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.mtp-os-card{border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#0e1a2d;padding:12px;color:#eef6ff;text-align:left}.mtp-os-card b{display:block;font-size:13px}.mtp-os-card small{display:block;color:#8496ae;font-size:10px;margin-top:3px}
#${ROOT} .mtp-os-actions{display:flex;gap:8px;margin-top:14px}.mtp-os-actions button,.mtp-os-panel button{border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#122039;color:#eef6ff;padding:9px 11px}
#${ROOT} .mtp-os-taskbar{position:fixed;left:10px;right:10px;bottom:10px;display:flex;align-items:center;gap:6px;padding:7px;border:1px solid rgba(255,255,255,.1);border-radius:15px;background:rgba(7,15,28,.88);backdrop-filter:blur(18px)}
#${ROOT} .mtp-os-taskbar button{border:0;border-radius:9px;background:transparent;color:#eef6ff;padding:8px 10px}.mtp-os-taskbar button:hover{background:rgba(255,255,255,.08)}.mtp-os-taskbar .spacer{flex:1}.mtp-os-taskbar small{color:#91a4bd}
#${ROOT} .mtp-os-window{position:fixed;left:7vw;top:8vh;width:min(820px,86vw);height:min(600px,72vh);display:none;flex-direction:column;border:1px solid rgba(255,255,255,.14);border-radius:17px;background:#081223;box-shadow:0 30px 100px rgba(0,0,0,.7);overflow:hidden}.mtp-os-window.open{display:flex}.mtp-os-window header{display:flex;align-items:center;gap:8px;padding:9px 11px;background:#0e1a2d}.mtp-os-window header b{flex:1;font-size:12px}.mtp-os-window header button{border:0;background:transparent;color:#fff}.mtp-os-window .body{flex:1;overflow:auto;padding:14px}
#${ROOT} .mtp-os-mobile-shade{position:fixed;inset:0;display:none;background:rgba(2,6,13,.72);backdrop-filter:blur(18px);padding:16px}.mtp-os-mobile-shade.open{display:block}.mtp-os-mobile-card{margin-top:0;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:#091426;padding:16px}.mtp-os-toggle{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.mtp-os-toggle button{padding:13px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:#102039;color:#fff;text-align:left}.mtp-os-toggle small{display:block;color:#8496ae;margin-top:3px}
#${ROOT} .mtp-os-game-hud{position:fixed;right:14px;top:14px;display:none;gap:7px}.mtp-os-game-hud.open{display:flex}.mtp-os-game-hud span{padding:7px 9px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(5,12,23,.82);font-size:10px}
@media(max-width:700px){#${ROOT} .mtp-os-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mtp-os-window{left:3vw;top:7vh;width:94vw;height:78vh}.mtp-os-taskbar{left:6px;right:6px;bottom:6px}}
`;
  document.head.appendChild(s);
}

function layer() {
  let root = document.getElementById('mtp2026-os-runtime-layer');
  if (root) return root;
  root = document.createElement('div'); root.id = 'mtp2026-os-runtime-layer'; root.className = 'mtp-os-runtime-layer';
  root.innerHTML = `
    <div class="mtp-os-overlay" data-overlay="start"><div class="mtp-os-panel"><h2>MTP2026 Start</h2><p>Applications, system tools and guest controls.</p><input data-start-search placeholder="Search apps and settings" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:#050b15;color:#fff"><div class="mtp-os-grid" data-start-grid style="margin-top:10px"></div><div class="mtp-os-actions"><button data-close>Close</button></div></div></div>
    <div class="mtp-os-overlay" data-overlay="settings"><div class="mtp-os-panel"><h2>MTP2026 Settings</h2><p>Guest display, sound, notifications, storage and profile controls.</p><div class="mtp-os-grid"><button class="mtp-os-card" data-setting="orientation"><b>Display orientation</b><small data-value="orientation">Auto</small></button><button class="mtp-os-card" data-setting="brightness"><b>Brightness</b><small data-value="brightness">100%</small></button><button class="mtp-os-card" data-setting="sound"><b>Sound</b><small data-value="sound">On</small></button><button class="mtp-os-card" data-setting="notifications"><b>Notifications</b><small data-value="notifications">On</small></button><button class="mtp-os-card" data-setting="storage"><b>Guest storage</b><small>Local MTP2026 storage</small></button><button class="mtp-os-card" data-setting="account"><b>VexaAccount</b><small>Open account center</small></button><button class="mtp-os-card" data-setting="device"><b>Device & OS</b><small>Switch guest profile</small></button><button class="mtp-os-card" data-setting="fullscreen"><b>Fullscreen</b><small>Enter MTP2026 fullscreen</small></button><button class="mtp-os-card" data-setting="power"><b>Power</b><small>Stop current guest</small></button></div><div class="mtp-os-actions"><button data-close>Close</button></div></div></div>
    <div class="mtp-os-overlay" data-overlay="files"><div class="mtp-os-panel"><h2>This PC · MTP2026 Storage</h2><p>Virtual guest folders backed by the MTP2026 storage layer.</p><div class="mtp-os-grid"><button class="mtp-os-card"><b>🖥 Desktop</b><small>Guest desktop files</small></button><button class="mtp-os-card"><b>📄 Documents</b><small>User documents</small></button><button class="mtp-os-card"><b>⬇ Downloads</b><small>Downloaded files</small></button><button class="mtp-os-card"><b>🖼 Pictures</b><small>Images and media</small></button><button class="mtp-os-card"><b>🎵 Music</b><small>Audio library</small></button><button class="mtp-os-card"><b>🎮 Games</b><small>Game data</small></button><button class="mtp-os-card"><b>☁ MTP2026 Cloud</b><small>Account-backed storage</small></button><button class="mtp-os-card"><b>💾 Device Storage</b><small>Local guest storage</small></button></div><div class="mtp-os-actions"><button data-close>Close</button></div></div></div>
    <div class="mtp-os-mobile-shade" data-mobile-center><div class="mtp-os-mobile-card"><h2>Control Center</h2><p>Quick controls for the MTP2026 mobile guest.</p><div class="mtp-os-toggle"><button data-quick="wifi"><b>Network</b><small>Connected</small></button><button data-quick="bluetooth"><b>Bluetooth</b><small>Ready</small></button><button data-quick="rotation"><b>Rotation</b><small>Auto</small></button><button data-quick="dnd"><b>Do Not Disturb</b><small>Off</small></button><button data-quick="sound"><b>Sound</b><small>On</small></button><button data-quick="battery"><b>Power</b><small>Guest battery</small></button></div><div class="mtp-os-actions"><button data-mobile-close>Close</button></div></div></div>
    <div class="mtp-os-window" data-window="app"><header><b data-window-title>VexaApp</b><button data-window-min>—</button><button data-window-close>×</button></header><div class="body" data-window-body></div></div>
    <div class="mtp-os-game-hud" data-game-hud><span>ARM64 · 60 FPS</span><span>GPU Guest</span><span>PERFORMANCE</span></div>
    <div class="mtp-os-taskbar" data-desktop-bar><button data-start>▦</button><button data-files>📁</button><button data-store>VexaStore</button><button data-account>Vexa</button><span class="spacer"></span><small data-clock></small><button data-settings>⚙</button></div>`;
  document.body.appendChild(root);
  bind(root);
  return root;
}

function openOverlay(name) { layer().querySelector(`[data-overlay="${name}"]`)?.classList.add('open'); }
function closeOverlays() { layer().querySelectorAll('.mtp-os-overlay,.mtp-os-mobile-shade').forEach(x => x.classList.remove('open')); }

function openApp(app) {
  const root = layer(); const win = root.querySelector('[data-window="app"]');
  root.querySelector('[data-window-title]').textContent = app.name || app.title || 'VexaApp';
  const url = String(app.url || '').trim();
  root.querySelector('[data-window-body]').innerHTML = url.startsWith('https://') ? `<iframe title="${esc(app.name || 'VexaApp')}" src="${esc(url)}" style="width:100%;height:100%;min-height:420px;border:0;border-radius:10px;background:#fff"></iframe>` : '<p>App manifest does not contain a valid HTTPS WebApp URL.</p>';
  win.classList.add('open');
}

function startMenu() {
  const root = layer(); const grid = root.querySelector('[data-start-grid]');
  const base = [
    { name:'Settings', action:()=>openOverlay('settings') },
    { name:'This PC', action:()=>openOverlay('files') },
    { name:'Device & OS', action:()=>window.dispatchEvent(new CustomEvent('mtp2026:open-device-os')) },
    { name:'VexaAccount', action:()=>window.dispatchEvent(new CustomEvent('mtp2026:open-account')) },
    { name:'VexaStore', action:()=>window.open('https://www.vexastore.2bd.net/','_blank','noopener,noreferrer') },
  ];
  grid.innerHTML = base.map((x,i)=>`<button class="mtp-os-card" data-start-item="${i}"><b>${esc(x.name)}</b><small>MTP2026 system service</small></button>`).join('') + apps().slice(0,18).map((a,i)=>`<button class="mtp-os-card" data-app-item="${i}"><b>${esc(a.name || a.title || 'VexaApp')}</b><small>Installed WebApp</small></button>`).join('');
  grid.querySelectorAll('[data-start-item]').forEach((b,i)=>b.onclick=()=>{ closeOverlays(); base[i].action(); });
  grid.querySelectorAll('[data-app-item]').forEach((b,i)=>b.onclick=()=>{ closeOverlays(); openApp(apps()[i]); });
  root.querySelector('[data-start-search]').value='';
  openOverlay('start');
}

function applySetting(key) {
  const current = settings();
  if (key === 'orientation') current.orientation = current.orientation === 'landscape' ? 'portrait' : 'landscape';
  if (key === 'brightness') current.brightness = current.brightness === 100 ? 70 : 100;
  if (key === 'sound') current.sound = current.sound === false ? true : false;
  if (key === 'notifications') current.notifications = current.notifications === false ? true : false;
  saveSettings(current); refreshSettings();
  if (key === 'orientation') document.documentElement.dataset.mtpGuestOrientation = current.orientation;
}
function refreshSettings() {
  const s = settings(); const root = layer();
  root.querySelector('[data-value="orientation"]').textContent = s.orientation || 'Auto';
  root.querySelector('[data-value="brightness"]').textContent = `${s.brightness ?? 100}%`;
  root.querySelector('[data-value="sound"]').textContent = s.sound === false ? 'Off' : 'On';
  root.querySelector('[data-value="notifications"]').textContent = s.notifications === false ? 'Off' : 'On';
}

function bind(root) {
  root.querySelector('[data-start]').onclick = startMenu;
  root.querySelector('[data-files]').onclick = () => openOverlay('files');
  root.querySelector('[data-settings]').onclick = () => openOverlay('settings');
  root.querySelector('[data-account]').onclick = () => window.dispatchEvent(new CustomEvent('mtp2026:open-account'));
  root.querySelector('[data-store]').onclick = () => window.open('https://www.vexastore.2bd.net/','_blank','noopener,noreferrer');
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = closeOverlays);
  root.querySelector('[data-mobile-close]').onclick = closeOverlays;
  root.querySelector('[data-window-close]').onclick = () => root.querySelector('[data-window="app"]').classList.remove('open');
  root.querySelector('[data-window-min]').onclick = () => root.querySelector('[data-window="app"]').classList.remove('open');
  root.querySelectorAll('[data-setting]').forEach(b => b.onclick = () => {
    const key = b.dataset.setting;
    if (['orientation','brightness','sound','notifications'].includes(key)) return applySetting(key);
    if (key === 'account') return window.dispatchEvent(new CustomEvent('mtp2026:open-account'));
    if (key === 'device') return window.dispatchEvent(new CustomEvent('mtp2026:open-device-os'));
    if (key === 'fullscreen') return window.MTP2026Runtime?.enterMTPFullscreen?.(document.documentElement);
    if (key === 'power') return window.MTP2026GuestBoot?.stopGuest?.();
  });
  root.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => b.classList.toggle('active'));
  root.querySelector('[data-start-search]').oninput = event => {
    const query = event.target.value.toLowerCase();
    root.querySelectorAll('[data-start-grid] .mtp-os-card').forEach(card => { card.hidden = query && !card.textContent.toLowerCase().includes(query); });
  };
}

function renderMode() {
  const root = layer();
  const mode = getMode();
  root.querySelector('[data-desktop-bar]').style.display = mode === 'desktop' ? 'flex' : 'none';
  root.querySelector('[data-game-hud]').classList.toggle('open', mode === 'gaming');
  if (mode !== 'gaming') root.querySelector('[data-game-hud]').classList.remove('open');
  if (mode === 'android' || mode === 'mtp2026') {
    if (!document.getElementById('mtp-mobile-center-trigger')) {
      const trigger = document.createElement('button'); trigger.id='mtp-mobile-center-trigger'; trigger.textContent='⌄ Control Center';
      trigger.style.cssText='position:fixed;right:12px;top:8px;z-index:2147482401;border:0;border-radius:10px;padding:7px 9px;background:rgba(8,18,35,.72);color:#fff;font-size:10px';
      trigger.onclick=()=>root.querySelector('[data-mobile-center]').classList.add('open'); document.body.appendChild(trigger);
    }
  } else document.getElementById('mtp-mobile-center-trigger')?.remove();
}

function tick() { const node = layer().querySelector('[data-clock]'); if (node) node.textContent = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }

function boot() {
  style(); layer(); refreshSettings(); renderMode(); tick();
  setInterval(tick, 30000);
  window.addEventListener('mtp2026:device-mode', renderMode);
  window.addEventListener('mtp2026:guest-state', event => { if (event.detail?.phase === 'ready') renderMode(); });
  window.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); startMenu(); }
    if (event.key === 'Escape') closeOverlays();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
window.MTP2026GuestOSRuntime = Object.freeze({ openStart:startMenu, openSettings:()=>openOverlay('settings'), openFiles:()=>openOverlay('files'), openApp });
