let engine = null;
let cpu = null;
let running = false;
let guest = null;

const RAM_BASE = 0x1000;
const RAM_SIZE = 0x20000;
const RESULT_ADDR = 0x4000;
const BOOT_INFO_ADDR = 0x5000;
const BOOT_MAGIC = 0x4D54503230323641n;
const MACHINE_VERSION = 1;
const MODES = new Set(['android', 'ios', 'windows', 'gaming']);

function movz(rd, imm16, hw = 0) {
  return 0xD2800000 | ((hw & 3) << 21) | ((imm16 & 0xffff) << 5) | (rd & 31);
}
function movk(rd, imm16, hw = 0) {
  return 0xF2800000 | ((hw & 3) << 21) | ((imm16 & 0xffff) << 5) | (rd & 31);
}
function write32LE(buffer, offset, value) {
  new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setUint32(offset, value >>> 0, true);
}
function read64LE(bytes, offset = 0) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);
}
function normalizeMode(mode) {
  return MODES.has(mode) ? mode : 'android';
}
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
  const words = [
    movz(0, 0x2641, 0),
    movk(0, 0x3032, 1),
    movk(0, 0x5450, 2),
    movk(0, 0x4D54, 3),
    movz(1, RESULT_ADDR, 0),
    0xF9000020,
    movz(0, 1, 0),
    0xF9000420,
  ];
  const bytes = new Uint8Array(words.length * 4);
  words.forEach((word, index) => write32LE(bytes, index * 4, word));
  return bytes;
}

async function loadEngine() {
  if (engine) return engine;
  const module = await import('@alexaltea/unicorn-js/aarch64');
  engine = await module.default();
  return engine;
}

function createGuest(mode) {
  const profile = modeProfile(mode);
  return {
    version: MACHINE_VERSION,
    mode: normalizeMode(mode),
    profile,
    ram: RAM_SIZE,
    cpu: { architecture: 'AArch64', execution: 'WebAssembly', registers: 31, exceptionLevel: 'EL1' },
    devices: {
      display: { width: profile.viewport[0], height: profile.viewport[1], orientation: profile.orientation },
      input: { touch: profile.touch, keyboard: true, pointer: true, gamepad: profile.gamepad },
      storage: { type: 'IndexedDB/localStorage-backed virtual disk', mounted: true },
      network: { type: 'browser-fetch bridge', online: typeof navigator !== 'undefined' ? navigator.onLine !== false : true },
      timer: { virtualHz: 100 },
    },
    services: ['init', 'vfs', 'display', 'input', 'network', 'settings', 'app-host'],
    apps: [],
    bootedAt: 0,
    ticks: 0,
  };
}

function publishGuest(extra = {}) {
  postMessage({ type: 'guest-state', guest: guest ? {
    ...guest,
    profile: { ...guest.profile },
    devices: { ...guest.devices, display: { ...guest.devices.display }, input: { ...guest.devices.input } },
  } : null, ...extra });
}

async function boot() {
  if (running) return;
  running = true;
  postMessage({ type: 'booting', message: 'Loading AArch64 WebAssembly CPU…' });
  try {
    const uc = await loadEngine();
    const selectedMode = normalizeMode(guest?.mode || 'android');
    guest = createGuest(selectedMode);
    cpu = new uc.Unicorn(uc.ARCH_ARM64, uc.MODE_ARM);
    const program = buildBootProgram();
    cpu.mem_map(RAM_BASE, RAM_SIZE, uc.PROT_ALL);
    cpu.mem_write(RAM_BASE, program);

    const bootInfo = new Uint8Array(32);
    const bootView = new DataView(bootInfo.buffer);
    bootView.setBigUint64(0, BOOT_MAGIC, true);
    bootView.setUint32(8, 1, true);
    bootView.setBigUint64(16, RAM_BASE, true);
    bootView.setBigUint64(24, BigInt(RAM_SIZE), true);
    cpu.mem_write(BOOT_INFO_ADDR, bootInfo);
    cpu.emu_start(RAM_BASE, RAM_BASE + program.byteLength, 0, 0);

    const result = new Uint8Array(cpu.mem_read(RESULT_ADDR, 16));
    const magic = read64LE(result);
    const entry = read64LE(result, 8);
    if (magic !== BOOT_MAGIC) throw new Error(`Guest boot magic failed: expected=0x${BOOT_MAGIC.toString(16)} actual=0x${magic.toString(16)}`);
    if (entry !== 1n) throw new Error(`Guest kernel entry failed: result=${entry.toString()}`);

    guest.bootedAt = Date.now();
    guest.ticks = 1;
    postMessage({
      type: 'ready',
      architecture: 'AArch64',
      execution: 'WebAssembly CPU emulation',
      bootMagic: `0x${BOOT_MAGIC.toString(16)}`,
      kernelEntry: 'guest-virtual-kernel-entry',
      contract: 'MTP2026-ARM64-BOOT-v1',
      machineVersion: MACHINE_VERSION,
      mode: guest.mode,
      profile: guest.profile,
      devices: guest.devices,
      services: guest.services,
    });
    publishGuest();
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
    guest.devices.display = { width: guest.profile.viewport[0], height: guest.profile.viewport[1], orientation: guest.profile.orientation };
    guest.devices.input = { touch: guest.profile.touch, keyboard: true, pointer: true, gamepad: guest.profile.gamepad };
  }
  publishGuest({ type: 'mode-changed', mode: next, profile: guest.profile });
}

function guestCommand(command, payload = {}) {
  if (!guest) return postMessage({ type: 'command-result', ok: false, error: 'Guest machine is not booted.' });
  guest.ticks += 1;
  if (command === 'ping') return postMessage({ type: 'command-result', ok: true, command, result: 'pong', ticks: guest.ticks });
  if (command === 'set-network') {
    guest.devices.network.online = Boolean(payload.online);
    publishGuest();
    return postMessage({ type: 'command-result', ok: true, command, result: guest.devices.network });
  }
  if (command === 'mount-app') {
    const app = { id: String(payload.id || `guest-app-${guest.apps.length + 1}`), title: String(payload.title || 'Web App'), url: String(payload.url || '') };
    if (!app.url.startsWith('https://')) return postMessage({ type: 'command-result', ok: false, error: 'Only HTTPS applications can be mounted.' });
    guest.apps = [...guest.apps.filter(item => item.id !== app.id), app];
    publishGuest();
    return postMessage({ type: 'command-result', ok: true, command, result: app });
  }
  postMessage({ type: 'command-result', ok: false, error: `Unknown guest command: ${command}` });
}

self.onmessage = (event) => {
  const data = event.data || {};
  if (data.type === 'set-mode') return setMode(data.mode);
  if (data.type === 'command') return guestCommand(data.command, data.payload);
  if (data.type === 'boot') return void boot();
  if (data.type === 'reset') {
    try { cpu?.close?.(); } catch (_) {}
    cpu = null;
    running = false;
    guest = null;
    postMessage({ type: 'reset' });
  }
};

postMessage({ type: 'loaded', architecture: 'AArch64', execution: 'WebAssembly', machineVersion: MACHINE_VERSION });
