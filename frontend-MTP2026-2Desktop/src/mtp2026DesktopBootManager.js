const KEY='mtp2026:desktop:boot-state:v1';

const initial=()=>({phase:'off',progress:0,provider:'browser-shell',startedAt:null,readyAt:null,error:null});

export function readDesktopBootState(){
  try{return {...initial(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return initial()}
}
function persist(state){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}}

export async function bootDesktopOS({provider='browser-shell',onProgress}={}){
  const phases=[
    ['firmware',12],['kernel',28],['services',52],['session',76],['shell',100]
  ];
  let state={...initial(),phase:'firmware',provider,startedAt:new Date().toISOString(),error:null};
  persist(state); onProgress?.(state);
  for(const [phase,progress] of phases){
    await new Promise(r=>setTimeout(r,90));
    state={...state,phase,progress}; persist(state); onProgress?.(state);
  }
  state={...state,phase:'ready',progress:100,readyAt:new Date().toISOString()};
  persist(state); onProgress?.(state);
  return state;
}

export function shutdownDesktopOS(){
  const state={...readDesktopBootState(),phase:'off',progress:0,readyAt:null};
  persist(state); return state;
}
