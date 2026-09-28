import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell, ChevronDown, File, Folder, FolderOpen, Globe2, Grid2X2, HardDrive, Info, Clipboard,
  Monitor, Power, Search, Settings, ShieldCheck, Store, Terminal, UserRound,
  Wifi, X, Minus, Maximize2, RefreshCw, Download, Cpu, Activity, LockKeyhole, ServerCog, CheckCircle2, Calendar, Volume2, Battery, Network, FolderCog, AppWindow, List, Command, SlidersHorizontal
} from 'lucide-react';
import { MTP2026_DESKTOP_BRANDING } from './mtp2026DesktopBranding.js';
import { bootDesktopOS, shutdownDesktopOS } from './mtp2026DesktopBootManager.js';
import { getDesktopServices } from './mtp2026DesktopServiceManager.js';
import { createDesktopTextFile, getDesktopFilesystem, createDesktopFolder, renameDesktopEntry, deleteDesktopEntry, readDesktopEntry, copyDesktopEntry, writeDesktopTextFile } from './mtp2026DesktopFilesystem.js';
import { detectDesktopRuntime } from './mtp2026DesktopRuntimeAdapter.js';
import { guestImageStatus, installGuestImageFromBytes, installGuestImageFromContract } from './guestImageManager.js';
import { bootDesktopGuest, stopDesktopGuest } from './mtp2026DesktopGuestBridge.js';
import { startDesktopSession, endDesktopSession } from './mtp2026DesktopSession.js';
import { getDesktopOSState, setDesktopSessionState, setDesktopPowerState, registerDesktopProcess, unregisterDesktopProcess, subscribeDesktopOSState, getDesktopProcesses, getDesktopServices as getCoreDesktopServices, setDesktopServiceState, addDesktopSystemEvent, setDesktopLocked, isDesktopLocked } from './mtp2026DesktopOSCore.js';
import { nativeSystemInfo, nativeListProcesses, nativeListServices } from './mtp2026DesktopNativeBridge.js';

const APPS = [
  { id:'files', title:'File Explorer', icon:FolderOpen },
  { id:'settings', title:'Settings', icon:Settings },
  { id:'browser', title:'MTP2026 Browser', icon:Globe2 },
  { id:'store', title:'VexaStore', icon:Store },
  { id:'terminal', title:'Terminal', icon:Terminal },
  { id:'system', title:'System Monitor', icon:Activity },
  { id:'runtime', title:'Guest Runtime', icon:Cpu },
  { id:'about', title:'System Information', icon:Info },
  { id:'taskmgr', title:'Task Manager', icon:Activity },
  { id:'run', title:'Run', icon:Command },
  { id:'control', title:'Control Panel', icon:SlidersHorizontal },
  { id:'properties', title:'Properties', icon:Info },
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
  const openEntry=name=>{
    if(folders.includes(name)){navigate(name);return;}
    const entry=readDesktopEntry(folder,name);
    if(entry?.type==='text'){setEditor({folder,name});return;}
    if(entry?.type==='url'&&entry.url){window.dispatchEvent(new CustomEvent('mtp2026:browser-open',{detail:{url:entry.url}}));}
  };
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
function TaskManager({windows,active,minimized,runtime,close,onSelect}){
  const [tick,setTick]=useState(0);
  const [processes,setProcesses]=useState(getDesktopProcesses);
  const [nativeInfo,setNativeInfo]=useState(null);
  useEffect(()=>{
    const off=subscribeDesktopOSState(()=>setProcesses(getDesktopProcesses()));
    const timer=setInterval(()=>setTick(x=>x+1),1000);
    void nativeSystemInfo().then(r=>{if(r?.supported)setNativeInfo(r.value||null)});
    return()=>{off();clearInterval(timer)};
  },[]);
  const appProcesses=processes.filter(p=>p.type==='application');
  const shellProcesses=processes.filter(p=>p.type!=='application');
  const shellLoad=Math.round(8+((tick*3)%18));
  return <div className="mtp11-taskmgr"><header><div><b>Task Manager</b><small>MTP2026 Desktop process registry</small></div><button onClick={()=>window.dispatchEvent(new CustomEvent('mtp2026:open-window',{detail:{id:'services'}}))}><FolderCog/> Services</button></header>
    <div className="mtp11-taskmgr-summary"><div><b>{appProcesses.length}</b><span>Apps</span></div><div><b>{shellLoad}%</b><span>Shell load</span></div><div><b>{processes.length}</b><span>Processes</span></div><div><b>{runtime.guestRunning?'Running':'Ready'}</b><span>Guest</span></div></div>
    {nativeInfo&&<div className="mtp11-taskmgr-native"><span>Native host</span><b>{nativeInfo.os||nativeInfo.platform||'available'}</b><span>{nativeInfo.arch||nativeInfo.architecture||'host telemetry'}</span></div>}
    <div className="mtp11-taskmgr-table"><div className="head"><span>Name</span><span>Status</span><span>Action</span></div>{processes.length?processes.map(p=><div className="row" key={p.id}><span><AppWindow/>{p.name}</span><span>{p.status||'running'}{p.id==='app:'+active?' · Active':''}</span><span>{p.type==='application'?<><button onClick={()=>onSelect(p.id.slice(4))}>Switch</button><button onClick={()=>close(p.id.slice(4))}>End task</button></>:<small>System</small>}</span></div>):<div className="empty">No MTP2026 processes are registered.</div>}</div>
    {shellProcesses.length>0&&<small className="mtp11-taskmgr-note">System processes are owned by the MTP2026 shell. Native host process enumeration is exposed separately when the native host is available.</small>}
  </div>;
}
function RunDialog({onClose,onOpen}){
  const [value,setValue]=useState('');
  const execute=()=>{const raw=value.trim(),v=raw.toLowerCase();if(!v)return;
    const map={cmd:'terminal',terminal:'terminal',taskmgr:'taskmgr','task manager':'taskmgr',control:'control','control panel':'control',settings:'settings',explorer:'files','explorer.exe':'files'};
    if(map[v]){onOpen(map[v]);onClose();return}
    if(raw.indexOf('http://')===0||raw.indexOf('https://')===0){window.dispatchEvent(new CustomEvent('mtp2026:browser-open',{detail:{url:raw}}));onClose();return}
    setValue('Unknown MTP2026 command: '+raw);
  };
  return <div className="mtp11-run-dialog"><header><Command/><div><b>Run</b><small>Open a program, folder, document, or website</small></div><button onClick={onClose}><X/></button></header><input autoFocus value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')execute();if(e.key==='Escape')onClose()}} placeholder="Type a command, app name, or URL"/><p>Try <code>cmd</code>, <code>taskmgr</code>, <code>control</code>, <code>explorer</code>, or <code>settings</code>.</p><footer><button onClick={execute}>OK</button><button onClick={onClose}>Cancel</button></footer></div>;
}
function ControlPanel({onSettings,onOpen}){
  const items=[['System','MTP2026 device and runtime information','about'],['Network and Internet','Connection and browser networking','settings'],['Appearance','Theme, wallpaper and desktop layout','settings'],['Apps','Application and store management','settings'],['Accounts','VexaAccount desktop identity','settings'],['Security','Privacy and session protection','settings'],['Devices','Display and connectivity','settings'],['System Services','Desktop service supervisor','services']];
  return <div className="mtp11-control-panel"><header><SlidersHorizontal/><div><b>Control Panel</b><small>MTP2026 system configuration</small></div><button onClick={onSettings}><Settings/> Settings</button></header><div className="mtp11-control-grid">{items.map(([name,desc,id])=><button key={name} onClick={()=>onOpen(id)}><div><b>{name}</b><span>{desc}</span></div><span>›</span></button>)}</div></div>;
}
function PropertiesApp({target='MTP2026 Desktop OS'}){
  return <div className="mtp11-properties"><header><Info/><div><b>{target}</b><small>Properties</small></div></header><div className="mtp11-properties-grid"><span>Type</span><b>System object</b><span>Owner</span><b>MTP2026</b><span>Architecture</span><b>ARM64 / AArch64</b><span>Edition</span><b>Desktop Edition</b><span>Version</span><b>2026.1</b><span>Runtime</span><b>Browser shell + supported guest providers</b></div></div>;
}
function TerminalApp({onOpen}){
  const [lines,setLines]=useState(['MTP2026 Desktop Terminal','Type "help" for available commands.']);
  const [value,setValue]=useState('');
  const run=async cmd=>{const raw=cmd.trim(),v=raw.toLowerCase();if(!v)return;let out='';
    if(v==='help')out='help  clear  date  systeminfo  osstate  services  processes  fsinfo  taskmgr  control  explorer  settings  lock  open <app>';
    else if(v==='clear'){setLines([]);return}
    else if(v==='date')out=new Date().toString();
    else if(v==='systeminfo'){const r=await nativeSystemInfo();out=r?.supported?JSON.stringify(r.value):'MTP2026 Desktop OS | ARM64 / AArch64 | Browser shell + supported native host';}
    else if(v==='osstate')out=JSON.stringify(getDesktopOSState(),null,2);
    else if(v==='services')out=getCoreDesktopServices().map(s=>s.id+'  '+s.status).join('\n');
    else if(v==='processes')out=getDesktopProcesses().map(p=>p.id+'  '+p.name+'  '+p.status).join('\n')||'No registered processes';
    else if(v==='fsinfo'){const r=await (await import('./mtp2026DesktopNativeBridge.js')).nativeFilesystemInfo();out=r?.supported?JSON.stringify(r.value):'Browser virtual filesystem active';}
    else if(v==='lock'){window.dispatchEvent(new CustomEvent('mtp2026:lock-desktop'));out='Lock request sent';}
    else if(v==='taskmgr')return onOpen('taskmgr');
    else if(v==='control')return onOpen('control');
    else if(v==='explorer')return onOpen('files');
    else if(v==='settings')return onOpen('settings');
    else if(v.startsWith('open ')){const n=v.slice(5);const map={browser:'browser',files:'files','file explorer':'files',settings:'settings',runtime:'runtime','task manager':'taskmgr','control panel':'control',services:'services'};if(map[n])return onOpen(map[n]);out='Application not found: '+n}
    else out='mtp2026: command not found: '+raw;
    setLines(x=>[...x,'mtp2026@desktop:~$ '+raw,out]);
  };
  return <div className="mtp11-terminal-real" onClick={()=>document.getElementById('mtp-terminal-input')?.focus()}><div className="mtp11-terminal-output">{lines.map((x,i)=><div key={i}>{x}</div>)}</div><div className="mtp11-terminal-prompt"><span>mtp2026@desktop:~$</span><input id="mtp-terminal-input" autoFocus value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){void run(value);setValue('')}}}/></div></div>;
}
function SettingsApp(){
  const sections=[
    {id:'system',label:'System',icon:Cpu},{id:'devices',label:'Bluetooth & devices',icon:Monitor},
    {id:'network',label:'Network & internet',icon:Wifi},{id:'personalization',label:'Personalization',icon:Monitor},
    {id:'apps',label:'Apps',icon:Grid2X2},{id:'accounts',label:'Accounts',icon:UserRound},
    {id:'privacy',label:'Privacy & security',icon:ShieldCheck},{id:'updates',label:'System Update',icon:RefreshCw},
  ];
  const [section,setSection]=useState('system');
  const [theme,setTheme]=useState(()=>localStorage.getItem('mtp2026-desktop-theme')||'dark');
  const [animations,setAnimations]=useState(()=>localStorage.getItem('mtp2026-desktop-animations')!=='off');
  const [bluetooth,setBluetooth]=useState(()=>localStorage.getItem('mtp2026-desktop-bluetooth')==='on');
  const [metered,setMetered]=useState(()=>localStorage.getItem('mtp2026-desktop-metered')==='on');
  const [lockScreen,setLockScreen]=useState(()=>localStorage.getItem('mtp2026-desktop-lock')!=='off');
  const [notifications,setNotifications]=useState(()=>localStorage.getItem('mtp2026-desktop-notifications')!=='off');
  const toggle=(setter,key,value)=>{setter(!value);localStorage.setItem(key,!value?'off':'on');};
  const event=(name,detail={})=>window.dispatchEvent(new CustomEvent(name,{detail}));
  const themeCard=<div className="mtp11-setting-card"><Monitor/><div><b>Theme</b><span>Desktop shell appearance</span></div><select value={theme} onChange={e=>{setTheme(e.target.value);localStorage.setItem('mtp2026-desktop-theme',e.target.value);event('mtp2026:theme-changed',{theme:e.target.value})}}><option value="dark">Dark</option><option value="light">Light</option></select></div>;
  const content={
    system:<><h2>System</h2><p>Manage your MTP2026 Desktop OS experience.</p>
      <div className="mtp11-setting-card"><Cpu/><div><b>About</b><span>MTP2026 Desktop OS · ARM64 / AArch64 · MTP2026 guest runtime</span></div><button onClick={()=>event('mtp2026:open-window',{id:'about'})}>Open</button></div>
      <div className="mtp11-setting-card"><Wifi/><div><b>Network</b><span>Host-connected network · {navigator.onLine?'Connected':'Offline'}</span></div><button onClick={()=>setSection('network')}>Manage</button></div>
      <div className="mtp11-setting-card"><ShieldCheck/><div><b>Security</b><span>VexaAccount session protection and MTP2026 runtime policy</span></div><button onClick={()=>setSection('privacy')}>Review</button></div>
      themeCard
      <div className="mtp11-setting-card"><Activity/><div><b>Motion</b><span>Shell animations</span></div><button onClick={()=>toggle(setAnimations,'mtp2026-desktop-animations',animations)}>{animations?'Enabled':'Disabled'}</button></div></>,
    devices:<><h2>Bluetooth & devices</h2><p>Manage device connectivity for the MTP2026 Desktop shell.</p>
      <div className="mtp11-setting-card"><Monitor/><div><b>Display</b><span>Responsive desktop viewport and shell scaling</span></div><button onClick={()=>setSection('personalization')}>Configure</button></div>
      <div className="mtp11-setting-card"><Wifi/><div><b>Bluetooth</b><span>{bluetooth?'Bluetooth is enabled':'Bluetooth is disabled'}</span></div><button onClick={()=>toggle(setBluetooth,'mtp2026-desktop-bluetooth',bluetooth)}>{bluetooth?'Turn off':'Turn on'}</button></div>
      <div className="mtp11-setting-card"><HardDrive/><div><b>Storage</b><span>Local MTP2026 desktop filesystem and application data</span></div><button onClick={()=>event('mtp2026:open-window',{id:'files'})}>Open files</button></div></>,
    network:<><h2>Network & internet</h2><p>Connection status and desktop network preferences.</p>
      <div className="mtp11-setting-card"><Wifi/><div><b>Connection</b><span>{navigator.onLine?'Connected to host network':'Offline'} · Live browser status</span></div><button onClick={()=>setSection('network')}>Refresh</button></div>
      <div className="mtp11-setting-card"><Globe2/><div><b>Browser access</b><span>Web applications use the MTP2026 Browser surface.</span></div><button onClick={()=>event('mtp2026:open-window',{id:'browser'})}>Open browser</button></div>
      <div className="mtp11-setting-card"><Activity/><div><b>Metered connection</b><span>Reduce optional background activity</span></div><button onClick={()=>toggle(setMetered,'mtp2026-desktop-metered',metered)}>{metered?'On':'Off'}</button></div></>,
    personalization:<><h2>Personalization</h2><p>Control the visual presentation of your MTP2026 desktop.</p>
      themeCard
      <div className="mtp11-setting-card"><Grid2X2/><div><b>Desktop layout</b><span>Reset shortcut positions to the default grid</span></div><button onClick={()=>event('mtp2026:reset-desktop-layout')}>Reset</button></div>
      <div className="mtp11-setting-card"><Activity/><div><b>Motion effects</b><span>Window and shell animations</span></div><button onClick={()=>toggle(setAnimations,'mtp2026-desktop-animations',animations)}>{animations?'Enabled':'Disabled'}</button></div></>,
    apps:<><h2>Apps</h2><p>Manage applications available in the MTP2026 Desktop shell.</p>
      <div className="mtp11-setting-card"><Store/><div><b>VexaStore</b><span>Open the MTP2026 application hub</span></div><button onClick={()=>window.open('https://www.vexastore.2bd.net/','_blank','noopener,noreferrer')}>Open</button></div>
      <div className="mtp11-setting-card"><Globe2/><div><b>MTP2026 Browser</b><span>Web application runtime surface</span></div><button onClick={()=>event('mtp2026:open-window',{id:'browser'})}>Launch</button></div>
      <div className="mtp11-setting-card"><Terminal/><div><b>Terminal</b><span>MTP2026 diagnostic shell</span></div><button onClick={()=>event('mtp2026:open-window',{id:'terminal'})}>Launch</button></div></>,
    accounts:<><h2>Accounts</h2><p>VexaAccount session and local desktop identity.</p>
      <div className="mtp11-setting-card"><UserRound/><div><b>MTP2026 User</b><span>VexaAccount protected desktop session</span></div><button onClick={()=>event('mtp2026:open-account')}>Account</button></div>
      <div className="mtp11-setting-card"><LockKeyhole/><div><b>Sign-in protection</b><span>Session security is controlled by the launcher account flow.</span></div><button onClick={()=>event('mtp2026:open-account-security')}>Review</button></div></>,
    privacy:<><h2>Privacy & security</h2><p>Local shell privacy and runtime protection.</p>
      <div className="mtp11-setting-card"><ShieldCheck/><div><b>VexaAccount protection</b><span>Authenticated session and runtime policy</span></div><button disabled>Protected</button></div>
      <div className="mtp11-setting-card"><LockKeyhole/><div><b>Lock screen</b><span>Protect the desktop when the session is idle</span></div><button onClick={()=>toggle(setLockScreen,'mtp2026-desktop-lock',lockScreen)}>{lockScreen?'Enabled':'Disabled'}</button></div>
      <div className="mtp11-setting-card"><Bell/><div><b>System notifications</b><span>Allow desktop notification panel events</span></div><button onClick={()=>toggle(setNotifications,'mtp2026-desktop-notifications',notifications)}>{notifications?'Enabled':'Disabled'}</button></div></>,
    updates:<><h2>System Update</h2><p>MTP2026 Desktop OS update channel and runtime maintenance.</p>
      <div className="mtp11-setting-card"><RefreshCw/><div><b>Update status</b><span>MTP2026 Desktop OS · version 2026.1</span></div><button onClick={()=>event('mtp2026:check-updates')}>Check</button></div>
      <div className="mtp11-setting-card"><Cpu/><div><b>ARM64 runtime</b><span>Guest image and runtime provider are managed separately from shell updates.</span></div><button onClick={()=>event('mtp2026:open-window',{id:'runtime'})}>Runtime</button></div>
      <div className="mtp11-setting-card"><ServerCog/><div><b>System services</b><span>Desktop service supervisor</span></div><button onClick={()=>event('mtp2026:open-window',{id:'services'})}>Services</button></div></>
  };
  return <div className="mtp11-settings"><aside><div className="mtp11-settings-user"><div className="mtp11-avatar">M</div><div><b>MTP2026 User</b><small>VexaAccount protected</small></div></div>{sections.map(({id,label,icon:Icon})=><button key={id} className={section===id?'active':''} onClick={()=>setSection(id)}><Icon/> {label}</button>)}</aside><main>{content[section]}</main></div>;
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
  const [services,setServices]=useState(getCoreDesktopServices);
  const [nativeServices,setNativeServices]=useState([]);
  const refresh=()=>setServices(getCoreDesktopServices());
  useEffect(()=>{
    const off=subscribeDesktopOSState(refresh);
    void nativeListServices().then(r=>{if(r?.supported)setNativeServices(Array.isArray(r.value)?r.value:[])});
    return off;
  },[]);
  const restart=()=>{
    services.forEach(s=>setDesktopServiceState(s.id,'starting'));
    setTimeout(()=>{services.forEach(s=>setDesktopServiceState(s.id,'running'));addDesktopSystemEvent('services.restarted',{count:services.length});refresh()},250);
  };
  const toggle=s=>{
    const next=s.status==='running'?'stopped':'running';
    setDesktopServiceState(s.id,next);
    addDesktopSystemEvent('service.state',{id:s.id,status:next});
    refresh();
  };
  return <div className="mtp11-monitor">
    <div className="mtp11-monitor-hero"><ServerCog/><div><b>MTP2026 System Services</b><small>Live MTP2026 service supervisor</small></div><button className="mtp11-service-restart" onClick={restart}><RefreshCw/> Restart services</button></div>
    {services.map(s=><div className="mtp11-service-row" key={s.id}><div><b>{s.id}</b><small>{s.status==='running'?'Service is running':'Service is stopped'} · MTP2026 OS core</small></div><span className={s.status==='running'?'ok':''}><CheckCircle2/> {s.status}</span><button onClick={()=>toggle(s)}>{s.status==='running'?'Stop':'Start'}</button></div>)}
    {nativeServices.length>0&&<div className="mtp11-service-native"><b>Native host services</b><span>{nativeServices.map(x=>typeof x==='string'?x:(x.name||x.id)).join(' · ')}</span></div>}
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
  const [runDialog,setRunDialog]=useState(false);
  const [search,setSearch]=useState('');
  const [startTab,setStartTab]=useState('home');
  const [accountMenu,setAccountMenu]=useState(false);
  const [pinnedApps,setPinnedApps]=useState(()=>{try{return JSON.parse(localStorage.getItem('mtp2026:desktop:pinned-apps:v1')||'["files","browser","settings","terminal","taskmgr","control"]')}catch{return ['files','browser','settings','terminal','taskmgr','control']}});
  const [recentApps,setRecentApps]=useState(()=>{try{return JSON.parse(localStorage.getItem('mtp2026:desktop:recent-apps:v1')||'[]')}catch{return []}});
  const session=useMemo(()=>readSession(),[]);
  const [osState,setOsState]=useState(()=>getDesktopOSState());
  const [locked,setLocked]=useState(()=>isDesktopLocked());
  const [windows,setWindows]=useState(()=>Array.isArray(session.windows)?session.windows:[]);
  const [active,setActive]=useState(()=>session.active||null);
  const [maximized,setMaximized]=useState(()=>session.maximized||{});
  const [minimized,setMinimized]=useState(()=>session.minimized||[]);
  const [notifications,setNotifications]=useState(false);
  const [calendar,setCalendar]=useState(false);
  const [wifiEnabled,setWifiEnabled]=useState(()=>localStorage.getItem('mtp2026-desktop-wifi')!=='off');
  const [bluetoothEnabled,setBluetoothEnabled]=useState(()=>localStorage.getItem('mtp2026-desktop-bluetooth')==='on');
  const [volumeEnabled,setVolumeEnabled]=useState(()=>localStorage.getItem('mtp2026-desktop-volume')!=='off');
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
  useEffect(()=>{const h=e=>{if(e.detail?.url){setBrowserUrl(e.detail.url);open('browser')}};window.addEventListener('mtp2026:browser-open',h);return()=>window.removeEventListener('mtp2026:browser-open',h)},[]);
  useEffect(()=>{
    const openWindow=e=>{const id=e.detail?.id;if(id)open(id)};
    const resetLayout=()=>resetDesktopLayout();
    const theme=e=>setDesktopTheme(e.detail?.theme||localStorage.getItem('mtp2026-desktop-theme')||'dark');
    window.addEventListener('mtp2026:open-window',openWindow);
    window.addEventListener('mtp2026:reset-desktop-layout',resetLayout);
    window.addEventListener('mtp2026:theme-changed',theme);
    return()=>{window.removeEventListener('mtp2026:open-window',openWindow);window.removeEventListener('mtp2026:reset-desktop-layout',resetLayout);window.removeEventListener('mtp2026:theme-changed',theme)};
  },[]);
  const [wallpaper,setWallpaper]=useState('aurora');
  const [desktopTheme,setDesktopTheme]=useState(()=>localStorage.getItem('mtp2026-desktop-theme')||'dark');
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
  useEffect(()=>subscribeDesktopOSState(state=>{setOsState(state);setLocked(Boolean(state?.security?.locked));}),[]);
  useEffect(()=>{const lock=()=>setDesktopLocked(true);window.addEventListener('mtp2026:lock-desktop',lock);return()=>window.removeEventListener('mtp2026:lock-desktop',lock)},[]);
  useEffect(()=>{ setDesktopSessionState('active'); return ()=>setDesktopSessionState('inactive'); },[]);
  useEffect(()=>{ const activeIds=new Set(windows); const state=getDesktopOSState(); Object.keys(state.processes||{}).filter(id=>id.startsWith('app:')).forEach(id=>{const appId=id.slice(4);if(!activeIds.has(appId))unregisterDesktopProcess(id)}); windows.forEach(id=>{registerDesktopProcess({id:'app:'+id,name:id,type:'application',status:minimized.includes(id)?'suspended':'running'});}); },[windows,minimized]);
  useEffect(()=>{try{localStorage.setItem('mtp2026:desktop:icon-positions:v1',JSON.stringify(iconPositions))}catch{}},[iconPositions]);
  useEffect(()=>{
    const onKey=e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='l'){e.preventDefault();if(e.altKey){setDesktopLocked(true);return;}setStart(true);setSearch('');return;}
      if((e.metaKey||e.ctrlKey)&&e.key==='r'){e.preventDefault();setRunDialog(true);return;}
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

  function close(id){unregisterDesktopProcess('app:'+id);setWindows(ws=>ws.filter(w=>w!==id));setMinimized(m=>m.filter(x=>x!==id));setMaximized(m=>{const next={...m};delete next[id];return next});if(active===id)setActive(null);setSnapped(s=>{const n={...s};delete n[id];return n});}
  function open(id){
    if(id==='store'){window.open('https://www.vexastore.2bd.net/','_blank','noopener,noreferrer');setStart(false);return;}
    const existing=windows.find(w=>w===id);
    if(!existing)setWindows(ws=>[...ws,id]);
    registerDesktopProcess({id:'app:'+id,name:id,type:'application',status:'running'});
    setRecentApps(prev=>{const next=[id,...prev.filter(x=>x!==id)].slice(0,6);try{localStorage.setItem('mtp2026:desktop:recent-apps:v1',JSON.stringify(next))}catch{};return next;});
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
    if(id==='taskmgr')body=<TaskManager windows={windows} active={active} minimized={minimized} runtime={runtime} close={close} onSelect={id=>{setActive(id);setMinimized(m=>m.filter(x=>x!==id));}}/>;
    if(id==='control')body=<ControlPanel onSettings={()=>open('settings')} onOpen={open}/>;
    if(id==='run')body=<RunDialog onClose={()=>close('run')} onOpen={open}/>;
    if(id==='runtime')body=<GuestRuntime runtime={runtime} guestState={guestState} onState={setGuestState}/>;
    if(id==='about')body=<SystemInformation runtime={runtime} guestState={guestState}/>;
    if(id==='properties')body=<PropertiesApp/>;
    if(id==='services')body=<ServiceManager/>;
    if(id==='terminal')body=<TerminalApp onOpen={open}/>;
    if(id==='legacy-terminal')body=<div className="mtp11-terminal"><div>mtp2026@desktop:~$ system-info</div><div>MTP2026 Desktop OS</div><div>Architecture: aarch64</div><div>Runtime: browser-shell / native-vm compatible</div><div>Guest profile: desktop</div><div className="cursor">█</div></div>;
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
    {locked&&<div className="mtp11-lock-screen" role="dialog" aria-modal="true">
      <div className="mtp11-lock-card">
        <LockKeyhole/>
        <div className="mtp11-lock-time">{clock.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
        <div className="mtp11-lock-date">{clock.toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'})}</div>
        <b>MTP2026 User</b>
        <small>Desktop session locked</small>
        <button onClick={()=>setDesktopLocked(false)}>Unlock session</button>
      </div>
    </div>
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
      {[
        {id:'this-pc',label:'This PC',icon:Monitor,action:()=>desktopShortcutAction('files')},
        {id:'files',label:'File Explorer',icon:FolderOpen,action:()=>desktopShortcutAction('this-pc')},
        {id:'browser',label:'MTP2026 Browser',icon:Globe2,action:()=>open('browser')},
        {id:'settings',label:'Settings',icon:Settings,action:()=>open('settings')},
        {id:'runtime',label:'Guest Runtime',icon:Cpu,action:()=>open('runtime')},
        {id:'about',label:'System Information',icon:Info,action:()=>open('about')},
        ...installed.slice(0,8).map(a=>({id:a.id,label:a.title,icon:Globe2,action:()=>open(a.id)}))
      ].map((item,index)=>{const I=item.icon;const pos=iconPositions[item.id]||{x:18+Math.floor(index/7)*96,y:18+(index%7)*88};return <button key={item.id} style={{left:pos.x,top:pos.y}} className={`mtp11-desktop-icon ${desktopSelection===item.id?'selected':''} ${draggingIcon===item.id?'dragging':''}`} onPointerDown={e=>{e.stopPropagation();moveIcon(item.id,e)}} onClick={e=>{e.stopPropagation();setDesktopSelection(item.id)}} onDoubleClick={item.action}><I/><b>{item.label}</b></button>})}
    </div>
    {windows.map(renderWindow)}
    {desktopMenu&&<div className="mtp11-context-menu" style={{left:Math.min(desktopMenu.x,window.innerWidth-210),top:Math.min(desktopMenu.y,window.innerHeight-190)}} onClick={e=>e.stopPropagation()}>
      <button onClick={()=>{setDesktopMenu(null);setWindows([]);setActive(null);}}><RefreshCw/> Refresh desktop</button>
      <button onClick={()=>{setDesktopMenu(null);desktopShortcutAction('files')}}><FolderOpen/> Open File Explorer</button><button onClick={()=>{resetDesktopLayout();setDesktopMenu(null)}}><Grid2X2/> Reset icon layout</button>
      <button onClick={()=>{setDesktopMenu(null);open('about')}}><Info/> System information</button>
      <button onClick={()=>{setDesktopMenu(null);open('settings')}}><Settings/> Personalize</button>
      <button onClick={()=>navigator.clipboard?.writeText('MTP2026 Desktop OS') }><Clipboard/> Copy system name</button>
      <button onClick={()=>{setDesktopMenu(null);open('properties')}}><Info/> Properties</button>
    </div>}
    {snapMenu&&<div className="mtp11-snap-menu" style={{left:snapMenu.x,top:snapMenu.y}} onClick={e=>e.stopPropagation()}><button onClick={()=>snapWindow(snapMenu.id,'left')}>◧ Left half</button><button onClick={()=>snapWindow(snapMenu.id,'right')}>◨ Right half</button><button onClick={()=>snapWindow(snapMenu.id,'top')}>▣ Top</button><button onClick={()=>snapWindow(snapMenu.id,'restore')}>□ Restore</button></div>}
    <div className="mtp11-window-switcher">{windows.map(id=>{const a=allApps.find(x=>x.id===id);if(!a)return null;const I=a.icon||Globe2;return <button key={id} className={active===id?'active':''} onClick={()=>{setActive(id);setMinimized(m=>m.filter(x=>x!==id));}} title={a.title}><I/></button>})}</div>
    {taskbarMenu&&<div className="mtp11-context-menu" style={{left:Math.min(taskbarMenu.x,window.innerWidth-210),top:Math.min(taskbarMenu.y,window.innerHeight-150)}} onClick={e=>e.stopPropagation()}><button onClick={()=>{restoreWindow(taskbarMenu.id);setTaskbarMenu(null)}}><Monitor/> Restore</button><button onClick={()=>{minimizeWindow(taskbarMenu.id);setTaskbarMenu(null)}}><Minus/> Minimize</button><button onClick={()=>{setMaximized(m=>({...m,[taskbarMenu.id]:true}));setSnapped(s=>{const n={...s};delete n[taskbarMenu.id];return n});restoreWindow(taskbarMenu.id);setTaskbarMenu(null)}}><Maximize2/> Maximize</button><button onClick={()=>{close(taskbarMenu.id);setTaskbarMenu(null)}}><X/> Close window</button></div>}
    {runDialog&&<RunDialog onClose={()=>setRunDialog(false)} onOpen={id=>{setRunDialog(false);open(id)}}/>}
    {start&&<div className="mtp11-start">
      <div className="mtp11-start-search"><Search/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search apps, settings, and files"/></div>
      <div className="mtp11-start-tabs"><button className={startTab==='home'?'active':''} onClick={()=>setStartTab('home')}>Home</button><button className={startTab==='all'?'active':''} onClick={()=>setStartTab('all')}>All apps</button></div>
      {startTab==='home'&&<div className="mtp11-start-home">
        <div className="mtp11-start-head"><b>Pinned</b><button onClick={()=>setStartTab('all')}>All apps ›</button></div>
        <div className="mtp11-start-grid">{pinnedApps.map(id=>{const a=allApps.find(x=>x.id===id);if(!a)return null;const I=a.icon||Globe2;return <button key={id} onClick={()=>a.kind==='web'?launchWeb(a.url):open(id)}><span><I/></span><b>{a.title}</b></button>})}</div>
        <div className="mtp11-start-head"><b>Recommended</b><span>{recentApps.length ? recentApps.length+" recent" : "No recent apps"}</span></div>
        <div className="mtp11-start-recent">{recentApps.map(id=>{const a=allApps.find(x=>x.id===id);if(!a)return null;const I=a.icon||Globe2;return <button key={id} onClick={()=>open(id)}><I/><span><b>{a.title}</b><small>Recently opened</small></span></button>})}</div>
      </div>}
      {startTab==='all'&&<><div className="mtp11-start-head"><b>All apps</b><span>{visible.length} apps</span></div><div className="mtp11-start-grid">{visible.map(a=>{const I=a.icon||Globe2;return <button key={a.id} onClick={()=>a.kind==='web'?launchWeb(a.url):open(a.id)}><span><I/></span><b>{a.title}</b></button>})}</div></>}
      <div className="mtp11-start-footer"><button className="mtp11-account" onClick={()=>setAccountMenu(v=>!v)}><div className="mtp11-avatar">M</div><span>MTP2026 User<small>VexaAccount</small></span></button><button onClick={()=>setPower(v=>!v)}><Power/></button></div>
      {accountMenu&&<div className="mtp11-account-menu"><button onClick={()=>open('settings')}><UserRound/> Account settings</button><button onClick={()=>{setRecentApps([]);localStorage.removeItem('mtp2026:desktop:recent-apps:v1')}}><RefreshCw/> Clear recent</button><button onClick={()=>setAccountMenu(false)}><X/> Close</button></div>}
    </div>}
    {quickSettings&&<div className="mtp11-quick-settings"><header><b>Quick Settings</b><button onClick={()=>setQuickSettings(false)}><X/></button></header><div className="mtp11-quick-grid">
      <button className={wifiEnabled?'on':''} onClick={()=>{setWifiEnabled(v=>{localStorage.setItem('mtp2026-desktop-wifi',v?'off':'on');return !v})}}><Wifi/><span>Wi-Fi<small>{wifiEnabled&&navigator.onLine?'Connected':'Off'}</small></span></button>
      <button className={bluetoothEnabled?'on':''} onClick={()=>{setBluetoothEnabled(v=>{localStorage.setItem('mtp2026-desktop-bluetooth',v?'off':'on');return !v})}}><Network/><span>Bluetooth<small>{bluetoothEnabled?'On':'Off'}</small></span></button>
      <button className={volumeEnabled?'on':''} onClick={()=>{setVolumeEnabled(v=>{localStorage.setItem('mtp2026-desktop-volume',v?'off':'on');return !v})}}><Volume2/><span>Volume<small>{volumeEnabled?'On':'Muted'}</small></span></button>
      <button><Monitor/><span>Display<small>Desktop</small></span></button>
      <button onClick={()=>{setQuickSettings(false);setStart(true)}}><Settings/><span>Settings<small>Open system settings</small></span></button>
    </div></div>}
    {calendar&&<div className="mtp11-calendar-panel"><header><b>{clock.toLocaleString([], {month:'long',year:'numeric'})}</b><button onClick={()=>setCalendar(false)}><X/></button></header><div className="mtp11-calendar-today"><b>{clock.toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'})}</b><span>{clock.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div><div className="mtp11-calendar-note">MTP2026 Desktop calendar</div></div>}
    {notifications&&<div className="mtp11-notification-panel"><header><b>Notifications</b><button onClick={()=>setNotifications(false)}><X/></button></header><div><Bell/><p>You're all caught up.</p><small>MTP2026 system events will appear here.</small></div></div>}
    {power&&<div className="mtp11-power"><button onClick={()=>{setDesktopPowerState('restarting');window.location.reload()}}><RefreshCw/> Restart shell</button><button onClick={onExit}><LockKeyhole/> Exit Desktop OS</button><button onClick={()=>setPower(false)}>Cancel</button></div>}
    <nav className="mtp11-taskbar">
      <button className="mtp11-start-button" onClick={()=>setStart(v=>!v)} aria-label="Start"><Grid2X2/></button>
      <button className="mtp11-search-button" onClick={()=>setStart(true)}><Search/><span>Search</span></button>
      <button className="mtp11-taskbar-run" onClick={()=>setRunDialog(true)} title="Run"><Command/></button>
      <div className="mtp11-pinned">{[['files',FolderOpen],['browser',Globe2],['settings',Settings],['system',Activity],['runtime',Cpu],['about',Info],['services',ServerCog],['taskmgr',Activity],['control',SlidersHorizontal]].map(([id,I])=><button key={id} className={`${active===id?'active ':''}${windows.includes(id)?'running':''}`} onContextMenu={e=>{e.preventDefault();setTaskbarMenu({id,x:e.clientX,y:e.clientY});}} onClick={()=>open(id)}><I/></button>)}</div>
      <div className="mtp11-tray"><Wifi/><ShieldCheck/><button onClick={()=>setNotifications(v=>!v)}><Bell/></button><button onClick={()=>setQuickSettings(v=>!v)}><Wifi/></button><button className="mtp11-clock" onClick={()=>{setCalendar(v=>!v);setNotifications(false)}}><b>{clock.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</b><small>{clock.toLocaleDateString([], {month:'numeric',day:'numeric',year:'numeric'})}</small></button><button onClick={()=>setPower(v=>!v)}><Power/></button></div>
    </nav>
  </main>;
}

export default MTP2026DesktopShell;