import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = join(root, 'os', 'arm64-kernel', 'Cargo.toml');
const kernelDir = join(root, 'os', 'arm64-kernel');
const linkerScript = join(kernelDir, 'linker.ld');
const outDir = join(root, 'frontend', 'public', 'arm64');
const cargoTargetDir = join(kernelDir, 'target');
const target = 'aarch64-unknown-none';
const elf = join(cargoTargetDir, target, 'release', 'mtp2026-arm64-kernel');
const image = join(outDir, 'mtp2026-arm64-kernel.bin');

if (!existsSync(manifest)) throw new Error(`ARM64 kernel manifest not found: ${manifest}`);
if (!existsSync(linkerScript)) throw new Error(`ARM64 linker script not found: ${linkerScript}`);
mkdirSync(outDir, { recursive: true });

// Keep this helper self-contained. Some workflows invoke it without first
// installing the no_std target, which otherwise produces "can't find crate for
// core" even though the kernel source itself builds correctly.
execFileSync('rustup', ['target', 'add', target], { cwd: root, stdio: 'inherit' });

// RUSTFLAGS supplied through the environment replaces Cargo config rustflags.
// Therefore the linker script must be explicit here; otherwise the flat image
// may not place ENTRY(_start) at the executor's required 0x00400000 address.
const existingRustFlags = process.env.RUSTFLAGS || '';
const env = {
  ...process.env,
  RUSTFLAGS: `${existingRustFlags} -C relocation-model=static -C link-arg=-T${linkerScript}`.trim(),
};

execFileSync('cargo', ['build', '--release', '--target', target, '--manifest-path', manifest], {
  cwd: root,
  env,
  stdio: 'inherit',
});
if (!existsSync(elf)) throw new Error(`ARM64 kernel ELF was not produced: ${elf}`);

const sysroot = execFileSync('rustc', ['--print', 'sysroot'], {
  cwd: root,
  env,
  encoding: 'utf8',
}).trim();
const llvmBin = join(sysroot, 'lib', 'rustlib', 'x86_64-unknown-linux-gnu', 'bin');
const llvmObjcopy = join(llvmBin, 'llvm-objcopy');
const rustObjcopy = join(llvmBin, 'rust-objcopy');
const objcopy = existsSync(llvmObjcopy) ? llvmObjcopy : rustObjcopy;
if (!existsSync(objcopy)) throw new Error(`LLVM objcopy not found in ${llvmBin}. Install the Rust llvm-tools-preview component.`);

execFileSync(
  objcopy,
  ['-O', 'binary', '-j', '.text', '-j', '.rodata', '-j', '.data', elf, image],
  { cwd: root, env, stdio: 'inherit' },
);
console.log(`MTP2026 ARM64 kernel image: ${image}`);
