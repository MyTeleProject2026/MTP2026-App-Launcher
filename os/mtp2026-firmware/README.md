# MTP2026 ARM64 firmware and guest structure

MTP2026 provides four selectable, MTP2026-owned ARM64 guest profiles:

- **MTP2026 Device OS** — mobile MTP2026 experience
- **MTP2026 Android OS** — Android-style mobile experience with VexaAccount and APK handoff
- **MTP2026 Desktop OS** — desktop/taskbar experience with VexaAccount
- **MTP2026 Gaming OS** — controller/game-hub experience

Each profile uses the same real boot architecture:

```text
MTP2026 launcher
   |
   +-- MTP2026 ARM64 Boot Firmware
   |      U-Boot qemu_arm64_defconfig
   |
   +-- profile-specific EXT4 boot disk
   |      /extlinux/extlinux.conf
   |      /Image
   |      /initrd.cpio.gz
   |
   +-- Linux 6.16 AArch64
   |      virtio block/net/input/gpu/audio
   |
   +-- MTP2026 initramfs
   |      system services
   |      VexaAccount identity bridge
   |      VexaStore application contract
   |      MTP2026 Browser
   |
   +-- profile-specific MTP2026 graphical shell
   |
   +-- persistent profile data disk
```

The native runtime boots this chain with `qemu-system-aarch64 -M virt -bios`. QEMU's ARM `virt` machine is a virtual platform intended for guests such as Linux and supports AArch64, virtio devices and `virtio-gpu-pci`. citeturn0search0turn0search2

U-Boot's QEMU ARM64 target is used as the MTP2026-owned boot firmware foundation; U-Boot documents `qemu_arm64_defconfig` and booting it with QEMU's ARM64 `virt` machine, including VirtIO block support. citeturn1search1turn1search3

## Important platform boundary

These are **MTP2026-owned operating-system profiles**, not redistributed copies of proprietary Apple, Microsoft Windows, or Google Android firmware. The Android-style and Desktop-style profiles therefore remain MTP2026/Linux-based unless a user supplies an independently licensed/authorized external guest image.

The web/PWA deployment cannot execute a full ARM64 VM merely from JavaScript. It uses the MTP2026 browser shell unless QEMU-WASM is actually available. Native MTP2026 builds use the real QEMU AArch64 guest path.

## Build

```bash
bash tools/build-mtp2026-firmware.sh
bash os/mtp2026-guest-profiles/build-all.sh
```

The four resulting guest bundles contain the Linux kernel, initramfs, MTP2026 boot firmware, profile-specific boot disk, firmware contract, and boot manifest.
