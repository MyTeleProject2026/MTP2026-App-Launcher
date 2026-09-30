const KEY='mtp2026:desktop:session-meta:v2';
const EVENT='mtp2026:desktop-session-changed';

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
function write(session){
  try{localStorage.setItem(KEY,JSON.stringify(session));}catch{}
  emit(session);
  return session;
}

export function getDesktopSession(){return read()}
export function subscribeDesktopSession(listener){
  const handler=e=>listener(e.detail||read());
  window.addEventListener(EVENT,handler);
  return()=>window.removeEventListener(EVENT,handler);
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
