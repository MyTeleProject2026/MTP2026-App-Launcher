# MTP2026 OS

This directory is the real low-level operating-system foundation for MTP2026. It is intentionally separate from the existing React/Vite launcher and native app shells so the launcher remains intact while the operating system grows underneath it.

## Current boot milestone

The first milestone targets **x86_64 PCs and QEMU** and now provides:

- Rust `no_std` / `no_main` kernel code.
- A real bootloader-compatible kernel entry point.
- BIOS boot image generation.
- UEFI boot image generation.
- Kernel access to the bootloader-provided memory map and framebuffer metadata.
- Early serial-console output.
- A QEMU debug-exit path for automated boot smoke tests.
- A pinned nightly Rust toolchain compatible with the bootloader release.

The kernel currently initializes and halts after reporting its boot state. That is deliberate: it establishes a real bootable kernel boundary before adding higher-level subsystems.

## Build

From the repository root:

```bash
cd os
cargo build
```

The build script creates both `mtp2026-bios.img` and `mtp2026-uefi.img` under Cargo's generated build output directory.

## Run the BIOS image with QEMU

Install `qemu-system-x86` and run the generated BIOS image with a serial console. The kernel exits QEMU with the success debug-exit code after completing its initialization smoke test.

## Architecture roadmap

The next OS layers will be implemented in this order:

1. Physical-frame allocator and kernel heap.
2. Page-table / virtual-memory manager.
3. GDT, IDT, exceptions, APIC and timer interrupts.
4. Kernel scheduler and task/thread model.
5. Syscall and userspace boundary.
6. PCI/device discovery and core input/display/storage drivers.
7. VFS and a persistent filesystem.
8. Networking stack and system services.
9. Security model, users, permissions and process isolation.
10. Userspace init/service manager.
11. Graphics compositor, window manager and system shell.
12. MTP2026 launcher integration as the native desktop/application shell.

Android, iOS, Windows and gaming device support will be separate hardware/platform ports. They are not implemented by pretending that a web launcher is itself a replacement kernel.
