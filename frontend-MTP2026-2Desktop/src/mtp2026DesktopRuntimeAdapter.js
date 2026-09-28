const CAPABILITY_KEY='mtp2026:desktop:runtime-capability:v1';

export function detectDesktopRuntime(){
  const native=Boolean(window.__MTP2026_NATIVE_VM__||window.__MTP2026_QEMU__||window.__MTP2026_GUEST_RUNTIME__);
  const capability={
    mode:native?'native-vm':'browser-shell',
    architecture:'arm64',
    guestProfile:'desktop',
    qemuCompatible:true,
    nativeGuestAvailable:native,
    webAppRuntime:true,
    detectedAt:new Date().toISOString()
  };
  try{localStorage.setItem(CAPABILITY_KEY,JSON.stringify(capability))}catch{}
  return capability;
}

export function getDesktopRuntimeCapability(){
  try{
    const saved=JSON.parse(localStorage.getItem(CAPABILITY_KEY)||'null');
    return saved||detectDesktopRuntime();
  }catch{return detectDesktopRuntime()}
}
