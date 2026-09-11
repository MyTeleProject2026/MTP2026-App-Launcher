(() => {
  if (window.__MTP_SYSTEM_BOOT_EXPERIENCE__) return;
  window.__MTP_SYSTEM_BOOT_EXPERIENCE__ = true;
  const labels = {android:'Android',ios:'iOS',windows:'Windows 11',gaming:'Gaming'};
  let splash = null;
  let timer = null;
  function remove(){if(timer)clearTimeout(timer);timer=null;splash?.remove();splash=null;}
  function show(mode){
    remove();
    const label=labels[mode] || 'MTP2026';
    splash=document.createElement('div');
    splash.className='mtp-system-boot-splash';
    splash.innerHTML=`<div class="mtp-system-boot-mark">M</div><div class="mtp-system-boot-name">MTP2026</div><div class="mtp-system-boot-os">${label} environment</div><div class="mtp-system-boot-track"><i></i></div><small>ARM64 guest boot · kernel → init → compositor</small>`;
    const style=document.createElement('style');
    style.dataset.mtpSystemBoot='1';
    style.textContent='.mtp-system-boot-splash{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;align-content:center;background:radial-gradient(circle at 50% 40%,#122a4b 0,#050914 48%,#020308 100%);color:#effaff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;animation:mtpbootin .18s ease-out}.mtp-system-boot-mark{width:82px;height:82px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(135deg,#21d4fd,#4f46e5);font-size:40px;font-weight:900;box-shadow:0 18px 70px rgba(33,212,253,.25);animation:mtpbootpulse 1s ease-in-out infinite}.mtp-system-boot-name{margin-top:22px;font-size:24px;font-weight:850}.mtp-system-boot-os{margin-top:6px;color:#79d9ff;font-size:13px;font-weight:700}.mtp-system-boot-track{width:min(300px,72vw);height:4px;margin:24px auto 12px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}.mtp-system-boot-track i{display:block;height:100%;width:35%;background:linear-gradient(90deg,#21d4fd,#8b5cf6);animation:mtpbootbar 1.15s ease-in-out infinite}.mtp-system-boot-splash small{color:#7f93ad;font-size:10px;letter-spacing:.04em}@keyframes mtpbootpulse{0%,100%{transform:scale(.97);opacity:.86}50%{transform:scale(1);opacity:1}}@keyframes mtpbootbar{0%{transform:translateX(-120%)}100%{transform:translateX(330%)}}@keyframes mtpbootin{from{opacity:0}to{opacity:1}}';
    document.head.appendChild(style);document.body.appendChild(splash);
    try{localStorage.setItem('mtp2026-default-system-os',mode);}catch(_){ }
    window.dispatchEvent(new CustomEvent('mtp2026:system-boot-start',{detail:{mode,label}}));
    const runtime=window.MTP2026WebOS;
    try{runtime?.setMode?.(mode);runtime?.warmBoot?.(mode);}catch(_){ }
    timer=setTimeout(()=>{document.querySelector('[data-mtp-system-boot-style]')?.remove();splash?.remove();splash=null;},900);
  }
  window.addEventListener('mtp2026:default-system-os',event=>show(event.detail?.mode));
  window.addEventListener('mtp2026:system-boot-start',event=>{ if(event.detail?.mode && !splash) show(event.detail.mode); });
  window.MTP2026SystemBoot=Object.freeze({start:show,close:remove});
})();
