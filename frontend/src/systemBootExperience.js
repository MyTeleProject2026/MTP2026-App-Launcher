(() => {
  if (window.__MTP_SYSTEM_BOOT_EXPERIENCE__) return;
  window.__MTP_SYSTEM_BOOT_EXPERIENCE__ = true;
  const API = (import.meta.env?.VITE_API_BASE_URL || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
  const labels = {android:'Android',ios:'iOS',windows:'Windows 11',gaming:'Gaming'};
  let splash = null;
  let timer = null;
  let selectedMode = null;
  let authPollTimer = null;
  let authPollStarted = false;

  function remove(){if(timer)clearTimeout(timer);timer=null;splash?.remove();splash=null;document.body.classList.remove('mtp-system-booting');}

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
    const label=labels[mode] || 'MTP2026';
    splash=document.createElement('div');
    splash.className='mtp-system-boot-splash';
    splash.innerHTML=`<div class="mtp-system-boot-mark">M</div><div class="mtp-system-boot-name">MTP2026</div><div class="mtp-system-boot-os">${label} environment</div><div class="mtp-system-boot-track"><i></i></div><small>ARM64 guest boot · kernel → init → compositor</small>`;
    const style=document.createElement('style');
    style.dataset.mtpSystemBoot='1';
    style.textContent='.mtp-system-boot-splash{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;align-content:center;background:radial-gradient(circle at 50% 40%,#122a4b 0,#050914 48%,#020308 100%);color:#effaff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;animation:mtpbootin .18s ease-out;pointer-events:auto}.mtp-system-boot-mark{width:82px;height:82px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(135deg,#21d4fd,#4f46e5);font-size:40px;font-weight:900;box-shadow:0 18px 70px rgba(33,212,253,.25);animation:mtpbootpulse 1s ease-in-out infinite}.mtp-system-boot-name{margin-top:22px;font-size:24px;font-weight:850}.mtp-system-boot-os{margin-top:6px;color:#79d9ff;font-size:13px;font-weight:700}.mtp-system-boot-track{width:min(300px,72vw);height:4px;margin:24px auto 12px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}.mtp-system-boot-track i{display:block;height:100%;width:35%;background:linear-gradient(90deg,#21d4fd,#8b5cf6);animation:mtpbootbar 1.15s ease-in-out infinite}.mtp-system-boot-splash small{color:#7f93ad;font-size:10px;letter-spacing:.04em}.mtp-system-boot-error{margin-top:18px;max-width:min(420px,82vw);padding:12px 14px;border:1px solid rgba(125,211,252,.2);border-radius:14px;background:rgba(5,11,21,.82);color:#a9bed6;font-size:11px;line-height:1.5}.mtp-system-boot-actions{display:flex;gap:8px;justify-content:center;margin-top:12px}.mtp-system-boot-actions button{border:0;border-radius:10px;padding:9px 13px;background:#123c4d;color:#e6f7ff;font-weight:750;cursor:pointer}.mtp-system-boot-actions button.secondary{background:#132238}@keyframes mtpbootpulse{0%,100%{transform:scale(.97);opacity:.86}50%{transform:scale(1);opacity:1}}@keyframes mtpbootbar{0%{transform:translateX(-120%)}100%{transform:translateX(330%)}}@keyframes mtpbootin{from{opacity:0}to{opacity:1}}';
    document.head.appendChild(style);document.body.appendChild(splash);document.body.classList.add('mtp-system-booting');
    try{localStorage.setItem('mtp2026-default-system-os',mode);}catch(_){ }
    window.dispatchEvent(new CustomEvent('mtp2026:system-boot-start',{detail:{mode,label}}));
    const runtime=window.MTP2026WebOS;
    try{runtime?.setMode?.(mode);runtime?.warmBoot?.(mode);}catch(_){ }
    timer=setTimeout(()=>{ if(splash && !splash.dataset.waiting) remove(); },1500);
  }

  function showRecovery(event, code){
    const id=event?.detail?.id || event?.detail?.mode || selectedMode || 'guest';
    const label=labels[id] || id;
    if(!splash) show(id);
    if(!splash) return;
    splash.dataset.waiting='1';
    clearTimeout(timer); timer=null;
    const small=splash.querySelector('small');
    if(small) small.textContent='Guest image required · launcher remains interactive';
    let error=splash.querySelector('.mtp-system-boot-error');
    if(!error){error=document.createElement('div');error.className='mtp-system-boot-error';splash.appendChild(error);}
    error.innerHTML=`<b>${label} guest image is not installed</b><br>${String(code || 'REAL_GUEST_IMAGE_NOT_INSTALLED').replace(/[<>]/g,'')}<div class="mtp-system-boot-actions"><button type="button" data-boot-close>Return to launcher</button><button type="button" class="secondary" data-boot-retry>Check again</button></div>`;
    error.querySelector('[data-boot-close]').onclick=remove;
    error.querySelector('[data-boot-retry]').onclick=()=>{remove();window.dispatchEvent(new CustomEvent('mtp2026:default-system-os',{detail:{mode:id}}));};
  }

  window.addEventListener('mtp2026:default-system-os',event=>{
    const mode=event.detail?.mode;
    if(!mode || !labels[mode]) return;
    // OS selection must never cover the VexaAccount login screen. The real guest
    // boot begins only after the backend-managed VexaAccount session exists.
    waitForAuthentication(mode);
  });
  window.addEventListener('mtp2026:system-boot-start',event=>{ if(event.detail?.mode && !splash) show(event.detail.mode); });
  window.addEventListener('mtp2026:guest-image-required',event=>showRecovery(event,event.detail?.code));
  window.addEventListener('mtp2026:guest-boot-error',event=>showRecovery(event,event.detail?.error));
  window.addEventListener('mtp2026-webos-boot-error',event=>showRecovery(event,event.detail?.error?.message || event.detail?.error));
  window.MTP2026SystemBoot=Object.freeze({start:show,close:remove});
})();
