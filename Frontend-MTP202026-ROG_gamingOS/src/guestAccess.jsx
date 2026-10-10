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
  const [gameQuery,setGameQuery]=useState('');
  const [browserUrl,setBrowserUrl]=useState('https://vexaaccount-management.onrender.com');
  const [browserAddress,setBrowserAddress]=useState('https://vexaaccount-management.onrender.com');
  const [guestProvider,setGuestProvider]=useState('stopped');
  const [guestBootError,setGuestBootError]=useState('');
  const [guestRunning,setGuestRunning]=useState(false);
  const [runtimeBusy,setRuntimeBusy]=useState(false);
  const [showBootSplash,setShowBootSplash]=useState(normalizeMTP2026GuestProfile(initialProfile).id==='gaming');

  const profile=useMemo(()=>GUEST_PROFILES.find(x=>x.id===profileId)||GUEST_PROFILES[0],[profileId]);
  const Icon=ICONS[profile.id]||Smartphone;

  useEffect(()=>{
    setShowBootSplash(profile.id==='gaming');
    const splashTimer=profile.id==='gaming'?window.setTimeout(()=>setShowBootSplash(false),1650):null;
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
    setApkName(file.name); setError('APK selected for review, not installed. A web page cannot pass a local APK directly to Android Package Installer. Open the file from Android Files, or use a trusted APK download link inside the native MTP2026 host to start the system installer.');
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

  if(showBootSplash) return <main className="mtp-gaming-boot" aria-label="MTP2026 Gaming OS starting"><div className="mtp-gaming-boot-orbit"><span>◆</span></div><div className="mtp-gaming-boot-kicker">MTP2026 SYSTEM STARTUP</div><h1>GAMING <span>OS</span></h1><p>Preparing your play space</p><div className="mtp-gaming-boot-track"><i/></div><small>Checking interface · controller support · app library</small></main>;

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
          <button className={panel==='games'?'active':''} onClick={()=>setPanel('games')}><Gamepad2/> Game Library</button>
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

        {panel==='games' && <section className="mtp-os-panel mtp-game-library"><div className="mtp-os-panel-head"><div><h2>Game Library</h2><p>Launch HTTPS games and web applications saved to this Gaming OS profile. Some sites may block embedded play and require opening in a new tab.</p></div><button onClick={()=>setPanel('install')}><Plus/> Add game</button></div><label className="mtp-game-search"><span>⌕</span><input value={gameQuery} onChange={e=>setGameQuery(e.target.value)} placeholder="Search games and web apps..." aria-label="Search game library"/></label><div className="mtp-game-grid">{apps.filter(app=>(String(app.title||'')+' '+String(app.url||'')).toLowerCase().includes(gameQuery.trim().toLowerCase())).map(app=><article key={app.id} className="mtp-game-card"><div className="mtp-game-card-mark"><Gamepad2/></div><div className="mtp-game-card-copy"><b>{app.title||String(app.url||'Web application')}</b><small>{app.url}</small></div><button onClick={()=>{setBrowserAddress(app.url);setBrowserUrl(app.url);setPanel('browser');setError('');}} aria-label={'Launch '+(app.title||'application')}><ExternalLink/> Play</button><button className="mtp-game-remove" onClick={()=>removeApp(app.id)} aria-label={'Remove '+(app.title||'application')}><Trash2/></button></article>)}{!apps.length&&<div className="mtp-os-empty">Your game library is empty. Add an HTTPS game or web application to get started.</div>}{apps.length>0&&!apps.some(app=>(String(app.title||'')+' '+String(app.url||'')).toLowerCase().includes(gameQuery.trim().toLowerCase()))&&<div className="mtp-os-empty">No games or apps match “{gameQuery}”. Try another search.</div>}</div></section>}

        {panel==='apps' && <section className="mtp-os-panel"><div className="mtp-os-panel-head"><div><h2>Applications</h2><p>Only MTP2026 WebApp/PWA entries are executed directly in the browser.</p></div><button onClick={()=>setPanel('install')}><Plus/> Add</button></div><div className="mtp-os-app-grid">{apps.map(app=><article key={app.id}><div className="mtp-os-app-icon"><AppIcon app={app}/></div><b>{app.title}</b><small>WebApp</small><div><a href={app.url} target="_blank" rel="noopener noreferrer"><ExternalLink/> Open</a><button onClick={()=>removeApp(app.id)}><Trash2/></button></div></article>)}{!apps.length&&<div className="mtp-os-empty">No applications installed. Open Install to add a WebApp/PWA.</div>}</div></section>}

        {panel==='install' && <section className="mtp-os-panel"><div className="mtp-os-panel-head"><div><h2>Install applications</h2><p>One app policy for all four MTP2026 OS profiles.</p></div></div><form className="mtp-os-install-card" onSubmit={addWebApp}><Globe2/><div><b>WebApp / PWA</b><small>Add an HTTPS application to this device profile.</small></div><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://app.example.com"/><button><Plus/> Install WebApp</button></form><label className="mtp-os-install-card"><Package/><div><b>Android APK</b><small>Register an APK for native host installation. The browser cannot execute Android APK binaries itself.</small></div><input type="file" accept=".apk,application/vnd.android.package-archive" onChange={importApk}/></label>{apkName&&<div className="mtp-os-notice"><Package/> {apkName} selected. Not installed yet: use Android Files or a trusted native-host APK download link to open the system installer.</div>}{error&&<div className="mtp-guest-error">{error}</div>}</section>}

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
