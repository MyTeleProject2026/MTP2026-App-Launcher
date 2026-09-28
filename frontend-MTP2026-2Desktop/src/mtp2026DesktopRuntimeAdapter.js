const CAPABILITY_KEY='mtp2026:desktop:runtime-capability:v1';

function controllerState(){
  return globalThis.MTP2026GuestBoot?.getGuestState?.() || null;
}

export function detectDesktopRuntime(){
  const native=Boolean(globalThis.MTP2026NativeGuestRuntime?.bootGuest || globalThis.__MTP2026_NATIVE_VM__);
  const qemu=Boolean(globalThis.MTP2026QemuWasmGuestRuntime?.qemuWasmCapabilities?.().available || globalThis.MTP2026QemuWasmGuestRuntime?.boot || globalThis.__MTP2026_QEMU__);
  const guest=controllerState();
  const mode=guest?.provider==='native-vm'||native
    ? 'native-vm'
    : guest?.provider==='qemu-wasm'||qemu
      ? 'qemu-wasm'
      : guest?.provider==='browser-launcher'
        ? 'browser-shell'
        : 'browser-shell';

  const capability={
    mode,
    architecture:'arm64',
    guestProfile:'desktop',
    qemuCompatible:true,
    nativeGuestAvailable:native,
    qemuWasmAvailable:qemu,
    guestControllerAvailable:Boolean(globalThis.MTP2026GuestBoot),
    guestRunning:Boolean(guest?.running),
    guestPhase:guest?.phase||'idle',
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
