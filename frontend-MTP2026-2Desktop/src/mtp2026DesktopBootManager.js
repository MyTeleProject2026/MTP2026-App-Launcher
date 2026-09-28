const KEY='mtp2026:desktop:boot-state:v1';

const initial=()=>({phase:'off',progress:0,provider:'browser-shell',startedAt:null,readyAt:null,error:null,guestState:null});

export function readDesktopBootState(){
  try{return {...initial(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return initial()}
}
function persist(state){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}}

function progressForPhase(phase){
  return {
    idle:0,splash:10,prepare:28,booting:55,'browser-shell':100,ready:100,error:0,stopped:0
  }[phase] ?? 15;
}

export async function bootDesktopOS({provider='browser-shell',onProgress}={}){
  const startedAt=new Date().toISOString();
  let state={...initial(),phase:'splash',progress:10,provider,startedAt,error:null};
  persist(state); onProgress?.(state);

  try{
    const { bootDesktopGuest } = await import('./mtp2026DesktopGuestBridge.js');
    state={...state,phase:'prepare',progress:28};
    persist(state); onProgress?.(state);

    const guestState=await bootDesktopGuest({
      onState: next=>{
        state={...state,phase:next.phase,progress:next.progress ?? progressForPhase(next.phase),provider:next.provider||state.provider,error:next.error||null,guestState:next};
        persist(state); onProgress?.(state);
      }
    });

    state={
      ...state,
      phase:guestState.phase==='browser-shell'||guestState.phase==='ready'?'ready':guestState.phase,
      progress:guestState.phase==='browser-shell'||guestState.phase==='ready'?100:(guestState.progress ?? progressForPhase(guestState.phase)),
      provider:guestState.provider||state.provider,
      error:guestState.error||null,
      guestState,
      readyAt:(guestState.phase==='browser-shell'||guestState.phase==='ready')?new Date().toISOString():null
    };
    persist(state); onProgress?.(state);
    return state;
  }catch(error){
    const message=String(error?.message||error||'GUEST_BOOT_FAILED');
    if (/^(GUEST_MANIFEST_UNAVAILABLE|GUEST_PROFILE_NOT_FOUND_|MTP2026_GUEST_BUNDLE_UNAVAILABLE)/.test(message)) {
      state={...state,phase:'ready',progress:100,provider:'browser-launcher',error:null,readyAt:new Date().toISOString(),guestState:{phase:'browser-shell',running:true,provider:'browser-launcher',progress:100,error:null}};
      persist(state); onProgress?.(state); return state;
    }
    state={...state,phase:'error',progress:0,error:message};
    persist(state); onProgress?.(state);
    return state;
  }
}

export async function shutdownDesktopOS(){
  try{
    const { stopDesktopGuest } = await import('./mtp2026DesktopGuestBridge.js');
    await stopDesktopGuest();
  }catch(_){}

  const state={...readDesktopBootState(),phase:'off',progress:0,readyAt:null};
  persist(state); return state;
}
