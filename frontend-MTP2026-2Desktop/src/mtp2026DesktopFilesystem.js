const KEY='mtp2026:desktop:filesystem:v2';
const defaults={Desktop:[],Documents:[],Downloads:[],Pictures:[],Music:[],Videos:[]};

export function getDesktopFilesystem(){
  try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}
}
export function saveDesktopFilesystem(fs){try{localStorage.setItem(KEY,JSON.stringify(fs))}catch{}}
export function createDesktopTextFile(folder='Documents'){
  const fs=getDesktopFilesystem();
  const name='New Text Document '+new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)+'.txt';
  fs[folder]=[...(fs[folder]||[]),{name,type:'text',size:0,updatedAt:new Date().toISOString(),content:'MTP2026 Desktop OS document\\n'}];
  saveDesktopFilesystem(fs); return {fs,file:fs[folder].at(-1)};
}
