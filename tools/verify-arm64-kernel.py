#!/usr/bin/env python3
"""Execute the generated MTP2026 ARM64 flat kernel image with Unicorn.

The flat image intentionally contains the kernel's read-only boot strings (including
its UART banner), so a string-prefix check is not a valid way to decide whether an
image is a placeholder.  The authoritative verification is actual AArch64 execution:
load the image at its linked address, provide a valid boot contract, run the entry
point, and require the kernel-ready marker written by rust_entry after initialization.
"""

from pathlib import Path
import struct

from unicorn import Uc, UC_ARCH_ARM64, UC_MODE_ARM, UC_PROT_ALL
from unicorn.arm64_const import UC_ARM64_REG_PC, UC_ARM64_REG_SP, UC_ARM64_REG_X0

ROOT = Path(__file__).resolve().parents[1]
IMAGE = ROOT / "frontend" / "public" / "arm64" / "mtp2026-arm64-kernel.bin"
ENTRY = 0x00400000
RAM_BASE = 0x00000000
RAM_SIZE = 256 * 1024 * 1024
BOOT_INFO = 0x1000
READY_FLAG = 0x6000
MEMORY_BASE = 0x08000000
MEMORY_SIZE = 0x01000000
STACK_TOP = MEMORY_BASE + MEMORY_SIZE
BOOT_MAGIC = 0x4D54503230323641
READY_MAGIC = 0x4D5450324B524E4C

image = IMAGE.read_bytes()
if not image:
    raise SystemExit("ARM64 image is empty")

# A real flat kernel image is expected to contain executable bytes and may also
# legitimately begin with .rodata in future linker layouts.  Do not classify an
# image by looking for human-readable strings; execution below is the real test.
if len(image) < 64:
    raise SystemExit(f"ARM64 image is unexpectedly small: {len(image)} bytes")

boot = bytearray(72)
struct.pack_into(
    "<QIIQIIQQQQQ",
    boot,
    0,
    BOOT_MAGIC,
    1,
    0,
    0,
    0,
    0,
    MEMORY_BASE,
    MEMORY_SIZE,
    0,
    0,
    0,
)

mu = Uc(UC_ARCH_ARM64, UC_MODE_ARM)
mu.mem_map(RAM_BASE, RAM_SIZE, UC_PROT_ALL)
mu.mem_write(ENTRY, image)
mu.mem_write(BOOT_INFO, boot)
mu.reg_write(UC_ARM64_REG_X0, BOOT_INFO)
mu.reg_write(UC_ARM64_REG_SP, STACK_TOP)
mu.reg_write(UC_ARM64_REG_PC, ENTRY)

# The kernel parks in WFE after initialization, so an instruction-count limit
# gives us a deterministic verification point without needing a wall-clock timer.
mu.emu_start(ENTRY, 0, 0, 250_000)
ready = struct.unpack("<Q", bytes(mu.mem_read(READY_FLAG, 8)))[0]
if ready != READY_MAGIC:
    pc = mu.reg_read(UC_ARM64_REG_PC)
    raise SystemExit(
        f"ARM64 kernel did not reach ready marker: pc=0x{pc:x}, marker=0x{ready:x}"
    )

print(f"MTP2026 ARM64 kernel boot verified at PC=0x{mu.reg_read(UC_ARM64_REG_PC):x}")
print(f"Image bytes: {len(image)}")
print(f"Ready marker: 0x{ready:016x}")
