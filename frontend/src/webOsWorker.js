let engine = null;
let running = false;

const RAM_BASE = 0x1000;
const RAM_SIZE = 0x20000;
const RESULT_ADDR = 0x4000;
const BOOT_MAGIC = 0x4D54503230323641n;

function movz(rd, imm16, hw = 0) {
  return 0xD2800000 | ((hw & 3) << 21) | ((imm16 & 0xffff) << 5) | (rd & 31);
}
function movk(rd, imm16, hw = 0) {
  return 0xF2800000 | ((hw & 3) << 21) | ((imm16 & 0xffff) << 5) | (rd & 31);
}

function write32LE(buffer, offset, value) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.setUint32(offset, value >>> 0, true);
}

function read64LE(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(0, true);
}

function buildBootProgram() {
  const words = [
    // X0 = MTP2026 ARM64 boot contract magic (0x4D54503230323641).
    movz(0, 0x2641, 0),
    movk(0, 0x3032, 1),
    movk(0, 0x5450, 2),
    movk(0, 0x4D54, 3),
    // X1 = result address and store the boot contract marker there.
    movz(1, RESULT_ADDR, 0),
    0xF9000020,
    // X0 = 1 means the guest reached the MTP2026 virtual kernel entry point.
    movz(0, 1, 0),
    0xF9000020,
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

async function boot() {
  if (running) return;
  running = true;
  postMessage({ type: 'booting', message: 'Loading AArch64 WebAssembly CPU…' });
  try {
    const uc = await loadEngine();
    const cpu = new uc.Unicorn(uc.ARCH_ARM64, uc.MODE_ARM);
    const program = buildBootProgram();
    cpu.mem_map(RAM_BASE, RAM_SIZE, uc.PROT_ALL);
    cpu.mem_write(RAM_BASE, program);
    cpu.emu_start(RAM_BASE, RAM_BASE + program.byteLength, 0, 0);
    const result = new Uint8Array(cpu.mem_read(RESULT_ADDR, 8));
    const marker = read64LE(result);
    cpu.close();
    if (marker !== 1n) throw new Error(`Guest boot contract failed: result=${marker.toString()}`);
    postMessage({
      type: 'ready',
      architecture: 'AArch64',
      execution: 'WebAssembly CPU emulation',
      bootMagic: `0x${BOOT_MAGIC.toString(16)}`,
      kernelEntry: 'guest-virtual-kernel-entry',
    });
  } catch (error) {
    postMessage({ type: 'error', message: error?.stack || error?.message || String(error) });
  } finally {
    running = false;
  }
}

self.onmessage = (event) => {
  if (event.data?.type === 'boot') void boot();
  if (event.data?.type === 'reset') {
    running = false;
    postMessage({ type: 'reset' });
  }
};

postMessage({ type: 'loaded', architecture: 'AArch64', execution: 'WebAssembly' });
