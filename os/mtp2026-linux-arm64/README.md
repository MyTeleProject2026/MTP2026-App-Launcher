# MTP2026 Device OS — ARM64

This is the production-oriented ARM64 operating-system track for MTP2026.

It is deliberately different from the browser launcher shell: this directory builds a **real bootable ARM64 Linux system** consisting of an upstream Linux ARM64 kernel, a static BusyBox userspace, an MTP2026 PID 1/init process, and an MTP2026 OS identity.

## Why this architecture

A daily-driver operating system needs a mature kernel, device drivers, memory management, storage, networking, USB, graphics, power management and hardware support. Reimplementing all of those pieces from scratch would create a research kernel rather than a usable MTP2026 OS.

MTP2026 therefore owns the userspace, system services, security model, application runtime and graphical shell while using the upstream Linux ARM64 kernel as the hardware foundation. The existing Rust MTP2026 kernel remains the experimental bare-metal/kernel-research track.

The ARM64 boot path follows the standard AArch64 Linux boot contract: the bootloader supplies initialized RAM and boot data/device-tree information before transferring control to the kernel.

## Current milestone

The builder produces:

- `mtp2026-arm64-linux.Image`
- `mtp2026-initramfs.cpio.gz`

The initramfs boots into a real MTP2026 userspace shell with:

- PID 1
- `/proc`, `/sys`, `/dev` and `/run`
- memory inspection
- storage inspection
- application-layer status
- reboot/poweroff commands
- MTP2026 OS identity in `/etc/os-release`

## Build on Ubuntu/Debian ARM64 or an x86_64 cross-build host

Install the build prerequisites:

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential bc bison flex libssl-dev libelf-dev \
  cpio curl gzip rsync \
  gcc-aarch64-linux-gnu binutils-aarch64-linux-gnu
```

Then:

```bash
cd os/mtp2026-linux-arm64
./build.sh
```

The source code is fetched from the public upstream Linux and BusyBox GitHub repositories. MTP2026 does not bundle proprietary Windows/iOS firmware into this project.

## QEMU development boot

With `qemu-system-aarch64` installed:

```bash
qemu-system-aarch64 \
  -M virt \
  -cpu cortex-a72 \
  -m 1024 \
  -nographic \
  -kernel out/artifacts/mtp2026-arm64-linux.Image \
  -initrd out/artifacts/mtp2026-initramfs.cpio.gz \
  -append 'console=ttyAMA0 rdinit=/init'
```

The expected result is a real Linux kernel boot followed by the `MTP2026>` userspace prompt.

## Roadmap to the full graphical MTP2026 OS

1. Persistent GPT/ext4 storage image and first-boot installer.
2. MTP2026 system service manager.
3. VexaAccount system service and secure credential/session bridge.
4. VexaStore package/install service.
5. Sandboxed MTP2026 application format.
6. Network manager and TLS trust store.
7. Wayland compositor + MTP2026 graphical shell.
8. Touch, keyboard, mouse, audio, camera and display services.
9. Logical/physical storage manager with native permissions.
10. MTP2026 Settings, Files, Control Center and recovery environment.
11. ARM64 hardware board profiles and signed release images.
12. Native VexaEmail, VexaTube, VexaBrowser, VexaCloud and Vexa Passwords integration.

The existing MTP2026 Device OS web shell remains the UI prototype and native-host bridge while this bootable OS becomes the underlying real operating-system target.
