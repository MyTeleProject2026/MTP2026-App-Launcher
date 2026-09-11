/* Web/PWA ARM64 execution worker.
 * Runs Unicorn.js off the UI thread so guest execution cannot freeze the launcher.
 * This is a CPU execution backend: it executes a supplied AArch64 binary image.
 */

let engine = null;
let unicorn = null;
let running = false;
let entry = 0x00400000n;
let memorySize = 128 * 1024 * 1024;

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function toNumber(value) {
  return Number(BigInt(value));
}

async function loadUnicorn() {
  if (unicorn) return unicorn;
  const module = await import('@alexaltea/unicorn-js/aarch64');
  unicorn = await (module.default || module)();
  return unicorn;
}

async function start(payload) {
  if (running) return;
  const bytes = payload.bytes instanceof Uint8Array ? payload.bytes : new Uint8Array(payload.bytes);
  if (!bytes.byteLength) throw new Error('ARM64_IMAGE_EMPTY');

  const uc = await loadUnicorn();
  engine = new uc.Unicorn(uc.ARCH_ARM64, uc.MODE_ARM);

  const base = toNumber(entry);
  const page = 0x1000;
  const imagePages = Math.ceil(bytes.byteLength / page) * page;
  const ram = Math.max(memorySize, imagePages + 0x200000);
  engine.mem_map(base, ram, uc.PROT_ALL);
  engine.mem_write(base, bytes);

  running = true;
  post('booted', {
    provider: 'web-wasm-arm64',
    architecture: 'arm64',
    entry: base,
    memoryBytes: ram,
  });

  const runSlice = () => {
    if (!running || !engine) return;
    try {
      // Count-based slices keep the browser worker responsive and allow stopGuest().
      engine.emu_start(base, 0, 0, 100000);
      let pc = base;
      try { pc = Number(engine.reg_read_i64(uc.ARM64_REG_PC)); } catch (_) {}
      post('tick', { pc, running: true });
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
  if (type === 'start') void start(payload).catch(error => post('error', { message: String(error?.message || error) }));
  else if (type === 'stop') stop();
};
