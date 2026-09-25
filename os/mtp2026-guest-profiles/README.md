# MTP2026 ARM64 Guest Profiles

This directory defines the four MTP2026 guest experiences that run on the same open MTP2026 ARM64 Linux foundation:

- `mtp2026` — MTP2026 Device OS
- `android` — MTP2026 Android OS
- `desktop` — MTP2026 Desktop OS
- `gaming` — MTP2026 Gaming OS

These are **MTP2026-owned operating-system experiences**, not copies or redistributions of Apple iOS, Microsoft Windows, Android trademarked firmware, or ASUS/ROG firmware. The profile names describe the UX family the shell targets.

## Real ARM64 foundation

The kernel is a real AArch64 Linux kernel and the initramfs is a real ARM64 userspace. GitHub Actions builds the images and boots them under `qemu-system-aarch64` using the `virt` machine.

The four profiles share the kernel/runtime foundation but have distinct profile metadata and OS identity. This lets the launcher evolve toward a graphical compositor and native guest services without pretending that a browser shell is itself a firmware replacement.

## External operating-system sources

Android can optionally use a genuine open-source ARM64 guest image such as the QEMU LineageOS project. For example, `jqssun/android-lineage-qemu` publishes ARM64 VM builds and documents QEMU execution. https://github.com/jqssun/android-lineage-qemu

MTP2026 must never bundle cracked/proprietary Windows or iOS firmware. Windows ARM images must be legally obtained by the user, and generic iOS firmware virtualization is not offered as a redistributable MTP image.

## User image storage

User-imported ARM64 guest images belong in the user's local/native MTP2026 storage under an OS-specific `UserARM64Images/<profile>/` directory. They must not be uploaded into the public Git repository. A repository cannot be used as per-user persistent disk storage.
