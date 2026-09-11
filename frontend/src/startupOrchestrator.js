const SESSION_API = (import.meta.env.VITE_API_BASE_URL || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
const SESSION_KEY = 'mtp2026-startup-session';
const MODE_KEY = 'mtp2026-default-system-os';
const VALID_MODES = new Set(['android','ios','windows','gaming']);
const SESSION_TIMEOUT_MS = 1800;
const MAX_STARTUP_BLOCK_MS = 2200;

function root(){return document.documentElement;}
function picker(){return document.getElementById('mtp-os-picker');}
function savedMode(){try{const value=localStorage.getItem(MODE_KEY);return VALID_MODES.has(value)?value:null;}catch(_){return null;}}
function overlay(){let el=document.getElementById('mtp2026-boot-orchestrator');if(el)return el;el=document.createElement('div');el.id='mtp2026-boot-orchestrator';el.innerHTML='<div class="mtp-boot-card"><div class="mtp-boot-mark">M</div><div class="mtp-boot-eyebrow">MTP2026 STARTUP</div><h1 id="mtp-boot-title">Starting MTP2026…</h1><p id="mtp-boot-copy">Preparing the launcher without blocking the application shell.</p><div class="mtp-boot-steps"><div data-step="session"><i></i><span>VexaAccount session</span><b>Checking…</b></div><div data-step="arm64"><i></i><span>ARM64 runtime</span><b>Starting in background…</b></div><div data-step="system"><i></i><span>System mode</span><b>Preparing…</b></div></div></div>';const style=document.createElement('style');style.id='mtp2026-boot-orchestrator-style';style.textContent='#mtp2026-boot-orchestrator{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:18px;background:radial-gradient(circle at 50% 35%,#152c50 0,#070811 52%,#03050b 100%);color:#eef6ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;transition:opacity .2s,visibility .2s}.mtp-boot-card{width:min(520px,100%);padding:26px;border:1px solid rgba(148,190,255,.18);border-radius:24px;background:rgba(8,18,35,.94);box-shadow:0 30px 100px rgba(0,0,0,.55)}.mtp-boot-mark{width:56px;height:56px;border-radius:17px;display:grid;place-items:center;background:linear-gradient(135deg,#21d4fd,#4f46e5);font-size:27px;font-weight:900}.mtp-boot-eyebrow{margin-top:16px;font-size:10px;letter-spacing:.16em;font-weight:800;color:#79d9ff}.mtp-boot-card h1{font-size:23px;margin:7px 0}.mtp-boot-card>p{font-size:13px;line-height:1.5;color:#9fb1c9;margin:0 0 18px}.mtp-boot-steps{display:grid;gap:7px}.mtp-boot-steps>div{display:grid;grid-template-columns:9px 1fr auto;gap:9px;align-items:center;padding:10px;border:1px solid rgba(148,190,255,.1);border-radius:11px;background:rgba(255,255,255,.035);font-size:12px}.mtp-boot-steps i{width:8px;height:8px;border-radius:50%;background:#64748b}.mtp-boot-steps .done i,.mtp-boot-steps .ready i{background:#43e0a3;box-shadow:0 0 9px rgba(67,224,163,.4)}.mtp-boot-steps .blocked i{background:#f5c86b}.mtp-boot-steps b{font-size:10px;color:#8192aa;font-weight:600}.mtp-boot-steps .done b,.mtp-boot-steps .ready b{color:#b8f4df}';document.head.appendChild(style);document.body.appendChild(el);return el;}
function step(name,state,label){const el=document.querySelector(`#mtp2026-boot-orchestrator [data-step="${name}"]`);if(!el)return;el.className=state;const b=el.querySelector('b');if(b)b.textContent=label;}
function text(title,copy){const el=document.getElementById('mtp2026-boot-orchestrator');if(!el)return;el.querySelector('#mtp-boot-title').textContent=title;el.querySelector('#mtp-boot-copy').textContent=copy;}
function hide(){const el=document.getElementById('mtp2026-boot-orchestrator');if(!el)return;el.style.opacity='0';el.style.visibility='hidden';el.style.pointerEvents='none';setTimeout(()=>{el.remove();document.getElementById('mtp2026-boot-orchestrator-style')?.remove();},220);}
function hidePicker(){picker()?.classList.add('mtp-os-hidden');}
function showPicker(){const p=picker();if(p&&savedMode()===null)p.classList.remove('mtp-os-hidden');}
async function session(){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),SESSION_TIMEOUT_MS);try{const r=await fetch(`${SESSION_API}/auth/session`,{credentials:'include',headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});if(r.status===401)return null;if(!r.ok)throw new Error(`AUTH_SESSION_${r.status}`);return await r.json();}catch(error){return{__error:error};}finally{clearTimeout(timer);}}
async function settings(){try{const r=await fetch(`${SESSION_API}/settings`,{credentials:'include',headers:{Accept:'application/json'},cache:'no-store'});return r.ok?await r.json().catch(()=>null):null;}catch(_){return null;}}
async function saveMode(mode){try{const r=await fetch(`${SESSION_API}/settings`,{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({deviceMode:mode})});return r.ok;}catch(_){return false;}}
function normalize(value){return value==='windows11'?'windows':value;}
async function selectedMode(serverSettings){const local=savedMode();const server=normalize(serverSettings?.deviceMode);if(local){document.documentElement.dataset.mtpDefaultSystem=local;void saveMode(local);return local;}if(VALID_MODES.has(server)){try{localStorage.setItem(MODE_KEY,server);}catch(_){}document.documentElement.dataset.mtpDefaultSystem=server;return server;}return null;}
async function arm64(){try{const native=window.MTP2026Native;if(native?.getArm64BootStatus){const value=native.getArm64BootStatus();return typeof value==='string'?JSON.parse(value):value;}}catch(_){}return{state:'launcher-host-ready',host:window.MTP2026NativePlatform?.nativeHost?.()||'web',architecture:navigator.userAgentData?.architecture||navigator.platform||'unknown',physicalOsBoot:false,kernelControl:false,virtualArm64:true};}
function persist(s,a){try{localStorage.setItem(SESSION_KEY,JSON.stringify({checkedAt:Date.now(),authenticated:Boolean(s?.profile),arm64:a?.state||'unknown',virtualArm64:a?.virtualArm64!==false}));}catch(_){} }
async function run(){
  const el=overlay();hidePicker();root().dataset.mtpStartup='checking';
  const hardStop=setTimeout(()=>{root().dataset.mtpStartup='ready';hide();},MAX_STARTUP_BLOCK_MS);
  try{
    const s=await session();
    if(s?.__error){step('session','blocked','Service slow — continuing');step('arm64','ready','Available in background');step('system','ready','Launcher remains interactive');text('MTP2026 is ready','The network is slow, so startup continues without waiting for Render/VexaAccount.');setTimeout(hide,180);return;}
    if(!s?.profile){step('session','blocked','Sign-in required');step('arm64','ready','Available after sign-in');step('system','ready','Choose after sign-in');text('Sign in to MTP2026','VexaAccount authentication can continue without blocking the launcher shell.');setTimeout(hide,180);return;}
    step('session','done','Authenticated');
    const [prefs,a]=await Promise.all([settings(),arm64()]);persist(s,a);step('arm64',a?.state?'ready':'blocked',a?.physicalOsBoot?'Native ARM64 ready':'Virtual ARM64 ready');
    const mode=await selectedMode(prefs);
    if(mode){step('system','done',`${mode} selected`);root().dataset.mtpStartup='ready';setTimeout(hide,120);return;}
    step('system','ready','Choose a mode');text('Choose your MTP2026 system','Pick Android, iOS, Windows 11 or Gaming. The selected MTP2026 ARM64 guest boots after the splash.');root().dataset.mtpStartup='selecting';showPicker();setTimeout(hide,350);
  }finally{clearTimeout(hardStop);root().dataset.mtpStartup='ready';}
}
window.MTP2026Startup={run,arm64};
window.addEventListener('mtp2026:startup-recheck',()=>void run());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void run(),{once:true});else void run();
