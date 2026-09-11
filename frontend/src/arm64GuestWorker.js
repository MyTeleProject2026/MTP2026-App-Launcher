/* MTP2026 Web/PWA ARM64 execution worker.
 * Executes the actual AArch64 guest image in a dedicated WASM worker.
 * The worker owns CPU emulation so guest execution never blocks the launcher UI.
 */

let engine = null;
let unicorn = null;
let running = false;
let guestEntry = 0x00400000;
const RAM_BASE = 0x00000000;
const RAM_SIZE = 256 * 1024 * 1024;
const BOOT_INFO = 0x00001000;
const READY_FLAG = 0x00006000;
const MEMORY_BASE = 0x08000000;
const MEMORY_SIZE = 0x01000000;
const STACK_TOP = MEMORY_BASE + MEMORY_SIZE;
const BOOT_MAGIC = 0x4D54503230323641n;
const KERNEL_READY_MAGIC = 0x4D5450324B524E4Cn;

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

async function loadUnicorn() {
  if (unicorn) return unicorn;
  const module = await import('@alexaltea/unicorn-js/aarch64');
  const factory = module.default || module;
  unicorn = await factory();
  return unicorn;
}

function writeU32(view, offset, value) {
  view.setUint32(offset, Number(value) >>> 0, true);
}

function writeU64(view, offset, value) {
  view.setBigUint64(offset, BigInt(value), true);
}

function buildBootInfo() {
  const buffer = new ArrayBuffer(72);
  const view = new DataView(buffer);
  writeU64(view, 0, BOOT_MAGIC);
  writeU32(view, 8, 1);
  writeU32(view, 12, 0);
  writeU64(view, 16, 0); // no UART MMIO in browser worker
  writeU32(view, 24, 0);
  writeU32(view, 28, 0);
  writeU64(view, 32, MEMORY_BASE);
  writeU64(view, 40, MEMORY_SIZE);
  writeU64(view, 48, 0); // no DTB in the browser executor
  writeU64(view, 56, 0); // no GICD MMIO mapping
  writeU64(view, 64, 0); // no GICR MMIO mapping
  return new Uint8Array(buffer);
}

function readU64(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(0, true);
}

function currentPc(uc) {
  try { return Number(uc.reg_read_i64(uc.ARM64_REG_PC)); } catch (_) { return guestEntry; }
}

async function start(payload) {
  if (running) return;
  const bytes = payload.bytes instanceof Uint8Array ? payload.bytes : new Uint8Array(payload.bytes);
  if (!bytes.byteLength) throw new Error('ARM64_IMAGE_EMPTY');

  const uc = await loadUnicorn();
  engine = new uc.Unicorn(uc.ARCH_ARM64, uc.MODE_ARM);

  const imagePages = Math.ceil(bytes.byteLength / 0x1000) * 0x1000;
  const imageEnd = guestEntry + imagePages;
  if (imageEnd > RAM_SIZE) throw new Error('ARM64_IMAGE_TOO_LARGE');

  // Map low RAM so the guest can use its boot-info pointer and the kernel's
  // host-visible readiness marker at 0x6000, plus its linked 0x400000 image.
  engine.mem_map(RAM_BASE, RAM_SIZE, uc.PROT_ALL);
  engine.mem_write(guestEntry, bytes);
  engine.mem_write(BOOT_INFO, buildBootInfo());
  engine.reg_write_i64(uc.ARM64_REG_X0, BOOT_INFO);
  engine.reg_write_i64(uc.ARM64_REG_SP, STACK_TOP);
  engine.reg_write_i64(uc.ARM64_REG_PC, guestEntry);

  running = true;
  post('starting', {
    provider: 'web-wasm-arm64',
    architecture: 'arm64',
    entry: guestEntry,
    memoryBytes: RAM_SIZE,
  });

  // First execution slice must reach the real Rust kernel entry and write its
  // readiness marker. A mere UI transition is never treated as a successful boot.
  engine.emu_start(guestEntry, 0, 0, 250000);
  const readyBytes = engine.mem_read(READY_FLAG, 8);
  const ready = readU64(readyBytes) === KERNEL_READY_MAGIC;
  if (!ready) {
    const pc = currentPc(uc);
    throw new Error(`ARM64_KERNEL_BOOT_NOT_CONFIRMED_PC_${pc.toString(16)}`);
  }

  post('booted', {
    provider: 'web-wasm-arm64',
    architecture: 'arm64',
    entry: guestEntry,
    memoryBytes: RAM_SIZE,
    kernelReady: true,
  });

  const runSlice = () => {
    if (!running || !engine) return;
    try {
      const pc = currentPc(uc);
      engine.emu_start(pc, 0, 0, 100000);
      post('tick', { pc: currentPc(uc), running: true, kernelReady: true });
      setTimeout(runSlice, 0);
    } catch (error) {
      running = false;
      post('error', { message: String(error?.message || error || 'ARM64_EMULATION_FAILED') });
    }
  };
  runSlice();
}

function stop() {
  running = false;
  try { engine?.emu_stop?.(); } catch (_) {}
  try { engine?.close?.(); } catch (_) {}
  engine = null;
  post('stopped');
}

self.onmessage = event => {
  const { type, ...payload } = event.data || {};
  if (type === 'start') {
    void start(payload).catch(error => {
      running = false;
      post('error', { message: String(error?.message || error || 'ARM64_RUNTIME_BOOT_FAILED') });
    });
  } else if (type === 'stop') {
    stop();
  }
};
