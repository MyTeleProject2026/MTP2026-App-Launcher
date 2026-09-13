# MTP2026 OS

MTP2026 now has two complementary real operating-system tracks:

1. **`os/kernel`** — the experimental MTP2026-owned bare-metal kernel track. This is where MTP2026 can eventually own its own kernel, scheduler, memory manager, drivers and native system ABI.
2. **`os/mtp2026-linux-arm64`** — the production-oriented ARM64 operating-system track. It boots a real upstream ARM64 Linux kernel with a MTP2026-owned userspace/initramfs and is the recommended path toward a usable daily-driver MTP2026 Device OS.

The existing React/Vite launcher and native shells remain the control-plane/application-development layer. They are not falsely classified as an operating-system kernel.

## ARM64 production OS track

`os/mtp2026-linux-arm64` builds:

- a real AArch64 Linux kernel image;
- a static BusyBox userspace;
- a real PID 1 `/init` process owned by MTP2026;
- `/proc`, `/sys`, `/dev` and `/run` initialization;
- MTP2026 OS identity and boot banner;
- memory/storage inspection commands;
- a first MTP2026 application-layer command interface;
- QEMU `virt` boot verification in GitHub Actions.

Build it with:

```bash
npm run os:arm64:build
```

The resulting artifacts are under:

```text
os/mtp2026-linux-arm64/out/artifacts/
```

The ARM64 OS builder uses the public upstream Linux and BusyBox GitHub repositories rather than copying proprietary operating-system firmware into MTP2026.

## Experimental MTP2026-owned kernel track

The Rust kernel under `os/kernel` remains the long-term research path toward a MTP2026-owned kernel. The current milestone provides:

- Rust `no_std` / `no_main` kernel code;
- bootloader-compatible kernel entry;
- BIOS and UEFI image generation;
- bootloader memory-map/framebuffer access;
- serial output;
- physical frame allocation;
- interrupt setup;
- scheduler/thread primitives;
- timer and syscall ABI foundations;
- QEMU debug-exit verification.

The ARM64 kernel under `os/arm64-kernel` is the low-level AArch64 boot-contract track. It currently validates exception vectors, timer, GIC contract and ARM64 boot information.

## Full MTP2026 Device OS roadmap

The production ARM64 Linux track will grow into the complete MTP2026 Device OS in layers:

1. Persistent disk image and first-boot installer.
2. Secure boot/recovery architecture.
3. MTP2026 system service manager.
4. VexaAccount identity service.
5. VexaStore package and application service.
6. Sandboxed MTP2026 application runtime.
7. Network manager and TLS trust store.
8. Wayland compositor and MTP2026 graphical shell.
9. Touch, keyboard, mouse, audio, camera and display services.
10. Native Settings / Files / Control Center / recovery UI.
11. Native storage partitions and permissions.
12. VexaEmail, VexaTube, VexaBrowser, VexaCloud and Vexa Passwords.
13. ARM64 hardware board profiles.
14. Signed release images and OTA update infrastructure.
15. Gradual replacement of Linux userspace components with MTP2026-owned services where that improves control, security or performance.

This architecture lets MTP2026 become a genuine operating system while avoiding the false claim that a browser application is itself an iOS/Windows/Android firmware replacement.
