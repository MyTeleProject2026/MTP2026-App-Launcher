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

export function createDesktopFolder(folder='Documents',name='New folder'){
  const fs=getDesktopFilesystem(); const clean=String(name).trim()||'New folder';
  fs[folder]=[...(fs[folder]||[])]; if(!fs[clean]) fs[clean]=[];
  saveDesktopFilesystem(fs); return fs;
}
export function renameDesktopEntry(folder,name,nextName){
  const fs=getDesktopFilesystem(); const list=[...(fs[folder]||[])];
  const i=list.findIndex(x=>x.name===name); if(i<0) return fs;
  const clean=String(nextName).trim(); if(!clean||list.some((x,j)=>j!==i&&x.name===clean)) return fs;
  list[i]={...list[i],name:clean,updatedAt:new Date().toISOString()}; fs[folder]=list; saveDesktopFilesystem(fs); return fs;
}
export function deleteDesktopEntry(folder,name){
  const fs=getDesktopFilesystem(); fs[folder]=(fs[folder]||[]).filter(x=>x.name!==name); saveDesktopFilesystem(fs); return fs;
}
export function readDesktopEntry(folder,name){return (getDesktopFilesystem()[folder]||[]).find(x=>x.name===name)||null;}
