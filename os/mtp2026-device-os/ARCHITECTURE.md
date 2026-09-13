# MTP2026 Device OS — Real OS Architecture

MTP2026 Device OS is being developed as an original operating-system platform, not as a copy or redistribution of proprietary iOS firmware.

## Layer model

```text
Physical device / QEMU ARM64 machine
        │
        ▼
MTP2026 ARM64 boot + kernel
        │
        ├── memory manager
        ├── scheduler
        ├── interrupts/timers
        ├── storage + VFS
        ├── input/display drivers
        ├── networking
        └── security/process isolation
        │
        ▼
MTP2026 userspace + compositor
        │
        ├── Device Shell
        ├── Settings
        ├── Files
        ├── VexaAccount service
        ├── VexaStore service
        └── application runtime
        │
        ▼
Vexa applications
```

## Device shell

The existing launcher shell is the first UI/userspace milestone. It intentionally uses a familiar mobile interaction model while keeping MTP2026 branding, terminology and system services distinct.

The shell exposes:

- MTP2026 Device identity
- VexaAccount account management
- VexaStore application catalog
- logical storage partitions
- RAM/device capability reporting where the host exposes it
- Settings and security controls
- Files/import workflows
- system application registration
- native runtime bridge hooks

## Storage

A browser cannot safely expose raw physical iPhone disk partitions or physical RAM. The browser build therefore uses logical partitions backed by OPFS/IndexedDB and the native build can replace those backends with a native filesystem bridge.

The native operating-system target will provide a real VFS and persistent filesystem once the ARM64 kernel reaches the storage-driver milestone.

## Application model

VexaStore is the trusted package-distribution layer. Applications receive an isolated storage namespace and explicit capabilities. VexaAccount supplies user/device identity but does not replace the kernel security boundary.

## Native execution

The web shell is not the final execution layer. The production target is:

1. boot the MTP2026 ARM64 kernel on supported hardware/QEMU;
2. initialize memory, interrupts, scheduler and devices;
3. provide a userspace boundary and VFS;
4. start the MTP2026 compositor and shell;
5. start VexaAccount and VexaStore system services;
6. launch MTP2026 applications in isolated processes/sandboxes.

## Proprietary OS compatibility

MTP2026 may provide compatibility modes or import workflows for other operating systems, but it must not bundle or impersonate proprietary Apple/Microsoft firmware. Android/open-source Linux guests can be integrated from compatible published projects where their licenses permit redistribution.

This keeps MTP2026 a real, independently owned OS project instead of a fake firmware image.
