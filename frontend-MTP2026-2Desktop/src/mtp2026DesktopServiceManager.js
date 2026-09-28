const KEY='mtp2026:desktop:services:v1';
const DEFAULTS=[
  {id:'display',name:'Display & Window Manager',status:'running',critical:true},
  {id:'shell',name:'Desktop Shell',status:'running',critical:true},
  {id:'network',name:'Network Service',status:'running',critical:false},
  {id:'account',name:'VexaAccount Session',status:'running',critical:true},
  {id:'store',name:'VexaStore Integration',status:'running',critical:false},
  {id:'filesystem',name:'Local File Service',status:'running',critical:true},
  {id:'notifications',name:'Notification Service',status:'running',critical:false}
];
export function getDesktopServices(){
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');return Array.isArray(saved)?saved:DEFAULTS.map(x=>({...x}))}catch{return DEFAULTS.map(x=>({...x}))}
}
export function setDesktopService(id,status){
  const next=getDesktopServices().map(s=>s.id===id?{...s,status}:s);
  try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}
  return next;
}
export function restartDesktopServices(){
  const stopped=getDesktopServices().map(s=>({...s,status:'starting'}));
  try{localStorage.setItem(KEY,JSON.stringify(stopped))}catch{}
  const running=stopped.map(s=>({...s,status:'running'}));
  try{localStorage.setItem(KEY,JSON.stringify(running))}catch{}
  return running;
}
