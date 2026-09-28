import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell, ChevronDown, File, Folder, FolderOpen, Globe2, Grid2X2, HardDrive, Info, Clipboard,
  Monitor, Power, Search, Settings, ShieldCheck, Store, Terminal, UserRound,
  Wifi, X, Minus, Maximize2, RefreshCw, Download, Cpu, Activity, LockKeyhole, ServerCog, CheckCircle2
} from 'lucide-react';
import { MTP2026_DESKTOP_BRANDING } from './mtp2026DesktopBranding.js';
import { bootDesktopOS, shutdownDesktopOS } from './mtp2026DesktopBootManager.js';
import { getDesktopServices, restartDesktopServices } from './mtp2026DesktopServiceManager.js';
import { createDesktopTextFile, getDesktopFilesystem, createDesktopFolder, renameDesktopEntry, deleteDesktopEntry, readDesktopEntry, copyDesktopEntry, writeDesktopTextFile } from './mtp2026DesktopFilesystem.js';
import { detectDesktopRuntime } from './mtp2026DesktopRuntimeAdapter.js';
import { guestImageStatus, installGuestImageFromBytes, installGuestImageFromContract } from './guestImageManager.js';
import { bootDesktopGuest, stopDesktopGuest } from './mtp2026DesktopGuestBridge.js';
import { startDesktopSession, endDesktopSession } from './mtp2026DesktopSession.js';

const APPS = [
  { id:'files', title:'File Explorer', icon:FolderOpen },
  { id:'settings', title:'Settings', icon:Settings },
  { id:'browser', title:'MTP2026 Browser', icon:Globe2 },
  { id:'store', title:'VexaStore', icon:Store },
  { id:'terminal', title:'Terminal', icon:Terminal },
  { id:'system', title:'System Monitor', icon:Activity },
  { id:'runtime', title:'Guest Runtime', icon:Cpu },
  { id:'about', title:'System Information', icon:Info },
];

const STORAGE_KEY='mtp2026-desktop-files-v1';
const SESSION_KEY='mtp2026-desktop-session-v1';
function readSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'{}')}catch{return {}}}
function writeSession(v){try{localStorage.setItem(SESSION_KEY,JSON.stringify(v))}catch{}}

function readFiles(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch { return {}; }
}
function writeFiles(v){ try { localStorage.setItem(STORAGE_KEY,JSON.stringify(v)); } catch {} }

function WindowFrame({title,icon:Icon,children,onClose,onMinimize,onMaximize,maximized=false,onTitleDoubleClick,onTitleContextMenu,onResizeStart}){
  return <section className={`mtp11-window ${maximized?'maximized':''}`}>
    <header className="mtp11-window-titlebar" onDoubleClick={onTitleDoubleClick} onContextMenu={onTitleContextMenu}>
      <div className="mtp11-window-title"><Icon/><b>{title}</b></div>
      <div className="mtp11-window-controls">
        <button onClick={onMinimize} aria-label="Minimize"><Minus/></button>
        <button onClick={onMaximize} aria-label="Maximize"><Maximize2/></button>
        <button className="close" onClick={onClose} aria-label="Close"><X/></button>
      </div>
    </header>
    <div className="mtp11-window-body">{children}</div>
    {!maximized&&<div className="mtp11-resize-handle" onPointerDown={onResizeStart} aria-label="Resize window"/>}
  </section>;
}

function TextEditor({folder,name,onClose}){
  const [value,setValue]=useState(()=>readDesktopEntry(folder,name)?.content||'');
  const [saved,setSaved]=useState(false);
  const save=()=>{writeDesktopTextFile(folder,name,value);setSaved(true);setTimeout(()=>setSaved(false),1200)};
  useEffect(()=>{const key=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save()}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[value,folder,name]);
  return <div className="mtp11-editor"><div className="mtp11-editor-toolbar"><b>{name}</b><span>{saved?'Saved':'Text document'}</span><button onClick={save}><CheckCircle2/> Save</button><button onClick={onClose}><X/></button></div><textarea value={value} onChange={e=>setValue(e.target.value)} spellCheck="false"/></div>;
}
function FileExplorer(){
  const [clipboard,setClipboard]=useState(()=>{try{return JSON.parse(localStorage.getItem('mtp2026:desktop:clipboard:v1')||'null')}catch{return null}});
  const [nativeFs,setNativeFs]=useState(getDesktopFilesystem);
  const [folder,setFolder]=useState('This PC');
  const [history,setHistory]=useState(['This PC']);
  const [historyIndex,setHistoryIndex]=useState(0);
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState(null);
  const [editor,setEditor]=useState(null);
  useEffect(()=>{const handler=e=>{if(e.detail?.folder){setQuery('');navigate(e.detail.folder)}};window.addEventListener('mtp2026:explorer-navigate',handler);return()=>window.removeEventListener('mtp2026:explorer-navigate',handler)},[]);
  useEffect(()=>{const key=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){e.preventDefault();copySelected()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){e.preventDefault();paste()}if(e.key==='Delete'){e.preventDefault();remove()}if(e.key==='Enter'&&selected){const entry=readDesktopEntry(folder,selected);if(entry?.name&&folders.includes(entry.name))navigate(entry.name)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[selected,folder,clipboard]);
  const folders=['Desktop','Documents','Downloads','Pictures','Music','Videos'];
  const refresh=()=>{setNativeFs(getDesktopFilesystem());setSelected(null);};
  const navigate=next=>{const h=history.slice(0,historyIndex+1).concat(next);setHistory(h);setHistoryIndex(h.length-1);setFolder(next);setSelected(null);};
  const back=()=>historyIndex>0&&(setHistoryIndex(i=>i-1),setFolder(history[historyIndex-1]),setSelected(null));
  const forward=()=>historyIndex<history.length-1&&(setHistoryIndex(i=>i+1),setFolder(history[historyIndex+1]),setSelected(null));
  const makeFile=()=>{const target=folder==='This PC'?'Documents':folder;createDesktopTextFile(target);refresh();if(folder==='This PC')navigate('Documents');};
  const makeFolder=()=>{const target=folder==='This PC'?'Documents':folder;const name=prompt('Folder name','New folder');if(name) {createDesktopFolder(target,name);refresh();}};
  const rename=()=>{if(!selected||folder==='This PC')return;const next=prompt('Rename item',selected);if(next&&next!==selected){renameDesktopEntry(folder,selected,next);refresh();setSelected(next);}};
  const remove=()=>{if(!selected||folder==='This PC')return;if(confirm('Delete “'+selected+'” from '+folder+'?')){deleteDesktopEntry(folder,selected);refresh();}};
  const openEntry=name=>{if(folders.includes(name))navigate(name);else if(readDesktopEntry(folder,name)?.type==='text')setEditor({folder,name});};
  const items=folder==='This PC'
    ? folders.map(name=>({name,type:'Folder',isFolder:true}))
    : (nativeFs[folder]||[]).map(f=>({...f,isFolder:false}));
  const filtered=items.filter(x=>x.name.toLowerCase().includes(query.toLowerCase()));
  const selectedEntry=selected&&readDesktopEntry(folder,selected);
  const copySelected=()=>{if(!selectedEntry||folder==='This PC')return;const item={...selectedEntry,sourceFolder:folder};setClipboard(item);try{localStorage.setItem('mtp2026:desktop:clipboard:v1',JSON.stringify(item))}catch{}};
  const paste=()=>{if(!clipboard)return;const target=folder==='This PC'?'Documents':folder;let pastedName=clipboard.name;let n=1;while((getDesktopFilesystem()[target]||[]).some(x=>x.name===pastedName)){pastedName=clipboard.name.replace(/(\.[^.]+)?$/,' copy'+(n>1?' '+n:'')+'$1');n++;}copyDesktopEntry(clipboard.sourceFolder,clipboard.name,target,pastedName);refresh();};

  return <div className="mtp11-files">
    <aside className="mtp11-file-nav">
      <button className={folder==='This PC'?'active':''} onClick={()=>navigate('This PC')}><HardDrive/> This PC</button>
      {folders.map(x=><button key={x} className={folder===x?'active':''} onClick={()=>navigate(x)}><Folder/> {x}</button>)}
    </aside>
    <main className="mtp11-file-main">
      <div className="mtp11-file-address">
        <button onClick={back} disabled={historyIndex===0}>‹</button><button onClick={forward} disabled={historyIndex===history.length-1}>›</button>
        <div className="mtp11-file-breadcrumb"><HardDrive/> This PC {folder!=='This PC'&&<> <span>›</span> <b>{folder}</b></>}</div>
        <div className="mtp11-file-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search this location"/></div>
      </div>
      <div className="mtp11-toolbar">
        <button onClick={refresh}><RefreshCw/> Refresh</button><button onClick={makeFile}><File/> New file</button><button onClick={makeFolder}><Folder/> New folder</button>
        <button disabled={!selected||folder==='This PC'} onClick={copySelected}>Copy</button><button disabled={!clipboard} onClick={paste}>Paste</button><button disabled={!selected||folder==='This PC'} onClick={rename}>Rename</button><button disabled={!selected||folder==='This PC'} onClick={remove}>Delete</button>
        <span>{filtered.length} item{filtered.length===1?'':'s'}{selected?' · '+selected:''}</span>
      </div>
      <div className="mtp11-file-grid">
        {filtered.map(x=><button className={`mtp11-file-card ${selected===x.name?'selected':''}`} key={x.name}
          onClick={()=>setSelected(x.name)} onDoubleClick={()=>openEntry(x.name)}>
          {x.isFolder?<FolderOpen/>:<File/>}<b>{x.name}</b><small>{x.isFolder?'Folder':`${x.type||'file'} · ${x.size||0} B`}</small>
        </button>)}
        {!filtered.length&&<div className="mtp11-empty">{query?'No matching items.':'This folder is empty.'}</div>}
      </div>
      {editor&&<TextEditor {...editor} onClose={()=>{setEditor(null);refresh()}}/>}
      {selectedEntry&&<div className="mtp11-file-details"><Info/><div><b>{selectedEntry.name}</b><small>{selectedEntry.type||'text'} · {selectedEntry.size||0} bytes · Updated {new Date(selectedEntry.updatedAt||Date.now()).toLocaleString()}</small></div></div>}
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

function GuestRuntime({runtime,guestState,onState}){
  const [image,setImage]=useState({status:'checking'});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const refresh=async()=>{setBusy(true);setMessage('');try{setImage(await guestImageStatus('desktop'));}catch(e){setMessage(e.message||'Unable to inspect guest image.');}finally{setBusy(false);}};
  useEffect(()=>{void refresh();},[]);
  const boot=async()=>{setBusy(true);setMessage('');try{const state=await bootDesktopGuest({onState});onState?.(state);}catch(e){setMessage(e.message||'Guest boot failed.');}finally{setBusy(false);}};
  const stop=async()=>{setBusy(true);setMessage('');try{const state=await stopDesktopGuest();onState?.(state);await refresh();}catch(e){setMessage(e.message||'Guest stop failed.');}finally{setBusy(false);}};
  const importImage=async(e)=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setMessage('Validating and installing ARM64 guest image…');try{await installGuestImageFromBytes('desktop',new Uint8Array(await file.arrayBuffer()),{sourceName:file.name});setMessage('Guest image installed and integrity-checked.');await refresh();}catch(err){setMessage(err.message||'Guest image installation failed.');}finally{setBusy(false);}};
  const downloadImage=async()=>{setBusy(true);setMessage('Downloading configured guest image…');try{await installGuestImageFromContract('desktop',{sourceName:'configured MTP2026 guest image'});setMessage('Configured guest image installed and integrity-checked.');await refresh();}catch(e){setMessage(e.message||'Configured guest image is unavailable.');}finally{setBusy(false);}};
  const running=Boolean(guestState?.running);
  return <div className="mtp11-runtime">
    <div className="mtp11-runtime-head"><div><div className="mtp11-runtime-kicker">DEVICE VIRTUALIZATION</div><h2>Guest Runtime</h2><p>Manage the MTP2026 Desktop ARM64 guest without bundling proprietary operating-system files.</p></div><button onClick={refresh} disabled={busy}><RefreshCw/></button></div>
    <div className="mtp11-runtime-status"><div><span className="dot"/><b>{running?'Running':'Stopped'}</b><small>{runtime.mode} · {runtime.architecture.toUpperCase()}</small></div><div><b>{guestState?.phase||'idle'}</b><small>{guestState?.progress||0}% boot progress</small></div></div>
    <div className="mtp11-runtime-grid">
      <div className="mtp11-runtime-card"><Cpu/><b>Architecture</b><span>ARM64 / AArch64</span></div>
      <div className="mtp11-runtime-card"><Monitor/><b>Profile</b><span>desktop · qemu-aarch64-virt compatible</span></div>
      <div className="mtp11-runtime-card"><HardDrive/><b>Guest image</b><span>{image.status==='installed'?'Installed · verified':'Not installed'}</span></div>
      <div className="mtp11-runtime-card"><ShieldCheck/><b>Runtime policy</b><span>MTP2026-owned shell + supplied guest image</span></div>
    </div>
    <div className="mtp11-runtime-actions">
      {!running?<button onClick={boot} disabled={busy}><Power/> Boot guest</button>:<button onClick={stop} disabled={busy}><Power/> Stop guest</button>}
      <label><Download/> Import ARM64 image<input type="file" accept=".img,.raw,.bin,.qcow2,.iso,application/octet-stream" onChange={importImage}/></label>
      <button onClick={downloadImage} disabled={busy}><RefreshCw/> Use configured source</button>
    </div>
    {message&&<div className="mtp11-runtime-message">{message}</div>}
    <div className="mtp11-runtime-note">Only an actual verified guest image plus a supported native or QEMU-WASM provider can execute a real guest. Otherwise MTP2026 continues in its browser shell.</div>
  </div>;
}

function SystemInformation({runtime,guestState}){
  const session=getDesktopSessionSafe();
  return <div className="mtp11-info">
    <div className="mtp11-info-hero"><div className="mtp11-info-mark">M</div><div><div className="mtp11-runtime-kicker">ABOUT THIS DEVICE</div><h2>MTP2026 Desktop OS</h2><p>Desktop Edition · version {MTP2026_DESKTOP_BRANDING.version}</p></div></div>
    <div className="mtp11-info-grid">
      <div><span>Architecture</span><b>ARM64 / AArch64</b></div>
      <div><span>Shell</span><b>{MTP2026_DESKTOP_BRANDING.shell}</b></div>
      <div><span>Runtime provider</span><b>{runtime.mode}</b></div>
      <div><span>Guest profile</span><b>{runtime.guestProfile}</b></div>
      <div><span>Guest state</span><b>{guestState?.phase||'idle'}</b></div>
      <div><span>Network</span><b>{navigator.onLine?'Connected':'Offline'}</b></div>
    </div>
    <div className="mtp11-info-section"><Info/><div><b>MTP2026-owned platform</b><p>The desktop shell, branding, services and application layer are maintained as an independent MTP2026 implementation. Real guest execution remains dependent on an actual verified ARM64 image and supported runtime provider.</p></div></div>
  </div>;
}
function getDesktopSessionSafe(){try{return JSON.parse(localStorage.getItem('mtp2026:desktop:session-meta:v1')||'{}')}catch{return {}}}

function ServiceManager(){
  const [services,setServices]=useState(getDesktopServices);
  const restart=()=>setServices(restartDesktopServices());
  return <div className="mtp11-monitor">
    <div className="mtp11-monitor-hero"><ServerCog/><div><b>MTP2026 System Services</b><small>Desktop service supervisor</small></div><button className="mtp11-service-restart" onClick={restart}><RefreshCw/> Restart services</button></div>
    {services.map(s=><div className="mtp11-service-row" key={s.id}><div><b>{s.name}</b><small>{s.critical?'Critical service':'Optional service'}</small></div><span className={s.status==='running'?'ok':''}><CheckCircle2/> {s.status}</span></div>)}
  </div>;
}

function SystemMonitor({runtime,guestState}){
  const [tick,setTick]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setTick(x=>x+1),1000);return()=>clearInterval(t);},[]);
  const cpu=Math.round(18+((tick*13)%31)),mem=Math.round(42+((tick*7)%18));
  const guestReady=Boolean(guestState?.running && (guestState?.phase==='ready'||guestState?.phase==='browser-shell'));
  const guestMeter=guestReady ? 100 : Math.max(0,Math.min(100,guestState?.progress||0));
  return <div className="mtp11-monitor"><div className="mtp11-runtime-badge"><span className="dot"/> {runtime.mode==='native-vm'?'ARM64 guest provider active':runtime.mode==='qemu-wasm'?'QEMU-WASM ARM64 provider available':'Browser shell runtime'} · {runtime.guestProfile}</div><div className="mtp11-monitor-hero"><Activity/><div><b>MTP2026 System Monitor</b><small>Live {runtime.mode} telemetry · {runtime.architecture}</small></div></div>
    {[['CPU',cpu,'%'],['Memory',mem,'%'],['Network',navigator.onLine?100:0,'%'],['Guest runtime',guestMeter,'%']].map(([n,v,u])=><div className="mtp11-meter" key={n}><div><span>{n}</span><b>{v}{u}</b></div><i><em style={{width:`${v}%`}}/></i></div>)}
  </div>;
}

export function MTP2026DesktopShell({apps=[],onExit,onOpenBrowser}){
  const [start,setStart]=useState(false);
  const [search,setSearch]=useState('');
  const session=useMemo(()=>readSession(),[]);
  const [windows,setWindows]=useState(()=>Array.isArray(session.windows)?session.windows:[]);
  const [active,setActive]=useState(()=>session.active||null);
  const [maximized,setMaximized]=useState(()=>session.maximized||{});
  const [minimized,setMinimized]=useState(()=>session.minimized||[]);
  const [notifications,setNotifications]=useState(false);
  const [clock,setClock]=useState(new Date());
  const [power,setPower]=useState(false);
  const [desktopMenu,setDesktopMenu]=useState(null);
  const [quickSettings,setQuickSettings]=useState(false);
  const [snapMenu,setSnapMenu]=useState(null);
  const [desktopSelection,setDesktopSelection]=useState(null);
  const [desktopBox,setDesktopBox]=useState(null);
  const [draggingIcon,setDraggingIcon]=useState(null);
  const [iconPositions,setIconPositions]=useState(()=>{try{return JSON.parse(localStorage.getItem('mtp2026:desktop:icon-positions:v1')||'{}')}catch{return {}}});
  const [taskbarMenu,setTaskbarMenu]=useState(null);
  const [snapped,setSnapped]=useState(()=>session.snapped||{});
  const [windowGeometry,setWindowGeometry]=useState(()=>session.windowGeometry||{});
  const [browserUrl,setBrowserUrl]=useState('https://www.vexastore.2bd.net/');
  const [wallpaper,setWallpaper]=useState('aurora');
  const [boot,setBoot]=useState({phase:'ready',progress:100,provider:'browser-shell'});
  const [runtime,setRuntime]=useState(()=>detectDesktopRuntime());
  const [guestState,setGuestState]=useState(()=>globalThis.MTP2026GuestBoot?.getGuestState?.()||null);
  useEffect(()=>{const t=setInterval(()=>setClock(new Date()),1000);return()=>clearInterval(t);},[]);
  useEffect(()=>{
    const handler=e=>{setGuestState(e.detail||null);setRuntime(detectDesktopRuntime());};
    window.addEventListener('mtp2026:guest-state',handler);
    return()=>window.removeEventListener('mtp2026:guest-state',handler);
  },[]);
  useEffect(()=>{writeSession({windows,active,maximized,minimized,snapped,windowGeometry,updatedAt:new Date().toISOString()})},[windows,active,maximized,minimized,snapped,windowGeometry]);
  useEffect(()=>{try{localStorage.setItem('mtp2026:desktop:icon-positions:v1',JSON.stringify(iconPositions))}catch{}},[iconPositions]);
  useEffect(()=>{
    const onKey=e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='l'){e.preventDefault();setStart(true);setSearch('');return;}
      if(e.key==='Escape'){setStart(false);setNotifications(false);setPower(false);return;}
      if(e.altKey&&e.key==='Tab'){e.preventDefault();const ids=windows.filter(id=>!minimized.includes(id));if(ids.length){const i=Math.max(0,ids.indexOf(active));const next=ids[(i+1)%ids.length];setActive(next);setMinimized(m=>m.filter(x=>x!==next));}}
      if(e.key==='F11'){e.preventDefault();const id=active;if(id)setMaximized(m=>({...m,[id]:!m[id]}));}
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[windows,minimized,active]);
  useEffect(()=>{const w=localStorage.getItem('mtp2026-desktop-wallpaper');if(w)setWallpaper(w); setRuntime(detectDesktopRuntime()); startDesktopSession('desktop'); void bootDesktopOS({provider:detectDesktopRuntime().mode,onProgress:setBoot}); return ()=>{shutdownDesktopOS();endDesktopSession();};},[]);

  const installed=useMemo(()=>apps.map(a=>({id:`web-${a.id}`,title:a.title||a.name||'Web App',icon:Globe2,kind:'web',url:a.url})),[apps]);
  const allApps=[...APPS,{id:'services',title:'System Services',icon:ServerCog},...installed];
  const visible=allApps.filter(a=>a.title.toLowerCase().includes(search.toLowerCase()));

  function close(id){setWindows(ws=>ws.filter(w=>w!==id));setMinimized(m=>m.filter(x=>x!==id));setMaximized(m=>{const next={...m};delete next[id];return next});if(active===id)setActive(null);setSnapped(s=>{const n={...s};delete n[id];return n});}
  function open(id){
    if(id==='store'){window.open('https://www.vexastore.2bd.net/','_blank','noopener,noreferrer');setStart(false);return;}
    const existing=windows.find(w=>w===id);
    if(!existing)setWindows(ws=>[...ws,id]);
    setMinimized(m=>m.filter(x=>x!==id));
    setActive(id);setStart(false);
  }
  function launchWeb(url){if(url){setBrowserUrl(url);open('browser');}}
  function openFilesAt(folder){
    open('files');
    window.dispatchEvent(new CustomEvent('mtp2026:explorer-navigate',{detail:{folder}}));
  }
  function desktopShortcutAction(id){
    if(id==='this-pc') openFilesAt('This PC');
    else if(id==='files') openFilesAt('This PC');
    else open(id);
  }
  function resetDesktopLayout(){
    setIconPositions({});
    setDesktopSelection(null);
  }
  function restoreWindow(id){
    setMinimized(m=>m.filter(x=>x!==id));setMaximized(m=>{const n={...m};delete n[id];return n});setSnapped(s=>{const n={...s};delete n[id];return n});setActive(id);
  }
  function minimizeWindow(id){setMinimized(m=>m.includes(id)?m:[...m,id]);setActive(a=>a===id?null:a);}
  function resizeWindow(id,e){
    e.preventDefault(); e.stopPropagation();
    if(maximized[id]||snapped[id]){setMaximized(m=>{const n={...m};delete n[id];return n});setSnapped(s=>{const n={...s};delete n[id];return n});}
    const startX=e.clientX,startY=e.clientY,base=windowGeometry[id]||{width:720,height:520};
    const maxW=Math.max(320,window.innerWidth-24),maxH=Math.max(220,window.innerHeight-150);
    const move=ev=>setWindowGeometry(g=>({...g,[id]:{width:Math.min(maxW,Math.max(320,base.width+ev.clientX-startX)),height:Math.min(maxH,Math.max(220,base.height+ev.clientY-startY))}}));
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  }
  function snapWindow(id,position){setSnapped(s=>({...s,[id]:position}));
    setMinimized(m=>m.filter(x=>x!==id));setActive(id);setMaximized(m=>{const n={...m};delete n[id];return n});setSnapMenu(null);window.dispatchEvent(new CustomEvent('mtp2026:snap',{detail:{id,position}}));}
  function renderWindow(id){
    const app=allApps.find(a=>a.id===id)||APPS.find(a=>a.id===id);
    if(!app)return null;
    const Icon=app.icon||Globe2;
    let body=<div className="mtp11-app-placeholder"><Icon/><h3>{app.title}</h3><p>MTP2026 Desktop application surface.</p></div>;
    if(id==='files')body=<FileExplorer/>;
    if(id==='settings')body=<SettingsApp/>;
    if(id==='system')body=<SystemMonitor runtime={runtime} guestState={guestState}/>;
    if(id==='runtime')body=<GuestRuntime runtime={runtime} guestState={guestState} onState={setGuestState}/>;
    if(id==='about')body=<SystemInformation runtime={runtime} guestState={guestState}/>;
    if(id==='services')body=<ServiceManager/>;
    if(id==='terminal')body=<div className="mtp11-terminal"><div>mtp2026@desktop:~$ system-info</div><div>MTP2026 Desktop OS</div><div>Architecture: aarch64</div><div>Runtime: browser-shell / native-vm compatible</div><div>Guest profile: desktop</div><div className="cursor">█</div></div>;
    if(id==='browser')body=<div className="mtp11-browser"><form onSubmit={e=>{e.preventDefault();setBrowserUrl(browserUrl);}}><Globe2/><input value={browserUrl} onChange={e=>setBrowserUrl(e.target.value)}/><button>Go</button></form><iframe title="MTP2026 Browser" src={browserUrl} allow="fullscreen; clipboard-read; clipboard-write; autoplay; gamepad" sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-pointer-lock allow-scripts allow-same-origin"/></div>;
    if(app.kind==='web')body=<div className="mtp11-browser"><div className="mtp11-browser-note">MTP2026 WebApp · VexaAccount application workspace</div><iframe title={app.title} src={app.url} allow="fullscreen; clipboard-read; clipboard-write; autoplay; gamepad" sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-pointer-lock allow-scripts allow-same-origin"/></div>;
    if(minimized.includes(id)) return null;
    return <div className={`mtp11-window-layer ${maximized[id]?'max':''} ${snapped[id]?'snap-'+snapped[id]:''}`} style={{zIndex:active===id?120:110,width:windowGeometry[id]?.width,height:windowGeometry[id]?.height}} key={id} onMouseDown={()=>{setActive(id);setMinimized(m=>m.filter(x=>x!==id));}}><WindowFrame title={app.title} icon={Icon} maximized={!!maximized[id]} onClose={()=>close(id)} onMinimize={()=>{setMinimized(m=>m.includes(id)?m:m.concat(id));if(active===id)setActive(null)}} onMaximize={()=>setMaximized(m=>({...m,[id]:!m[id]}))} onTitleDoubleClick={()=>setMaximized(m=>({...m,[id]:!m[id]}))} onTitleContextMenu={e=>{e.preventDefault();setSnapMenu({id,x:e.clientX,y:e.clientY});}} onResizeStart={e=>resizeWindow(id,e)}>{body}</WindowFrame></div>;
  }

  const bg=wallpaper==='aurora'?'mtp11-bg-aurora':wallpaper==='midnight'?'mtp11-bg-midnight':'mtp11-bg-clean';
  const moveIcon=(id,e)=>{
    if(e.button!==0)return;
    const startX=e.clientX,startY=e.clientY,base=iconPositions[id]||{x:18,y:18};
    const move=ev=>setIconPositions(p=>({...p,[id]:{x:Math.max(4,base.x+ev.clientX-startX),y:Math.max(4,base.y+ev.clientY-startY)}}));
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);setDraggingIcon(null)};
    setDraggingIcon(id);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };
  const desktopPointerDown=e=>{
    if(e.button!==0||e.target.closest('.mtp11-desktop-icons')||e.target.closest('.mtp11-taskbar')||e.target.closest('.mtp11-window')) return;
    const sx=e.clientX,sy=e.clientY;setDesktopBox({x:sx,y:sy,w:0,h:0});
    const move=ev=>setDesktopBox({x:Math.min(sx,ev.clientX),y:Math.min(sy,ev.clientY),w:Math.abs(ev.clientX-sx),h:Math.abs(ev.clientY-sy)});
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);setDesktopBox(null);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };
  return <main className={`mtp11-desktop ${bg}`} onPointerDown={desktopPointerDown}>
    <div className="mtp11-desktop-shade" onContextMenu={e=>{e.preventDefault();setDesktopMenu({x:e.clientX,y:e.clientY});}} onClick={()=>desktopMenu&&setDesktopMenu(null)} />
    {boot.phase!=='ready'&&<div className="mtp11-boot-screen">
      <div className="mtp11-boot-logo"><img src="/mtp2026-logo.svg" alt="MTP2026"/></div>
      <b>{MTP2026_DESKTOP_BRANDING.productName}</b>
      <small>Starting MTP2026 Desktop services · {MTP2026_DESKTOP_BRANDING.architecture}</small>
      <div className="mtp11-boot-progress"><i style={{width:`${boot.progress}%`}}/></div>
      <em>{String(boot.phase).toUpperCase()} · {boot.progress}%</em>
    </div>}
    <div className="mtp11-desktop-icons" onClick={()=>setDesktopSelection(null)}>
      {desktopBox&&<div className="mtp11-selection-box" style={{left:desktopBox.x,top:desktopBox.y,width:desktopBox.w,height:desktopBox.h}}/>}
      <button style={{left:iconPositions['this-pc']?.x,top:iconPositions['this-pc']?.y}} className={`mtp11-desktop-icon ${desktopSelection==='this-pc'?'selected':''} ${draggingIcon==='this-pc'?'dragging':''}`} onPointerDown={e=>{e.stopPropagation();moveIcon('this-pc',e)}} onClick={e=>{e.stopPropagation();setDesktopSelection('this-pc')}} onDoubleClick={()=>desktopShortcutAction('files')}><span>🖥️</span><b>This PC</b></button>
      <button style={{left:iconPositions.files?.x,top:iconPositions.files?.y}} className={`mtp11-desktop-icon ${desktopSelection==='files'?'selected':''} ${draggingIcon==='files'?'dragging':''}`} onPointerDown={e=>{e.stopPropagation();moveIcon('files',e)}} onClick={e=>{e.stopPropagation();setDesktopSelection('files')}} onPointerDown={e=>{if(e.button===0)setDraggingIcon('files')}} onPointerUp={()=>setDraggingIcon(null)} onDoubleClick={()=>desktopShortcutAction('this-pc')}><FolderOpen/><b>File Explorer</b></button>
      <button onPointerDown={e=>{if(e.button===0)setDraggingIcon('browser')}} onPointerUp={()=>setDraggingIcon(null)} onDoubleClick={()=>open('browser')}><Globe2/><b>MTP2026 Browser</b></button>
      <button onPointerDown={e=>{if(e.button===0)setDraggingIcon('settings')}} onPointerUp={()=>setDraggingIcon(null)} onDoubleClick={()=>open('settings')}><Settings/><b>Settings</b></button>
      <button onPointerDown={e=>{if(e.button===0)setDraggingIcon('runtime')}} onPointerUp={()=>setDraggingIcon(null)} onDoubleClick={()=>open('runtime')}><Cpu/><b>Guest Runtime</b></button>
      <button onDoubleClick={()=>open('about')}><Info/><b>System Information</b></button>
      {installed.slice(0,8).map(a=><button key={a.id} onDoubleClick={()=>open(a.id)}><Globe2/><b>{a.title}</b></button>)}
    </div>
    {windows.map(renderWindow)}
    {desktopMenu&&<div className="mtp11-context-menu" style={{left:Math.min(desktopMenu.x,window.innerWidth-210),top:Math.min(desktopMenu.y,window.innerHeight-190)}} onClick={e=>e.stopPropagation()}>
      <button onClick={()=>{setDesktopMenu(null);setWindows([]);setActive(null);}}><RefreshCw/> Refresh desktop</button>
      <button onClick={()=>{setDesktopMenu(null);desktopShortcutAction('files')}}><FolderOpen/> Open File Explorer</button><button onClick={()=>{resetDesktopLayout();setDesktopMenu(null)}}><Grid2X2/> Reset icon layout</button>
      <button onClick={()=>{setDesktopMenu(null);open('about')}}><Info/> System information</button>
      <button onClick={()=>{setDesktopMenu(null);open('settings')}}><Settings/> Personalize</button>
      <button onClick={()=>navigator.clipboard?.writeText('MTP2026 Desktop OS') }><Clipboard/> Copy system name</button>
    </div>}
    {snapMenu&&<div className="mtp11-snap-menu" style={{left:snapMenu.x,top:snapMenu.y}} onClick={e=>e.stopPropagation()}><button onClick={()=>snapWindow(snapMenu.id,'left')}>◧ Left half</button><button onClick={()=>snapWindow(snapMenu.id,'right')}>◨ Right half</button><button onClick={()=>snapWindow(snapMenu.id,'top')}>▣ Top</button><button onClick={()=>snapWindow(snapMenu.id,'restore')}>□ Restore</button></div>}
    <div className="mtp11-window-switcher">{windows.map(id=>{const a=allApps.find(x=>x.id===id);if(!a)return null;const I=a.icon||Globe2;return <button key={id} className={active===id?'active':''} onClick={()=>{setActive(id);setMinimized(m=>m.filter(x=>x!==id));}} title={a.title}><I/></button>})}</div>
    {taskbarMenu&&<div className="mtp11-context-menu" style={{left:Math.min(taskbarMenu.x,window.innerWidth-210),top:Math.min(taskbarMenu.y,window.innerHeight-150)}} onClick={e=>e.stopPropagation()}><button onClick={()=>{restoreWindow(taskbarMenu.id);setTaskbarMenu(null)}}><Monitor/> Restore</button><button onClick={()=>{minimizeWindow(taskbarMenu.id);setTaskbarMenu(null)}}><Minus/> Minimize</button><button onClick={()=>{setMaximized(m=>({...m,[taskbarMenu.id]:true}));setSnapped(s=>{const n={...s};delete n[taskbarMenu.id];return n});restoreWindow(taskbarMenu.id);setTaskbarMenu(null)}}><Maximize2/> Maximize</button><button onClick={()=>{close(taskbarMenu.id);setTaskbarMenu(null)}}><X/> Close window</button></div>}
    {start&&<div className="mtp11-start">
      <div className="mtp11-start-search"><Search/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search apps, settings, and files"/></div>
      <div className="mtp11-start-head"><b>All</b><span>{visible.length} apps</span></div>
      <div className="mtp11-start-grid">{visible.map(a=>{const I=a.icon||Globe2;return <button key={a.id} onClick={()=>a.kind==='web'?launchWeb(a.url):open(a.id)}><span><I/></span><b>{a.title}</b></button>})}</div>
      <div className="mtp11-start-footer"><div><div className="mtp11-avatar">M</div><span>MTP2026 User<small>VexaAccount</small></span></div><button onClick={()=>setPower(v=>!v)}><Power/></button></div>
    </div>}
    {quickSettings&&<div className="mtp11-quick-settings"><header><b>Quick Settings</b><button onClick={()=>setQuickSettings(false)}><X/></button></header><div className="mtp11-quick-grid"><button className={navigator.onLine?'on':''}><Wifi/><span>Network<small>{navigator.onLine?'Connected':'Offline'}</small></span></button><button><ShieldCheck/><span>Security<small>Protected</small></span></button><button><Monitor/><span>Display<small>Desktop</small></span></button><button onClick={()=>setStart(true)}><Settings/><span>Settings<small>Open system settings</small></span></button></div></div>}
    {notifications&&<div className="mtp11-notification-panel"><header><b>Notifications</b><button onClick={()=>setNotifications(false)}><X/></button></header><div><Bell/><p>You're all caught up.</p><small>MTP2026 system events will appear here.</small></div></div>}
    {power&&<div className="mtp11-power"><button onClick={()=>window.location.reload()}><RefreshCw/> Restart shell</button><button onClick={onExit}><LockKeyhole/> Exit Desktop OS</button><button onClick={()=>setPower(false)}>Cancel</button></div>}
    <nav className="mtp11-taskbar">
      <button className="mtp11-start-button" onClick={()=>setStart(v=>!v)} aria-label="Start"><Grid2X2/></button>
      <button className="mtp11-search-button" onClick={()=>setStart(true)}><Search/><span>Search</span></button>
      <div className="mtp11-pinned">{[['files',FolderOpen],['browser',Globe2],['settings',Settings],['system',Activity],['runtime',Cpu],['about',Info],['services',ServerCog]].map(([id,I])=><button key={id} className={`${active===id?'active ':''}${windows.includes(id)?'running':''}`} onContextMenu={e=>{e.preventDefault();setTaskbarMenu({id,x:e.clientX,y:e.clientY});}} onClick={()=>open(id)}><I/></button>)}</div>
      <div className="mtp11-tray"><Wifi/><ShieldCheck/><button onClick={()=>setNotifications(v=>!v)}><Bell/></button><button onClick={()=>setQuickSettings(v=>!v)}><Wifi/></button><button className="mtp11-clock"><b>{clock.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</b><small>{clock.toLocaleDateString([], {month:'numeric',day:'numeric',year:'numeric'})}</small></button><button onClick={()=>setPower(v=>!v)}><Power/></button></div>
    </nav>
  </main>;
}

export default MTP2026DesktopShell;
