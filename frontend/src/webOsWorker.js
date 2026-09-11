let engine = null;
let cpu = null;
let running = false;
let guest = null;

const RAM_BASE = 0x1000;
const RAM_SIZE = 0x200000;
const KERNEL_BASE = 0x10000;
const RESULT_ADDR = 0x4000;
const BOOT_INFO_ADDR = 0x5000;
const KERNEL_READY_ADDR = 0x6000;
const BOOT_MAGIC = 0x4D54503230323641n;
const KERNEL_READY_MAGIC = 0x4D5450324B524E4Cn;
const MACHINE_VERSION = 1;
const MODES = new Set(['android', 'ios', 'windows', 'gaming']);

function movz(rd, imm16, hw = 0) { return 0xD2800000 | ((hw & 3) << 21) | ((imm16 & 0xffff) << 5) | (rd & 31); }
function movk(rd, imm16, hw = 0) { return 0xF2800000 | ((hw & 3) << 21) | ((imm16 & 0xffff) << 5) | (rd & 31); }
function write32LE(buffer, offset, value) { new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setUint32(offset, value >>> 0, true); }
function read64LE(bytes, offset = 0) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true); }
function normalizeMode(mode) { return MODES.has(mode) ? mode : 'android'; }
function modeProfile(mode) {
  const profiles = {
    android: { label: 'Android', orientation: 'portrait', viewport: [412, 915], touch: true, gamepad: false },
    ios: { label: 'iOS', orientation: 'portrait', viewport: [393, 852], touch: true, gamepad: false },
    windows: { label: 'Windows 11', orientation: 'landscape', viewport: [1440, 900], touch: false, gamepad: false },
    gaming: { label: 'Gaming', orientation: 'responsive', viewport: [1280, 720], touch: true, gamepad: true },
  };
  return profiles[normalizeMode(mode)];
}
function buildBootProgram() {
  const words = [movz(0, 0x2641, 0), movk(0, 0x3032, 1), movk(0, 0x5450, 2), movk(0, 0x4D54, 3), movz(1, RESULT_ADDR, 0), 0xF9000020, movz(0, 1, 0), 0xF9000420];
  const bytes = new Uint8Array(words.length * 4);
  words.forEach((word, index) => write32LE(bytes, index * 4, word));
  return bytes;
}
function buildKernelEntryTrampoline() {
  const words = [movz(0, BOOT_INFO_ADDR, 0), movz(1, KERNEL_BASE, 0), 0xD61F0020];
  const bytes = new Uint8Array(words.length * 4);
  words.forEach((word, index) => write32LE(bytes, index * 4, word));
  return bytes;
}
async function loadEngine() { if (engine) return engine; const module = await import('@alexaltea/unicorn-js/aarch64'); engine = await module.default(); return engine; }
async function loadKernelImage() {
  try {
    const response = await fetch('/arm64/mtp2026-arm64-kernel.bin', { cache: 'no-store' });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) return null;
    return bytes;
  } catch (_) { return null; }
}
async function loadRootfsManifest() {
  try {
    const response = await fetch('/arm64/rootfs.json', { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) { return null; }
}
function createGuest(mode, kernel = {}) {
  const profile = modeProfile(mode);
  return {
    version: MACHINE_VERSION,
    mode: normalizeMode(mode),
    profile,
    ram: RAM_SIZE,
    cpu: { architecture: 'AArch64', execution: 'WebAssembly', registers: 31, exceptionLevel: 'EL1' },
    kernel: { source: kernel.source || 'browser-generated-contract', loaded: Boolean(kernel.loaded), size: Number(kernel.size) || 0, entry: kernel.entry || null, ready: false },
    rootfs: { format: 'mtp2026-rootfs-v1', mounted: false, source: '/arm64/rootfs.json', init: '/sbin/init', services: [] },
    devices: {
      display: { width: profile.viewport[0], height: profile.viewport[1], orientation: profile.orientation, scale: 1, frame: 0, cursor: { x: 0, y: 0, visible: true } },
      input: { touch: profile.touch, keyboard: true, pointer: true, gamepad: profile.gamepad, lastEvent: null },
      storage: { type: 'IndexedDB/localStorage-backed virtual disk', mounted: true },
      network: { type: 'browser-fetch bridge', online: typeof navigator !== 'undefined' ? navigator.onLine !== false : true },
      timer: { virtualHz: 100 },
    },
    services: ['init', 'vfs', 'display', 'input', 'network', 'settings', 'app-host'],
    apps: [],
    activeAppId: null,
    bootedAt: 0,
    ticks: 0,
  };
}
function publishGuest(extra = {}) {
  postMessage({ type: 'guest-state', guest: guest ? {
    ...guest,
    profile: { ...guest.profile },
    kernel: { ...guest.kernel },
    rootfs: { ...guest.rootfs, services: [...guest.rootfs.services] },
    devices: { ...guest.devices, display: { ...guest.devices.display }, input: { ...guest.devices.input }, network: { ...guest.devices.network } },
    apps: guest.apps.map(app => ({ ...app })),
  } : null, ...extra });
}
function publishDisplay() {
  if (!guest) return;
  guest.devices.display.frame += 1;
  postMessage({ type: 'display-frame', display: { ...guest.devices.display }, guest: { mode: guest.mode, profile: { ...guest.profile }, apps: guest.apps.map(app => ({ ...app })), activeAppId: guest.activeAppId } });
}
async function boot() {
  if (running) return;
  running = true;
  postMessage({ type: 'booting', message: 'Loading AArch64 WebAssembly CPU…' });
  try {
    const uc = await loadEngine();
    const selectedMode = normalizeMode(guest?.mode || 'android');
    const kernelImage = await loadKernelImage();
    const rootfs = await loadRootfsManifest();
    guest = createGuest(selectedMode, kernelImage ? { loaded: true, source: '/arm64/mtp2026-arm64-kernel.bin', size: kernelImage.byteLength, entry: `0x${KERNEL_BASE.toString(16)}` } : {});
    if (rootfs) {
      guest.rootfs = { format: rootfs.format || 'mtp2026-rootfs-v1', mounted: true, source: '/arm64/rootfs.json', init: rootfs.init || '/sbin/init', services: Array.isArray(rootfs.services) ? rootfs.services.slice() : [] };
    }

    cpu = new uc.Unicorn(uc.ARCH_ARM64, uc.MODE_ARM);
    cpu.mem_map(RAM_BASE, RAM_SIZE, uc.PROT_ALL);

    const bootInfo = new Uint8Array(64);
    const bootView = new DataView(bootInfo.buffer);
    bootView.setBigUint64(0, BOOT_MAGIC, true);
    bootView.setUint32(8, 1, true);
    bootView.setBigUint64(16, 0n, true);
    bootView.setUint32(24, 0, true);
    bootView.setBigUint64(32, BigInt(RAM_BASE), true);
    bootView.setBigUint64(40, BigInt(RAM_SIZE), true);
    bootView.setBigUint64(48, 0n, true);
    bootView.setBigUint64(56, 0n, true);
    cpu.mem_write(BOOT_INFO_ADDR, bootInfo);

    if (kernelImage) {
      if (kernelImage.byteLength > RAM_SIZE - KERNEL_BASE) throw new Error(`ARM64 kernel image is too large: ${kernelImage.byteLength} bytes`);
      cpu.mem_write(KERNEL_BASE, kernelImage);
      cpu.mem_write(RAM_BASE, buildKernelEntryTrampoline());
      cpu.emu_start(RAM_BASE, KERNEL_BASE + kernelImage.byteLength, 0, 250000);
      const ready = read64LE(new Uint8Array(cpu.mem_read(KERNEL_READY_ADDR, 8)));
      if (ready !== KERNEL_READY_MAGIC) throw new Error(`ARM64 kernel image did not reach rust_entry: marker=0x${ready.toString(16)}`);
      guest.kernel.ready = true;
      guest.ticks = 1;
      postMessage({ type: 'ready', architecture: 'AArch64', execution: 'WebAssembly CPU emulation', bootMagic: `0x${BOOT_MAGIC.toString(16)}`, kernelEntry: `0x${KERNEL_BASE.toString(16)}`, kernelImage: { source: '/arm64/mtp2026-arm64-kernel.bin', bytes: kernelImage.byteLength }, rootfs: guest.rootfs, contract: 'MTP2026-ARM64-BOOT-v1', machineVersion: MACHINE_VERSION, mode: guest.mode, profile: guest.profile, devices: guest.devices, services: guest.services });
    } else {
      const program = buildBootProgram();
      cpu.mem_write(RAM_BASE, program);
      cpu.emu_start(RAM_BASE, RAM_BASE + program.byteLength, 0, 0);
      const result = new Uint8Array(cpu.mem_read(RESULT_ADDR, 16));
      const magic = read64LE(result); const entry = read64LE(result, 8);
      if (magic !== BOOT_MAGIC) throw new Error(`Guest boot magic failed: expected=0x${BOOT_MAGIC.toString(16)} actual=0x${magic.toString(16)}`);
      if (entry !== 1n) throw new Error(`Guest kernel entry failed: result=${entry.toString()}`);
      guest.ticks = 1;
      postMessage({ type: 'ready', architecture: 'AArch64', execution: 'WebAssembly CPU emulation', bootMagic: `0x${BOOT_MAGIC.toString(16)}`, kernelEntry: 'guest-virtual-kernel-entry', kernelImage: { source: 'fallback-contract', bytes: 0 }, rootfs: guest.rootfs, contract: 'MTP2026-ARM64-BOOT-v1', machineVersion: MACHINE_VERSION, mode: guest.mode, profile: guest.profile, devices: guest.devices, services: guest.services });
    }

    guest.bootedAt = Date.now();
    publishGuest();
    publishDisplay();
  } catch (error) {
    postMessage({ type: 'error', message: error?.stack || error?.message || String(error) });
    guest = null;
  } finally {
    try { cpu?.close?.(); } catch (_) {}
    cpu = null;
    running = false;
  }
}
function setMode(mode) {
  const next = normalizeMode(mode);
  if (!guest) guest = createGuest(next);
  else {
    guest.mode = next;
    guest.profile = modeProfile(next);
    guest.devices.display = { ...guest.devices.display, width: guest.profile.viewport[0], height: guest.profile.viewport[1], orientation: guest.profile.orientation };
    guest.devices.input = { ...guest.devices.input, touch: guest.profile.touch, gamepad: guest.profile.gamepad };
  }
  publishGuest({ type: 'mode-changed', mode: next, profile: guest.profile });
  publishDisplay();
}
function appCommand(command, payload = {}) {
  const id = String(payload.id || '');
  const app = guest?.apps?.find(item => item.id === id);
  if (!app) return postMessage({ type: 'command-result', ok: false, command, error: `Guest application not found: ${id}` });
  if (command === 'start-app' || command === 'focus-app') app.state = 'running';
  else if (command === 'minimize-app') app.state = 'minimized';
  else if (command === 'stop-app' || command === 'close-app') {
    guest.apps = guest.apps.filter(item => item.id !== id);
    if (guest.activeAppId === id) guest.activeAppId = guest.apps.find(item => item.state === 'running')?.id || null;
    publishGuest(); publishDisplay();
    return postMessage({ type: 'command-result', ok: true, command, result: { id, state: 'closed' } });
  } else return postMessage({ type: 'command-result', ok: false, command, error: `Unknown app command: ${command}` });
  guest.activeAppId = id; guest.ticks += 1; publishGuest(); publishDisplay(); postMessage({ type: 'command-result', ok: true, command, result: app });
}
function guestCommand(command, payload = {}) {
  if (!guest) return postMessage({ type: 'command-result', ok: false, command, error: 'Guest machine is not booted.' });
  guest.ticks += 1;
  if (command === 'ping') return postMessage({ type: 'command-result', ok: true, command, result: 'pong', ticks: guest.ticks });
  if (command === 'set-network') { guest.devices.network.online = Boolean(payload.online); publishGuest(); return postMessage({ type: 'command-result', ok: true, command, result: guest.devices.network }); }
  if (command === 'resize-display') {
    const width = Math.max(240, Math.min(4096, Number(payload.width) || guest.devices.display.width));
    const height = Math.max(240, Math.min(4096, Number(payload.height) || guest.devices.display.height));
    guest.devices.display.width = width; guest.devices.display.height = height; guest.devices.display.scale = Number(payload.scale) > 0 ? Number(payload.scale) : 1;
    guest.devices.display.orientation = width >= height ? 'landscape' : 'portrait';
    publishGuest(); publishDisplay();
    return postMessage({ type: 'command-result', ok: true, command, result: guest.devices.display });
  }
  if (command === 'input') {
    const event = { type: String(payload.type || 'unknown'), x: Number(payload.x) || 0, y: Number(payload.y) || 0, key: String(payload.key || ''), code: String(payload.code || ''), button: Number(payload.button) || 0, pressed: Boolean(payload.pressed), timestamp: Date.now() };
    guest.devices.input.lastEvent = event;
    if (event.type === 'pointer' || event.type === 'touch') { guest.devices.display.cursor.x = Math.max(0, Math.min(guest.devices.display.width, event.x)); guest.devices.display.cursor.y = Math.max(0, Math.min(guest.devices.display.height, event.y)); }
    publishGuest(); publishDisplay();
    return postMessage({ type: 'command-result', ok: true, command, result: event });
  }
  if (command === 'mount-app') {
    const app = { id: String(payload.id || `guest-app-${guest.apps.length + 1}`), title: String(payload.title || 'Web App'), url: String(payload.url || ''), icon: String(payload.icon || ''), state: 'running', mountedAt: Date.now() };
    if (!app.url.startsWith('https://')) return postMessage({ type: 'command-result', ok: false, command, error: 'Only HTTPS applications can be mounted.' });
    guest.apps = [...guest.apps.filter(item => item.id !== app.id), app]; guest.activeAppId = app.id; publishGuest(); publishDisplay(); return postMessage({ type: 'command-result', ok: true, command, result: app });
  }
  if (['start-app', 'focus-app', 'minimize-app', 'stop-app', 'close-app'].includes(command)) return appCommand(command, payload);
  postMessage({ type: 'command-result', ok: false, command, error: `Unknown guest command: ${command}` });
}
self.onmessage = event => {
  const data = event.data || {};
  if (data.type === 'set-mode') return setMode(data.mode);
  if (data.type === 'command') return guestCommand(data.command, data.payload);
  if (data.type === 'boot') return void boot();
  if (data.type === 'reset') { try { cpu?.close?.(); } catch (_) {} cpu = null; running = false; guest = null; postMessage({ type: 'reset' }); }
};
postMessage({ type: 'loaded', architecture: 'AArch64', execution: 'WebAssembly', machineVersion: MACHINE_VERSION });
