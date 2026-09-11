import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const manifest = join(root, 'os', 'arm64-kernel', 'Cargo.toml');
const outDir = join(root, 'frontend', 'public', 'arm64');
const elf = join(root, 'target', 'aarch64-unknown-none', 'release', 'mtp2026-arm64-kernel');
const image = join(outDir, 'mtp2026-arm64-kernel.bin');

if (!existsSync(manifest)) throw new Error(`ARM64 kernel manifest not found: ${manifest}`);
mkdirSync(outDir, { recursive: true });

const env = { ...process.env, RUSTFLAGS: `${process.env.RUSTFLAGS || ''} -C relocation-model=static`.trim() };
execFileSync('cargo', ['build', '--release', '--target', 'aarch64-unknown-none', '--manifest-path', manifest], { cwd: root, env, stdio: 'inherit' });
if (!existsSync(elf)) throw new Error(`ARM64 kernel ELF was not produced: ${elf}`);

try {
  execFileSync('rust-objcopy', ['-O', 'binary', '-j', '.text', '-j', '.rodata', '-j', '.data', elf, image], { cwd: root, env, stdio: 'inherit' });
} catch (_) {
  execFileSync('llvm-objcopy', ['-O', 'binary', '-j', '.text', '-j', '.rodata', '-j', '.data', elf, image], { cwd: root, env, stdio: 'inherit' });
}

console.log(`MTP2026 ARM64 kernel image: ${image}`);
