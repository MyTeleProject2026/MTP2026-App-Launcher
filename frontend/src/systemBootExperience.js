(() => {
  if (window.__MTP_SYSTEM_BOOT_EXPERIENCE__) return;
  window.__MTP_SYSTEM_BOOT_EXPERIENCE__ = true;
  const API = (import.meta.env?.VITE_API_BASE_URL || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
  const labels = {android:'MTP2026 Android OS',ios:'MTP2026 Device OS',windows:'MTP2026 Desktop OS',desktop:'MTP2026 Desktop OS',gaming:'MTP2026 Gaming OS'};
  let splash = null;
  let timer = null;
  let selectedMode = null;
  let authPollTimer = null;
  let authPollStarted = false;
  let bootGeneration = 0;
  const BOOT_TIMEOUT_MS = 3500;

  function remove(){bootGeneration += 1;if(timer)clearTimeout(timer);timer=null;splash?.remove();splash=null;document.body.classList.remove('mtp-system-booting');}

  async function isAuthenticated(){
    try {
      const response = await fetch(`${API}/auth/session`, { credentials:'include', headers:{Accept:'application/json'}, cache:'no-store' });
      if (!response.ok) return false;
      const data = await response.json().catch(() => null);
      return Boolean(data?.authenticated && data?.profile?.sub);
    } catch (_) { return false; }
  }

  function bootAuthenticatedMode(mode){
    if (!mode) return;
    selectedMode = mode;
    if (authPollTimer) { clearInterval(authPollTimer); authPollTimer = null; }
    authPollStarted = false;
    show(mode);
  }

  function waitForAuthentication(mode){
    selectedMode = mode;
    remove();
    if (authPollTimer || authPollStarted) return;
    authPollStarted = true;
    let attempts = 0;
    const check = async () => {
      attempts += 1;
      if (await isAuthenticated()) { bootAuthenticatedMode(mode); return; }
      if (attempts >= 120) { if (authPollTimer) clearInterval(authPollTimer); authPollTimer = null; authPollStarted = false; }
    };
    void check();
    authPollTimer = window.setInterval(check, 1000);
  }

  function show(mode){
    remove();
    const label=labels[mode] || 'MTP2026 Device OS';
    splash=document.createElement('div');
    splash.className='mtp-system-boot-splash';
    splash.innerHTML=`<div class="mtp-system-boot-mark">M</div><div class="mtp-system-boot-name">MTP2026</div><div class="mtp-system-boot-os">${label}</div><div class="mtp-system-boot-track"><i></i></div><small>ARM64 guest boot · kernel → init → compositor → MTP2026 shell</small>`;
    const style=document.createElement('style');
    style.dataset.mtpSystemBoot='1';
    style.textContent='.mtp-system-boot-splash{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;align-content:center;background:radial-gradient(circle at 50% 40%,#122a4b 0,#050914 48%,#020308 100%);color:#effaff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;animation:mtpbootin .18s ease-out;pointer-events:auto}.mtp-system-boot-mark{width:82px;height:82px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(135deg,#21d4fd,#4f46e5);font-size:40px;font-weight:900;box-shadow:0 18px 70px rgba(33,212,253,.25);animation:mtpbootpulse 1s ease-in-out infinite}.mtp-system-boot-name{margin-top:22px;font-size:24px;font-weight:850}.mtp-system-boot-os{margin-top:6px;color:#79d9ff;font-size:13px;font-weight:700}.mtp-system-boot-track{width:min(300px,72vw);height:4px;margin:24px auto 12px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}.mtp-system-boot-track i{display:block;height:100%;width:35%;background:linear-gradient(90deg,#21d4fd,#8b5cf6);animation:mtpbootbar 1.15s ease-in-out infinite}.mtp-system-boot-splash small{color:#7f93ad;font-size:10px;letter-spacing:.04em}@keyframes mtpbootpulse{0%,100%{transform:scale(.97);opacity:.86}50%{transform:scale(1);opacity:1}}@keyframes mtpbootbar{0%{transform:translateX(-120%)}100%{transform:translateX(330%)}}@keyframes mtpbootin{from{opacity:0}to{opacity:1}}';
    document.head.appendChild(style);document.body.appendChild(splash);document.body.classList.add('mtp-system-booting');
    // A browser deployment must never be held behind a native-image splash.
    // Only an actual native provider may keep this overlay waiting for a guest.
    if (!window.MTP2026NativeGuestRuntime?.bootGuest) {
      timer=setTimeout(remove, BOOT_TIMEOUT_MS);
      return;
    }
    try{localStorage.setItem('mtp2026-default-system-os',mode);}catch(_){ }
    window.dispatchEvent(new CustomEvent('mtp2026:system-boot-start',{detail:{mode,label}}));
    const runtime=window.MTP2026WebOS;
    try{runtime?.setMode?.(mode);runtime?.warmBoot?.(mode);}catch(_){ }
    const generation=bootGeneration;
    timer=setTimeout(()=>{ if(generation===bootGeneration && splash && !splash.dataset.waiting) remove(); },1500);
  }


  window.addEventListener('mtp2026:default-system-os',event=>{
    const mode=event.detail?.mode;
    if(!mode || !labels[mode]) return;
    waitForAuthentication(mode);
  });
  window.addEventListener('mtp2026:system-boot-start',event=>{ if(event.detail?.mode && !splash) show(event.detail.mode); });

  window.MTP2026SystemBoot=Object.freeze({start:show,close:remove});
})();
