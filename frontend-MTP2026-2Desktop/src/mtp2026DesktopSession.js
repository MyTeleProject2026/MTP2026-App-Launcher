const KEY='mtp2026:desktop:session-meta:v2';
const EVENT='mtp2026:desktop-session-changed';
const LOCK_KEY='mtp2026:desktop:session-lock:v1';
const LOCK_EVENT='mtp2026:desktop-session-lock-changed';

function emit(session){
  try{window.dispatchEvent(new CustomEvent(EVENT,{detail:session}));}catch{}
  return session;
}
function read(){
  try{
    const raw=localStorage.getItem(KEY);
    if(raw)return JSON.parse(raw);
    const legacy=localStorage.getItem('mtp2026:desktop:session-meta:v1');
    return legacy?JSON.parse(legacy):{};
  }catch{return {}}
}
function emitLock(locked){
  try{window.dispatchEvent(new CustomEvent(LOCK_EVENT,{detail:{locked:Boolean(locked)}}));}catch{}
  return Boolean(locked);
}
function write(session){
  try{localStorage.setItem(KEY,JSON.stringify(session));}catch{}
  emit(session);
  return session;
}

export function getDesktopSession(){return read()}
export function subscribeDesktopSession(listener){
  const handler=e=>listener(e.detail||read());
  const storageHandler=e=>{
    if(e.key!==KEY||!e.newValue)return;
    listener(read());
  };
  window.addEventListener(EVENT,handler);
  window.addEventListener('storage',storageHandler);
  return()=>{
    window.removeEventListener(EVENT,handler);
    window.removeEventListener('storage',storageHandler);
  };
}
export function startDesktopSession(profile='desktop'){
  const current=read();
  if(current.status==='active'&&current.id)return current;
  return write({id:globalThis.crypto?.randomUUID?.()||String(Date.now()),profile,startedAt:new Date().toISOString(),status:'active'});
}
export function endDesktopSession(){
  const current=read();
  if(current.status==='ended')return current;
  return write({...current,status:'ended',endedAt:new Date().toISOString()});
}
export function refreshDesktopSession(){return write(read())}
export function isDesktopSessionLocked(){try{return localStorage.getItem(LOCK_KEY)==='locked';}catch{return false}}
export function setDesktopSessionLocked(locked){try{localStorage.setItem(LOCK_KEY,locked?'locked':'unlocked');}catch{};return emitLock(locked)}
export function subscribeDesktopSessionLock(listener){
  const handler=e=>listener(Boolean(e.detail?.locked??isDesktopSessionLocked()));
  const storageHandler=e=>{
    if(e.key!==LOCK_KEY)return;
    listener(e.newValue==='locked');
  };
  window.addEventListener(LOCK_EVENT,handler);
  window.addEventListener('storage',storageHandler);
  return()=>{
    window.removeEventListener(LOCK_EVENT,handler);
    window.removeEventListener('storage',storageHandler);
  };
}
export function clearDesktopSessionLock(){try{localStorage.removeItem(LOCK_KEY);}catch{};return emitLock(false)}
