import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell, ChevronDown, File, Folder, FolderOpen, Globe2, Grid2X2, HardDrive,
  Monitor, Power, Search, Settings, ShieldCheck, Store, Terminal, UserRound,
  Wifi, X, Minus, Maximize2, RefreshCw, Download, Cpu, Activity, LockKeyhole, ServerCog, CheckCircle2
} from 'lucide-react';
import { MTP2026_DESKTOP_BRANDING } from './mtp2026DesktopBranding.js';
import { bootDesktopOS, shutdownDesktopOS } from './mtp2026DesktopBootManager.js';
import { getDesktopServices, restartDesktopServices } from './mtp2026DesktopServiceManager.js';
import { createDesktopTextFile, getDesktopFilesystem } from './mtp2026DesktopFilesystem.js';

const APPS = [
  { id:'files', title:'File Explorer', icon:FolderOpen },
  { id:'settings', title:'Settings', icon:Settings },
  { id:'browser', title:'MTP2026 Browser', icon:Globe2 },
  { id:'store', title:'VexaStore', icon:Store },
  { id:'terminal', title:'Terminal', icon:Terminal },
  { id:'system', title:'System Monitor', icon:Activity },
];

const STORAGE_KEY='mtp2026-desktop-files-v1';

function readFiles(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch { return {}; }
}
function writeFiles(v){ try { localStorage.setItem(STORAGE_KEY,JSON.stringify(v)); } catch {} }

function WindowFrame({title,icon:Icon,children,onClose,onMinimize,onMaximize,maximized=false}){
  return <section className={`mtp11-window ${maximized?'maximized':''}`}>
    <header className="mtp11-window-titlebar">
      <div className="mtp11-window-title"><Icon/><b>{title}</b></div>
      <div className="mtp11-window-controls">
        <button onClick={onMinimize} aria-label="Minimize"><Minus/></button>
        <button onClick={onMaximize} aria-label="Maximize"><Maximize2/></button>
        <button className="close" onClick={onClose} aria-label="Close"><X/></button>
      </div>
    </header>
    <div className="mtp11-window-body">{children}</div>
  </section>;
}

function FileExplorer(){
  const [files,setFiles]=useState(readFiles);
  const [nativeFs,setNativeFs]=useState(getDesktopFilesystem);
  const [folder,setFolder]=useState('This PC');
  const folders=['Desktop','Documents','Downloads','Pictures','Music','Videos','MTP2026 Cloud'];
  const refresh=()=>{setFiles(readFiles());setNativeFs(getDesktopFilesystem())};
  const createFile=()=>{
    const target=folder==='This PC'?'Documents':folder;
    const result=createDesktopTextFile(target);
    setNativeFs(result.fs);
    const next={...files,[result.file.name]:result.file.content};
    writeFiles(next); setFiles(next);
  };
  return <div className="mtp11-files">
    <aside className="mtp11-file-nav">
      <button className={folder==='This PC'?'active':''} onClick={()=>setFolder('This PC')}><HardDrive/> This PC</button>
      {folders.map(x=><button key={x} className={folder===x?'active':''} onClick={()=>setFolder(x)}><Folder/> {x}</button>)}
    </aside>
    <main className="mtp11-file-main">
      <div className="mtp11-toolbar">
        <button onClick={refresh}><RefreshCw/></button><button onClick={createFile}><File/> New file</button>
        <span>{folder} · {Object.keys(nativeFs).length} managed folders</span>
      </div>
      <div className="mtp11-file-grid">
        {(folder==='This PC'?folders:[]).map(x=><button className="mtp11-file-card" key={x} onDoubleClick={()=>setFolder(x)}><Folder/><b>{x}</b><small>Folder</small></button>)}
        {folder==='This PC' && Object.keys(files).map(x=><button className="mtp11-file-card" key={x}><File/><b>{x}</b><small>Text document</small></button>)}
        {folder!=='This PC' && (nativeFs[folder]||[]).map(f=><button className="mtp11-file-card" key={f.name}><File/><b>{f.name}</b><small>{f.type} · {f.size} B</small></button>)}
        {folder!=='This PC' && !(nativeFs[folder]||[]).length && <div className="mtp11-empty">This folder is empty.</div>}
      </div>
    </main>
  </div>;
}
function SettingsApp(){
  const [theme,setTheme]=useState(()=>localStorage.getItem('mtp2026-desktop-theme')||'dark');
  const [animations,setAnimations]=useState(()=>localStorage.getItem('mtp2026-desktop-animations')!=='off');
  const saveTheme=v=>{setTheme(v);localStorage.setItem('mtp2026-desktop-theme',v);};
  const saveAnimations=v=>{setAnimations(v);localStorage.setItem('mtp2026-desktop-animations',v?'on':'off');};
  return <div className="mtp11-settings">
    <aside><div className="mtp11-settings-user"><div className="mtp11-avatar">M</div><div><b>MTP2026 User</b><small>VexaAccount protected</small></div></div>
      {['System','Bluetooth & devices','Network & internet','Personalization','Apps','Accounts','Privacy & security','Windows Update'].map((x,i)=><button key={x} className={i===0?'active':''}>{x}</button>)}</aside>
    <main><h2>System</h2><p>Manage your MTP2026 Desktop OS experience.</p>
      <div className="mtp11-setting-card"><Cpu/><div><b>About</b><span>MTP2026 Desktop OS · ARM64 / AArch64 · MTP2026 guest runtime</span></div></div>
      <div className="mtp11-setting-card"><Wifi/><div><b>Network</b><span>Host-connected network · {navigator.onLine?'Connected':'Offline'}</span></div></div>
      <div className="mtp11-setting-card"><ShieldCheck/><div><b>Security</b><span>VexaAccount session protection and MTP2026 runtime policy</span></div></div>
      <div className="mtp11-setting-card"><Monitor/><div><b>Appearance</b><span>Desktop shell theme</span><select value={theme} onChange={e=>saveTheme(e.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></div></div>
      <div className="mtp11-setting-card"><Activity/><div><b>Motion</b><span>Shell animations</span><button onClick={()=>saveAnimations(!animations)}>{animations?'Enabled':'Disabled'}</button></div></div>
    </main>
  </div>;
}

function ServiceManager(){
  const [services,setServices]=useState(getDesktopServices);
  const restart=()=>setServices(restartDesktopServices());
  return <div className="mtp11-monitor">
    <div className="mtp11-monitor-hero"><ServerCog/><div><b>MTP2026 System Services</b><small>Desktop service supervisor</small></div><button className="mtp11-service-restart" onClick={restart}><RefreshCw/> Restart services</button></div>
    {services.map(s=><div className="mtp11-service-row" key={s.id}><div><b>{s.name}</b><small>{s.critical?'Critical service':'Optional service'}</small></div><span className={s.status==='running'?'ok':''}><CheckCircle2/> {s.status}</span></div>)}
  </div>;
}

function SystemMonitor(){
  const [tick,setTick]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setTick(x=>x+1),1000);return()=>clearInterval(t);},[]);
  const cpu=Math.round(18+((tick*13)%31)),mem=Math.round(42+((tick*7)%18));
  return <div className="mtp11-monitor"><div className="mtp11-monitor-hero"><Activity/><div><b>MTP2026 System Monitor</b><small>Live browser/runtime telemetry</small></div></div>
    {[['CPU',cpu,'%'],['Memory',mem,'%'],['Network',navigator.onLine?100:0,'%'],['ARM64 Guest',100,'%']].map(([n,v,u])=><div className="mtp11-meter" key={n}><div><span>{n}</span><b>{v}{u}</b></div><i><em style={{width:`${v}%`}}/></i></div>)}
  </div>;
}

export function MTP2026DesktopShell({apps=[],onExit,onOpenBrowser}){
  const [start,setStart]=useState(false);
  const [search,setSearch]=useState('');
  const [windows,setWindows]=useState([]);
  const [active,setActive]=useState(null);
  const [maximized,setMaximized]=useState({});
  const [notifications,setNotifications]=useState(false);
  const [clock,setClock]=useState(new Date());
  const [power,setPower]=useState(false);
  const [browserUrl,setBrowserUrl]=useState('https://www.vexastore.2bd.net/');
  const [wallpaper,setWallpaper]=useState('aurora');
  const [boot,setBoot]=useState({phase:'ready',progress:100,provider:'browser-shell'});
  useEffect(()=>{const t=setInterval(()=>setClock(new Date()),1000);return()=>clearInterval(t);},[]);
  useEffect(()=>{const w=localStorage.getItem('mtp2026-desktop-wallpaper');if(w)setWallpaper(w); void bootDesktopOS({onProgress:setBoot}); return ()=>{shutdownDesktopOS();};},[]);

  const installed=useMemo(()=>apps.map(a=>({id:`web-${a.id}`,title:a.title||a.name||'Web App',icon:Globe2,kind:'web',url:a.url})),[apps]);
  const allApps=[...APPS,{id:'services',title:'System Services',icon:ServerCog},...installed];
  const visible=allApps.filter(a=>a.title.toLowerCase().includes(search.toLowerCase()));

  function close(id){setWindows(ws=>ws.filter(w=>w!==id));if(active===id)setActive(null);}
  function open(id){
    if(id==='store'){window.open('https://www.vexastore.2bd.net/','_blank','noopener,noreferrer');setStart(false);return;}
    const existing=windows.find(w=>w===id);
    if(!existing)setWindows(ws=>[...ws,id]);
    setActive(id);setStart(false);
  }
  function launchWeb(url){if(url){setBrowserUrl(url);open('browser');}}
  function renderWindow(id){
    const app=allApps.find(a=>a.id===id)||APPS.find(a=>a.id===id);
    if(!app)return null;
    const Icon=app.icon||Globe2;
    let body=<div className="mtp11-app-placeholder"><Icon/><h3>{app.title}</h3><p>MTP2026 Desktop application surface.</p></div>;
    if(id==='files')body=<FileExplorer/>;
    if(id==='settings')body=<SettingsApp/>;
    if(id==='system')body=<SystemMonitor/>;
    if(id==='services')body=<ServiceManager/>;
    if(id==='terminal')body=<div className="mtp11-terminal"><div>mtp2026@desktop:~$ system-info</div><div>MTP2026 Desktop OS</div><div>Architecture: aarch64</div><div>Runtime: browser-shell / native-vm compatible</div><div>Guest profile: desktop</div><div className="cursor">█</div></div>;
    if(id==='browser')body=<div className="mtp11-browser"><form onSubmit={e=>{e.preventDefault();setBrowserUrl(browserUrl);}}><Globe2/><input value={browserUrl} onChange={e=>setBrowserUrl(e.target.value)}/><button>Go</button></form><iframe title="MTP2026 Browser" src={browserUrl} allow="fullscreen; clipboard-read; clipboard-write; autoplay; gamepad" sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-pointer-lock allow-scripts allow-same-origin"/></div>;
    if(app.kind==='web')body=<div className="mtp11-browser"><div className="mtp11-browser-note">MTP2026 WebApp · VexaAccount application workspace</div><iframe title={app.title} src={app.url} allow="fullscreen; clipboard-read; clipboard-write; autoplay; gamepad" sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-pointer-lock allow-scripts allow-same-origin"/></div>;
    return <div className={`mtp11-window-layer ${maximized[id]?'max':''}`} style={{zIndex:active===id?120:110}} key={id} onMouseDown={()=>setActive(id)}><WindowFrame title={app.title} icon={Icon} maximized={!!maximized[id]} onClose={()=>close(id)} onMinimize={()=>setWindows(ws=>ws.filter(w=>w!==id))} onMaximize={()=>setMaximized(m=>({...m,[id]:!m[id]}))}>{body}</WindowFrame></div>;
  }

  const bg=wallpaper==='aurora'?'mtp11-bg-aurora':wallpaper==='midnight'?'mtp11-bg-midnight':'mtp11-bg-clean';
  return <main className={`mtp11-desktop ${bg}`}>
    <div className="mtp11-desktop-shade" onContextMenu={e=>e.preventDefault()} />
    {boot.phase!=='ready'&&<div className="mtp11-boot-screen">
      <div className="mtp11-boot-logo"><span>{MTP2026_DESKTOP_BRANDING.logoText}</span></div>
      <b>{MTP2026_DESKTOP_BRANDING.productName}</b>
      <small>Starting MTP2026 Desktop services · {MTP2026_DESKTOP_BRANDING.architecture}</small>
      <div className="mtp11-boot-progress"><i style={{width:`${boot.progress}%`}}/></div>
      <em>{String(boot.phase).toUpperCase()} · {boot.progress}%</em>
    </div>}
    <div className="mtp11-desktop-icons">
      <button onDoubleClick={()=>open('files')}><span>🖥️</span><b>This PC</b></button>
      <button onDoubleClick={()=>open('files')}><FolderOpen/><b>File Explorer</b></button>
      <button onDoubleClick={()=>open('browser')}><Globe2/><b>MTP2026 Browser</b></button>
      <button onDoubleClick={()=>open('settings')}><Settings/><b>Settings</b></button>
      {installed.slice(0,8).map(a=><button key={a.id} onDoubleClick={()=>open(a.id)}><Globe2/><b>{a.title}</b></button>)}
    </div>
    {windows.map(renderWindow)}
    {start&&<div className="mtp11-start">
      <div className="mtp11-start-search"><Search/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search apps, settings, and files"/></div>
      <div className="mtp11-start-head"><b>All</b><span>{visible.length} apps</span></div>
      <div className="mtp11-start-grid">{visible.map(a=>{const I=a.icon||Globe2;return <button key={a.id} onClick={()=>a.kind==='web'?launchWeb(a.url):open(a.id)}><span><I/></span><b>{a.title}</b></button>})}</div>
      <div className="mtp11-start-footer"><div><div className="mtp11-avatar">M</div><span>MTP2026 User<small>VexaAccount</small></span></div><button onClick={()=>setPower(v=>!v)}><Power/></button></div>
    </div>}
    {notifications&&<div className="mtp11-notification-panel"><header><b>Notifications</b><button onClick={()=>setNotifications(false)}><X/></button></header><div><Bell/><p>You're all caught up.</p><small>MTP2026 system events will appear here.</small></div></div>}
    {power&&<div className="mtp11-power"><button onClick={()=>window.location.reload()}><RefreshCw/> Restart shell</button><button onClick={onExit}><LockKeyhole/> Exit Desktop OS</button><button onClick={()=>setPower(false)}>Cancel</button></div>}
    <nav className="mtp11-taskbar">
      <button className="mtp11-start-button" onClick={()=>setStart(v=>!v)} aria-label="Start"><Grid2X2/></button>
      <button className="mtp11-search-button" onClick={()=>setStart(true)}><Search/><span>Search</span></button>
      <div className="mtp11-pinned">{[['files',FolderOpen],['browser',Globe2],['settings',Settings],['system',Activity],['services',ServerCog]].map(([id,I])=><button key={id} className={active===id?'active':''} onClick={()=>open(id)}><I/></button>)}</div>
      <div className="mtp11-tray"><Wifi/><ShieldCheck/><button onClick={()=>setNotifications(v=>!v)}><Bell/></button><button className="mtp11-clock"><b>{clock.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</b><small>{clock.toLocaleDateString([], {month:'numeric',day:'numeric',year:'numeric'})}</small></button><button onClick={()=>setPower(v=>!v)}><Power/></button></div>
    </nav>
  </main>;
}

export default MTP2026DesktopShell;
