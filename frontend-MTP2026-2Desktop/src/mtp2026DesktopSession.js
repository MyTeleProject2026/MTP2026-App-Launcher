const KEY='mtp2026:desktop:session-meta:v1';

export function getDesktopSession(){
  try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}
}
export function startDesktopSession(profile='desktop'){
  const session={id:globalThis.crypto?.randomUUID?.()||String(Date.now()),profile,startedAt:new Date().toISOString(),status:'active'};
  try{localStorage.setItem(KEY,JSON.stringify(session))}catch{}
  return session;
}
export function endDesktopSession(){
  const current=getDesktopSession();
  const next={...current,status:'ended',endedAt:new Date().toISOString()};
  try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}
  return next;
}
