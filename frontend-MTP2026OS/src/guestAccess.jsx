import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, LogIn, Plus, Smartphone, Monitor, Gamepad2, Trash2, Settings, Globe2, Package, UserRound, ShieldCheck, Power, Store, Grid2X2, Wifi, Bell } from 'lucide-react';
import { MTP2026_GUEST_PROFILES, normalizeMTP2026GuestProfile, applyMTP2026GuestProfile } from './mtp2026GuestProfiles.js';
import { MTP2026Arm64Firmware } from './mtp2026Arm64Firmware.jsx';
import { bootGuest, stopGuest } from './guestBootController.js';

const GUEST_PROFILES = [
  MTP2026_GUEST_PROFILES.mtp2026,
  MTP2026_GUEST_PROFILES.android,
  MTP2026_GUEST_PROFILES.desktop,
  MTP2026_GUEST_PROFILES.gaming
];
const ICONS = { mtp2026: Smartphone, android: Smartphone, desktop: Monitor, gaming: Gamepad2 };
const storageKey = id => `mtp2026:guest-apps:${id}`;
const loadApps = id => { try { const v=JSON.parse(localStorage.getItem(storageKey(id))||'[]'); return Array.isArray(v)?v:[]; } catch { return []; } };
const saveApps = (id, apps) => localStorage.setItem(storageKey(id), JSON.stringify(apps));

function AppIcon({ app }) { return app.icon ? <img src={app.icon} alt="" /> : <Globe2/>; }

export function GuestAccess({ initialProfile='mtp2026', onLogin }) {
  const [profileId,setProfileId]=useState(normalizeMTP2026GuestProfile(initialProfile).id);
  const [booted,setBooted]=useState(true);
  const [apps,setApps]=useState(()=>loadApps(normalizeMTP2026GuestProfile(initialProfile).id));
  const [url,setUrl]=useState('');
  const [apkName,setApkName]=useState('');
  const [error,setError]=useState('');
  const [panel,setPanel]=useState('home');
  const [deviceOnline,setDeviceOnline]=useState(navigator.onLine);
  const [originStorage,setOriginStorage]=useState(null);
  const [browserUrl,setBrowserUrl]=useState('https://vexaaccount-management.onrender.com');
  const [browserAddress,setBrowserAddress]=useState('https://vexaaccount-management.onrender.com');
  const [guestProvider,setGuestProvider]=useState('stopped');
  const [guestBootError,setGuestBootError]=useState('');
  const [guestRunning,setGuestRunning]=useState(false);
  const [runtimeBusy,setRuntimeBusy]=useState(false);
  const [showBootSplash,setShowBootSplash]=useState(normalizeMTP2026GuestProfile(initialProfile).id!=='mtp2026'||window.__MTP2026_SITE_PROFILE?.deviceMode==='mtp2026');

  useEffect(()=>{
    const updateOnline=()=>setDeviceOnline(navigator.onLine);
    window.addEventListener('online',updateOnline);window.addEventListener('offline',updateOnline);
    let active=true;
    if(navigator.storage?.estimate){navigator.storage.estimate().then(value=>{if(active)setOriginStorage({usage:value.usage||0,quota:value.quota||0});}).catch(()=>{if(active)setOriginStorage(null);});}
    return ()=>{active=false;window.removeEventListener('online',updateOnline);window.removeEventListener('offline',updateOnline);};
  },[]);
  const formatBytes=value=>value>=1073741824?(value/1073741824).toFixed(2)+' GB':value>=1048576?(value/1048576).toFixed(1)+' MB':Math.round(value/1024)+' KB';

  const profile=useMemo(()=>GUEST_PROFILES.find(x=>x.id===profileId)||GUEST_PROFILES[0],[profileId]);
  const Icon=ICONS[profile.id]||Smartphone;

  useEffect(()=>{
    const shouldShowSplash=profile.id!=='mtp2026'||window.__MTP2026_SITE_PROFILE?.deviceMode==='mtp2026';
    setShowBootSplash(shouldShowSplash);
    const splashTimer=shouldShowSplash?window.setTimeout(()=>setShowBootSplash(false),1450):null;
    applyMTP2026GuestProfile(profile.id);
    setApps(loadApps(profile.id));
    setBooted(true);
    setPanel('home');
    setError('');
    setGuestBootError('');
    setGuestRunning(false);
    setGuestProvider('stopped');
    return ()=>{if(splashTimer)window.clearTimeout(splashTimer);};
  },[profile.id]);

  async function startGuestExplicit(){
    if(runtimeBusy||guestRunning)return;
    setRuntimeBusy(true);setGuestBootError('');
    try{
      const state=await bootGuest(profile.id);
      if(state?.error||state?.running!==true)throw new Error(state?.error||'GUEST_BOOT_NOT_CONFIRMED');
      setGuestRunning(true);setGuestProvider(state.provider||'remote-qemu-system-aarch64');
    }catch(e){setGuestRunning(false);setGuestProvider('stopped');setGuestBootError(String(e?.message||e||'GUEST_BOOT_FAILED'));}
    finally{setRuntimeBusy(false);}
  }
  async function stopGuestExplicit(){
    if(runtimeBusy||!guestRunning)return;
    setRuntimeBusy(true);setGuestBootError('');
    try{
      const state=await stopGuest();
      if(state?.running)throw new Error(state.error||'GUEST_STOP_FAILED');
      setGuestRunning(false);setGuestProvider('stopped');
    }catch(e){setGuestBootError(String(e?.message||e||'GUEST_STOP_FAILED'));}
    finally{setRuntimeBusy(false);}
  }

  async function switchProfile(id){
    if(id===profileId)return;
    if(guestRunning){
      setRuntimeBusy(true);
      try{const state=await stopGuest();if(state?.running)throw new Error(state.error||'GUEST_STOP_FAILED');setGuestRunning(false);setGuestProvider('stopped');}
      catch(e){setGuestBootError(String(e?.message||e||'GUEST_STOP_FAILED'));return;}
      finally{setRuntimeBusy(false);}
    }
    setProfileId(id);
  }
  function addWebApp(e){
    e.preventDefault(); setError('');
    try {
      const parsed=new URL(url.trim());
      if(parsed.protocol!=='https:') throw new Error('Only HTTPS WebApp URLs are supported.');
      const next=[{id:crypto.randomUUID(),title:parsed.hostname.replace(/^www\./,''),url:parsed.toString(),type:'webapp',createdAt:new Date().toISOString()},...apps];
      setApps(next); saveApps(profile.id,next); setUrl(''); setPanel('apps');
    } catch(e){ setError(e.message||'Enter a valid HTTPS WebApp URL.'); }
  }
  function importApk(e){
    const file=e.target.files?.[0]; if(!file)return;
    if(!file.name.toLowerCase().endsWith('.apk')) { setError('Please choose an Android APK file.'); return; }
    setApkName(file.name); setError('APK package detected. Browser MTP2026 can register the package; actual APK execution requires the native Android host/runtime.');
  }
  function removeApp(id){ const next=apps.filter(x=>x.id!==id); setApps(next); saveApps(profile.id,next); }
  function navigateBrowser(e){
    e?.preventDefault?.();
    try {
      const parsed=new URL(browserAddress.trim());
      if(parsed.protocol!=='https:') throw new Error('Only HTTPS addresses are supported in MTP2026 Browser.');
      setBrowserUrl(parsed.toString()); setPanel('browser');
    } catch(e){ setError(e.message||'Enter a valid HTTPS address.'); }
  }

  if(showBootSplash) return <main className="mtp-gaming-boot mtp-os-boot-device" aria-label="MTP2026 Device OS starting"><div className="mtp-gaming-boot-orbit"><span>◆</span></div><div className="mtp-gaming-boot-kicker">MTP2026 SYSTEM STARTUP</div><h1>MTP2026 <span>DEVICE</span></h1><p>Preparing your device os workspace</p><div className="mtp-gaming-boot-track"><i/></div><small>Loading shell · profile settings · application workspace</small></main>;

  if(!booted) return <MTP2026Arm64Firmware profileId={profile.id} onReady={()=>{}} />;

  return <main className="mtp-guest-page" data-profile={profile.id}>
    <section className="mtp-guest-shell">
      <header className="mtp-guest-header">
        <div className="mtp-guest-brand"><div className="mtp-guest-brand-mark">M</div><div><strong>{profile.label}</strong><small>ARM64 device profile · MTP2026 platform · {guestProvider}</small></div></div>
        <div className="mtp-os-account"><ShieldCheck/><span><b>VexaAccount</b><small>Device identity</small></span><button disabled={runtimeBusy} onClick={guestRunning?stopGuestExplicit:startGuestExplicit}><Power/> {runtimeBusy?'Working…':guestRunning?'Stop guest':'Start guest'}</button><button onClick={onLogin}><LogIn/> Sign in</button></div>
      </header>

      <div className="mtp-guest-profile-strip">
        {GUEST_PROFILES.map(item=>{const PIcon=ICONS[item.id]||Smartphone;return <button key={item.id} type="button" className={profile.id===item.id?'active':''} onClick={()=>switchProfile(item.id)}><PIcon/><span><b>{item.shortLabel}</b><small>{item.label}</small></span></button>})}
      </div>

      <section className="mtp-os-desktop">
        <div className="mtp-os-status"><span><Wifi/> Frontend ready</span><span><ShieldCheck/> Guest: {guestRunning?'Running':'Stopped'}</span><span><ShieldCheck/> VexaAccount protected</span><span><Bell/> {guestRunning?'Guest ready':'Start required'}</span></div>
        <div className="mtp-os-hero"><div className="mtp-guest-hero-icon"><Icon/></div><div><div className="mtp-guest-kicker">MTP2026 DEVICE OS</div><h1>{profile.label}</h1><p>One MTP2026 application environment across all four ARM64 device profiles. The built-in app layer includes <b>MTP2026 Browser</b> for HTTPS WebApp/PWA use, plus <b>Android APK package handoff</b> on a compatible native host.</p></div></div>

        <nav className="mtp-os-nav">
          <button className={panel==='home'?'active':''} onClick={()=>setPanel('home')}><Grid2X2/> Home</button>
          <button className={panel==='system'?'active':''} onClick={()=>setPanel('system')}><Wifi/> System status</button>
          <button className={panel==='apps'?'active':''} onClick={()=>setPanel('apps')}><Store/> Apps</button>
          <button className={panel==='install'?'active':''} onClick={()=>setPanel('install')}><Package/> Install</button>
          <button className={panel==='browser'?'active':''} onClick={()=>setPanel('browser')}><Globe2/> Browser</button><button className={panel==='settings'?'active':''} onClick={()=>setPanel('settings')}><Settings/> Settings</button>
        </nav>

        {guestBootError&&<div className="mtp-guest-error" role="status">Guest runtime notice: {guestBootError}. No simulated OS boot is reported; check the runtime configuration and retry.</div>}

        {panel==='home' && <div className="mtp-os-home-grid">
          <button onClick={()=>setPanel('apps')}><Store/><b>Application Center</b><small>{apps.length} WebApp entries</small></button>
          <button onClick={()=>setPanel('install')}><Package/><b>APK / WebApp Install</b><small>Supported application formats</small></button>
          <button onClick={onLogin}><UserRound/><b>VexaAccount</b><small>Device account & cloud library</small></button>
          <button onClick={()=>setPanel('browser')}><Globe2/><b>MTP2026 Browser</b><small>Built-in Chromium/WebView browser workspace</small></button><button onClick={()=>setPanel('settings')}><Settings/><b>System Settings</b><small>OS profile, storage, security</small></button>
        </div>}

        {panel==='system' && <section className="mtp-os-panel mtp-device-system"><div className="mtp-os-panel-head"><div><h2>System status</h2><p>Live browser connectivity and storage estimates for this MTP2026 site. Storage figures describe this website's browser origin, not the entire device disk.</p></div><button onClick={()=>{setOriginStorage(null);if(navigator.storage?.estimate)navigator.storage.estimate().then(v=>setOriginStorage({usage:v.usage||0,quota:v.quota||0})).catch(()=>setOriginStorage(null));}}>Refresh</button></div><div className="mtp-device-system-grid"><article><Wifi/><span>Connectivity</span><b>{deviceOnline?'Online':'Offline'}</b><small>{navigator.connection?.effectiveType||'Network type unavailable'}</small></article><article><Package/><span>Browser storage used</span><b>{originStorage?formatBytes(originStorage.usage):'Unavailable'}</b><small>Current site origin usage</small></article><article><ShieldCheck/><span>Storage quota</span><b>{originStorage?formatBytes(originStorage.quota):'Unavailable'}</b><small>Browser-reported origin quota</small></article><article><Smartphone/><span>Display viewport</span><b>{window.innerWidth} × {window.innerHeight}</b><small>{window.matchMedia('(orientation: portrait)').matches?'Portrait':'Landscape'} · browser viewport</small></article></div><div className="mtp-device-system-note"><ShieldCheck/><span>Hardware disk, Bluetooth, cellular radio, and system account changes require native device permissions. This browser dashboard does not pretend to control those settings.</span></div></section>}

        {panel==='apps' && <section className="mtp-os-panel"><div className="mtp-os-panel-head"><div><h2>Applications</h2><p>Only MTP2026 WebApp/PWA entries are executed directly in the browser.</p></div><button onClick={()=>setPanel('install')}><Plus/> Add</button></div><div className="mtp-os-app-grid">{apps.map(app=><article key={app.id}><div className="mtp-os-app-icon"><AppIcon app={app}/></div><b>{app.title}</b><small>WebApp</small><div><a href={app.url} target="_blank" rel="noopener noreferrer"><ExternalLink/> Open</a><button onClick={()=>removeApp(app.id)}><Trash2/></button></div></article>)}{!apps.length&&<div className="mtp-os-empty">No applications installed. Open Install to add a WebApp/PWA.</div>}</div></section>}

        {panel==='install' && <section className="mtp-os-panel"><div className="mtp-os-panel-head"><div><h2>Install applications</h2><p>One app policy for all four MTP2026 OS profiles.</p></div></div><form className="mtp-os-install-card" onSubmit={addWebApp}><Globe2/><div><b>WebApp / PWA</b><small>Add an HTTPS application to this device profile.</small></div><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://app.example.com"/><button><Plus/> Install WebApp</button></form><label className="mtp-os-install-card"><Package/><div><b>Android APK</b><small>Register an APK for native host installation. The browser cannot execute Android APK binaries itself.</small></div><input type="file" accept=".apk,application/vnd.android.package-archive" onChange={importApk}/></label>{apkName&&<div className="mtp-os-notice"><Package/> {apkName} registered for native Android host handoff.</div>}{error&&<div className="mtp-guest-error">{error}</div>}</section>}

        {panel==='browser' && <section className="mtp-os-panel" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid rgba(125,211,252,.12)',background:'rgba(5,12,24,.96)'}}>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <Globe2 style={{width:18,height:18}}/>
              <form onSubmit={navigateBrowser} style={{display:'flex',gap:8,flex:1,minWidth:240}}>
                <input aria-label="Browser address" value={browserAddress} onChange={e=>setBrowserAddress(e.target.value)} style={{flex:1,minWidth:160,padding:'10px 12px',borderRadius:10,border:'1px solid rgba(125,211,252,.18)',background:'#091425',color:'#eef6ff'}}/>
                <button type="submit">Go</button>
              </form>
              <button type="button" onClick={()=>setBrowserAddress(browserUrl)}>Reset</button>
            </div>
            <small style={{display:'block',marginTop:8,color:'#7f93ad'}}>MTP2026 Browser is the built-in WebApp/PWA workspace. It keeps supported HTTPS applications inside the selected guest profile instead of intentionally handing them to the device's default browser.</small>
          </div>
          <iframe title="MTP2026 Browser" src={browserUrl} style={{display:'block',width:'100%',height:'min(72vh,760px)',border:0,background:'#fff'}} sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts" />
        </section>}

        {panel==='settings' && <section className="mtp-os-panel"><div className="mtp-os-settings-grid"><div><span>Device OS</span><b>{profile.label}</b></div><div><span>Architecture</span><b>ARM64 / AArch64</b></div><div><span>Account</span><b>VexaAccount</b></div><div><span>App model</span><b>WebApp/PWA + APK handoff</b></div><div><span>Cloud library</span><b>VexaAccount + MTP2026</b></div><div><span>Runtime</span><b>Remote/native QEMU · explicit Start required</b></div></div><button className="mtp-os-danger" onClick={onLogin}><Power/> Exit guest profile / use VexaAccount</button></section>}
      </section>

      <footer className="mtp-guest-footer"><span>MTP2026 · VexaAccount device identity · ARM64 profile {profile.id}</span><button onClick={onLogin}><LogIn/> Continue with VexaAccount</button></footer>
    </section>
  </main>;
}
