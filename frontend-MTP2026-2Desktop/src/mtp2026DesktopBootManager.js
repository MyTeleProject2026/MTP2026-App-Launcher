import { setDesktopBootState, addDesktopSystemEvent } from './mtp2026DesktopOSCore.js';

const KEY='mtp2026:desktop:boot-state:v1';

const initial=()=>({phase:'off',progress:0,provider:'browser-shell',startedAt:null,readyAt:null,error:null,guestState:null});

export function readDesktopBootState(){
  try{return {...initial(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return initial()}
}
function persist(state){
  try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}
  try{setDesktopBootState({phase:state.phase,progress:state.progress})}catch{}
}

/**
 * Start the usable desktop shell immediately. The ARM64 guest is optional and
 * must be started explicitly from Guest Runtime; it must never block the
 * normal desktop startup on a downloaded image, native VM, or browser limits.
 */
export async function bootDesktopOS({provider='browser-shell',onProgress}={}){
  const now=new Date().toISOString();
  const state={
    ...initial(),
    phase:'ready',
    progress:100,
    provider:'browser-shell',
    startedAt:now,
    readyAt:now,
    error:null,
    guestState:{
      phase:'browser-shell',
      running:true,
      progress:100,
      provider:'browser-shell',
      message:'Desktop shell ready. ARM64 guest runtime is optional.'
    }
  };
  persist(state);
  onProgress?.(state);
  addDesktopSystemEvent('boot.ready',{provider:'browser-shell',guestRuntime:'optional'});
  return state;
}

export async function shutdownDesktopOS(){
  // Stop a guest only when one was explicitly started. A missing guest is
  // normal and must not delay closing the shell.
  try{
    const { stopDesktopGuest } = await import('./mtp2026DesktopGuestBridge.js');
    await stopDesktopGuest();
  }catch(_){}
  const state={...readDesktopBootState(),phase:'off',progress:0,readyAt:null};
  persist(state);
  return state;
}
