# MTP2026 Desktop OS — native ARM64

This directory contains the source layer for the bootable MTP2026 Desktop OS. It is separate from the Android application host and the browser static shell.

Architecture:

firmware/bootloader -> ARM64 Linux kernel -> init/root filesystem -> MTP2026 services -> MTP2026 Desktop Edition shell

The initial target is the generic ARM64 QEMU virt machine so the image can be continuously boot-tested in CI before board-specific firmware and drivers are added.

The Android package remains an application host for the Desktop Edition shell. It does not replace Android's kernel. The native OS image is an independent ARM64 operating system image.

Native image contract:
- architecture: ARM64 / AArch64
- machine: QEMU ARM64 virt
- kernel: Linux ARM64
- init: BusyBox init
- rootfs: MTP2026-owned initramfs
- boot artifact: ARM64 Linux Image + initramfs
- shell contract: MTP2026 Desktop Edition startup service

The native image is intentionally minimal at first. Graphics, GPU acceleration, Wi-Fi/Bluetooth and board-specific boot firmware are hardware profiles rather than claims of universal Android-device support.