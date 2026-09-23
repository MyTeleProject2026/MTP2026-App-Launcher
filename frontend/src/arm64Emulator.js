import MUnicorn from '@alexaltea/unicorn-js/aarch64';

const CODE_BASE = 0x100000;
const STACK_BASE = 0x400000;
const STACK_SIZE = 0x100000;
const CODE_SIZE = 0x200000;

function hex(v) {
  return '0x' + BigInt(v).toString(16).padStart(16, '0');
}

function resolveConstant(uc, names) {
  for (const name of names) if (uc[name] !== undefined) return uc[name];
  throw new Error(`Unicorn.js constant unavailable: ${names.join(', ')}`);
}

export async function createARM64CPU() {
  const uc = await MUnicorn();
  const engine = new uc.Unicorn(uc.ARCH_ARM64, uc.MODE_ARM);
  engine.mem_map(CODE_BASE, CODE_SIZE, uc.PROT_ALL);
  engine.mem_map(STACK_BASE, STACK_SIZE, uc.PROT_ALL);

  const regs = {
    x0: resolveConstant(uc, ['ARM64_REG_X0']),
    x1: resolveConstant(uc, ['ARM64_REG_X1']),
    x2: resolveConstant(uc, ['ARM64_REG_X2']),
    x3: resolveConstant(uc, ['ARM64_REG_X3']),
    sp: resolveConstant(uc, ['ARM64_REG_SP']),
    pc: resolveConstant(uc, ['ARM64_REG_PC'])
  };

  const write64 = (reg, value) => engine.reg_write_i64(reg, BigInt(value));
  const read64 = reg => engine.reg_read_i64(reg);

  write64(regs.sp, BigInt(STACK_BASE + STACK_SIZE - 0x10));
  write64(regs.pc, BigInt(CODE_BASE));

  return {
    uc, engine, regs,
    async run(bytes, options = {}) {
      if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
      if (!bytes.length || bytes.length % 4 !== 0) throw new Error('ARM64 code must contain a non-empty multiple of 4 bytes.');
      if (bytes.length > CODE_SIZE) throw new Error('ARM64 code image exceeds the browser VM code region.');
      engine.mem_write(CODE_BASE, bytes);
      write64(regs.pc, BigInt(CODE_BASE));
      const start = Number(options.start ?? CODE_BASE);
      const end = Number(options.end ?? (CODE_BASE + bytes.length));
      const instructionCount = Number(options.instructionCount ?? 0);
      engine.emu_start(start, end, 0, instructionCount);
      return {
        pc: hex(read64(regs.pc)),
        x0: hex(read64(regs.x0)),
        x1: hex(read64(regs.x1)),
        x2: hex(read64(regs.x2)),
        x3: hex(read64(regs.x3))
      };
    },
    close() { engine.close(); }
  };
}

export function parseARM64ELF(buffer) {
  const b = new Uint8Array(buffer);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 64 || b[0] !== 0x7f || b[1] !== 0x45 || b[2] !== 0x4c || b[3] !== 0x46) throw new Error('Not an ELF image.');
  if (b[4] !== 2 || b[5] !== 1) throw new Error('Only little-endian ELF64 images are supported.');
  if (v.getUint16(18, true) !== 0xb7) throw new Error('ELF is not AArch64 (EM_AARCH64).');
  const entry = Number(v.getBigUint64(24, true));
  const phoff = Number(v.getBigUint64(32, true));
  const phentsize = v.getUint16(54, true);
  const phnum = v.getUint16(56, true);
  const segments = [];
  for (let i=0;i<phnum;i++) {
    const p = phoff + i * phentsize;
    if (p + 56 > b.length) throw new Error('ELF program header is truncated.');
    const type = v.getUint32(p, true);
    if (type !== 1) continue;
    const offset = Number(v.getBigUint64(p+8, true));
    const vaddr = Number(v.getBigUint64(p+16, true));
    const filesz = Number(v.getBigUint64(p+32, true));
    const memsz = Number(v.getBigUint64(p+40, true));
    if (offset + filesz > b.length) throw new Error('ELF segment exceeds image size.');
    segments.push({ offset, vaddr, filesz, memsz });
  }
  return { entry, segments };
}

export async function executeARM64Image(buffer, options = {}) {
  const cpu = await createARM64CPU();
  try {
    const parsed = buffer instanceof ArrayBuffer && new Uint8Array(buffer)[0] === 0x7f ? parseARM64ELF(buffer) : null;
    const image = parsed ? buffer : buffer;
    if (parsed) {
      for (const s of parsed.segments) {
        if (s.vaddr < CODE_BASE || s.vaddr + s.memsz > CODE_BASE + CODE_SIZE) throw new Error('ELF segment is outside the MTP2026 browser VM address space.');
        const bytes = new Uint8Array(image, s.offset, s.filesz);
        cpu.engine.mem_write(s.vaddr, bytes);
      }
      cpu.engine.reg_write_i64(cpu.regs.pc, BigInt(parsed.entry));
      cpu.engine.emu_start(parsed.entry, parsed.entry + Number(options.maxBytes || 0x1000), 0, Number(options.instructionCount || 100000));
      return { format:'ELF64-AArch64', entry:hex(parsed.entry), pc:hex(cpu.engine.reg_read_i64(cpu.regs.pc)), x0:hex(cpu.engine.reg_read_i64(cpu.regs.x0)), x1:hex(cpu.engine.reg_read_i64(cpu.regs.x1)) };
    }
    return await cpu.run(new Uint8Array(image), options);
  } finally { cpu.close(); }
}
