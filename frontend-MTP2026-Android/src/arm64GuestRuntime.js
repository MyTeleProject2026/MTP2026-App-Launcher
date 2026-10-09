/* MTP2026 ARM64 guest execution provider.
 * Native QEMU and QEMU-WASM are preferred when installed. Web frontends use
 * the authenticated remote QEMU service; no browser-shell fallback is called a VM.
 */
import { loadGuestImage, saveGuestImage } from './guestImageStore.js';
import { bootQemuWasmGuest, stopQemuWasmGuest, qemuWasmCapabilities } from './qemuWasmGuestRuntime.js';

const DEFAULT_KERNEL_URL = '/arm64/mtp2026-arm64-kernel.bin';
const API_BASE = String(import.meta.env?.VITE_API_BASE_URL || 'https://mtp2026-app-launcher-backend.onrender.com').replace(/\/$/, '');
const remoteSessions = new Map();
let displayNode = null;

export function remoteRuntimeAvailable() {
  return Boolean(API_BASE && /^https:\/\//.test(API_BASE));
}
function nativeRuntime() { return window.MTP2026NativeGuestRuntime || null; }
function normalizeBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Blob) return value.arrayBuffer().then(buffer => new Uint8Array(buffer));
  return null;
}
async function fetchDefaultKernel() {
  const response = await fetch(DEFAULT_KERNEL_URL, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`ARM64_KERNEL_FETCH_${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error('ARM64_KERNEL_EMPTY');
  return { bytes, source: 'bundled-arm64-control-kernel' };
}
async function resolveImage(id, supplied) {
  const direct = await normalizeBytes(supplied);
  if (direct?.byteLength) return { bytes: direct, source: 'supplied' };
  const stored = await loadGuestImage(id).catch(() => null);
  if (stored?.bytes?.byteLength) return { bytes: stored.bytes, source: 'persistent-storage', metadata: stored.metadata };
  throw new Error('REAL_GUEST_IMAGE_NOT_INSTALLED');
}
function showRemoteDisplay(viewerUrl, profile) {
  if (!viewerUrl || !/^https:\/\//.test(viewerUrl)) throw new Error('REMOTE_GUEST_VIEWER_URL_INVALID');
  displayNode?.remove();
  const shell = document.createElement('section');
  shell.className = 'mtp2026-remote-guest-display';
  shell.setAttribute('role','dialog');
  shell.setAttribute('aria-label',`Running MTP2026 ${profile} guest`);
  Object.assign(shell.style,{position:'fixed',inset:'0',zIndex:'2147483000',background:'#050b14',display:'flex',flexDirection:'column'});
  const bar = document.createElement('header');
  Object.assign(bar.style,{height:'48px',flex:'0 0 48px',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 14px',background:'#101c2c',color:'#f5f8ff',font:'600 14px system-ui'});
  const label=document.createElement('span');label.textContent=`MTP2026 ${profile} · QEMU guest display`;
  const close=document.createElement('button');close.type='button';close.textContent='Hide display';close.setAttribute('aria-label','Hide guest display');
  Object.assign(close.style,{border:'1px solid #42536a',borderRadius:'9px',padding:'7px 12px',background:'#1d2b3f',color:'#fff',cursor:'pointer'});
  close.addEventListener('click',()=>{shell.remove();if(displayNode===shell)displayNode=null;});
  bar.append(label,close);
  const frame=document.createElement('iframe');frame.src=viewerUrl;frame.title=`MTP2026 ${profile} OS display and input`;frame.allow='fullscreen';frame.referrerPolicy='no-referrer';
  Object.assign(frame.style,{border:'0',width:'100%',height:'calc(100% - 48px)',background:'#000',flex:'1'});
  shell.append(bar,frame);document.body.append(shell);displayNode=shell;
}
async function bootRemoteGuest(id) {
  const response=await fetch(`${API_BASE}/api/runtime/guests/start`,{
    method:'POST',credentials:'include',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({profile:id})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.detail||result.error||`REMOTE_GUEST_START_HTTP_${response.status}`);
  if(result.realGuest!==true||result.ready!==true||result.running!==true||!result.sessionId||!result.viewerUrl) throw new Error('REMOTE_GUEST_BOOT_NOT_CONFIRMED');
  remoteSessions.set(id,result.sessionId);
  showRemoteDisplay(result.viewerUrl,id);
  window.dispatchEvent(new CustomEvent('mtp2026:guest-display',{detail:{id,viewerUrl:result.viewerUrl,sessionId:result.sessionId}}));
  return {...result,provider:'remote-qemu-system-aarch64',realGuest:true,ready:true,running:true};
}
export async function installGuestImage(id, image, metadata = {}) {
  const bytes = await normalizeBytes(image);
  if (!bytes?.byteLength) throw new Error('GUEST_IMAGE_BYTES_REQUIRED');
  await saveGuestImage(id, bytes, { ...metadata, architecture: 'arm64' });
  return { id, architecture: 'arm64', byteLength: bytes.byteLength, stored: true };
}
export async function bootArm64Guest({ id, image, storage, controlKernel = false, guestContract = null } = {}) {
  const native = nativeRuntime();
  if (native?.bootGuest) {
    const result = await native.bootGuest({ id, architecture:'arm64', class:guestContract?.class||null, image, storage, guestContract, controlKernel });
    return {...result,provider:result?.provider||'native-qemu-system-aarch64',realGuest:result?.realGuest===true};
  }
  if (!controlKernel && qemuWasmCapabilities().available) {
    const resolved = await resolveImage(id,image);
    const result = await bootQemuWasmGuest({id,image:resolved.bytes,storage,contract:guestContract});
    return {...result,provider:result?.provider||'qemu-system-aarch64-wasm',realGuest:true,ready:true};
  }
  if (!controlKernel && remoteRuntimeAvailable()) return bootRemoteGuest(id);
  return {id,provider:'none',realGuest:false,browserShell:true,imageRequired:!controlKernel,guestKind:controlKernel?'mtp2026-control-kernel':'mtp2026-owned-guest-os',storage:storage||null,reason:'REAL_GUEST_RUNTIME_NOT_CONFIGURED'};
}
export async function stopArm64Guest(id) {
  const native=nativeRuntime();
  if(native?.stopGuest) return native.stopGuest(id);
  if(qemuWasmCapabilities().available) return stopQemuWasmGuest(id);
  const sessionId=remoteSessions.get(id);
  if(sessionId) {
    const response=await fetch(`${API_BASE}/api/runtime/guests/${sessionId}/stop`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:'{}'});
    if(!response.ok) throw new Error(`REMOTE_GUEST_STOP_HTTP_${response.status}`);
    remoteSessions.delete(id);
  }
  displayNode?.remove();displayNode=null;
  return {id,stopped:true};
}
export function arm64RuntimeCapabilities() {
  const native=nativeRuntime();const qemu=qemuWasmCapabilities();
  return {native:Boolean(native?.bootGuest),qemuWasm:qemu,remoteQemu:remoteRuntimeAvailable(),cpu:'aarch64',bundledKernel:DEFAULT_KERNEL_URL,realGuestExecution:Boolean(native?.bootGuest||qemu.available||remoteRuntimeAvailable()),forbiddenCpuOnlyGuestPath:true};
}
window.MTP2026Arm64GuestRuntime=Object.freeze({installGuestImage,bootArm64Guest,stopArm64Guest,arm64RuntimeCapabilities,remoteRuntimeAvailable});
