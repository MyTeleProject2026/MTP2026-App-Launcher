# Legacy OS source references

This document records historical operating-system source material that may be used for research or an explicitly isolated emulator feature. These archives are not the implementation of the MTP2026 Desktop OS shell and must not replace the desktop frontend.

## MS-DOS 1.25, 2.0 and 4.0

Canonical upstream: https://github.com/microsoft/MS-DOS

Microsoft's archived repository identifies itself as containing original MS-DOS v1.25 and v2.0 source code and compiled binaries, plus MS-DOS 4.0 source code. Its README states that the files are released under the MIT License. Keep the upstream LICENSE and copyright notices with any redistributed copy.

Recommended integration policy:
- Keep historical source and binary files in a clearly named archival directory, separate from `src/`, application bundles, and runtime startup code.
- Do not execute historical binaries automatically as part of Desktop OS startup.
- Add an emulator only as a separately tested, explicitly user-launched feature, with clear architecture and compatibility limitations.
- Do not treat these 16-bit DOS binaries as a Windows 11 kernel or as a drop-in replacement for the existing desktop shell.

## GreyXor/Windows-11 repository assessment

Reference: https://github.com/GreyXor/Windows-11

The repository's GitHub page identifies it as a fork of `microsoft/MS-DOS` and lists the same historical directories (`v1.25`, `v2.0`, `v4.0`, and `v4.0-ozzie`). Its README describes MS-DOS sources as Windows 11 source code, but that description is not supported by the repository's contents. It does not provide Microsoft's original Windows 11 source code.

Therefore, do not copy this repository into the product under the claim that it is Windows 11 source code, and do not replace the MTP2026 desktop shell with it. The MTP2026 shell should remain a separately identified desktop-style environment. Genuine Windows 11 binaries or source are not included here.

## Platform packaging

The web/static site, Android APK, iOS app, and Windows package should all continue to build from `frontend-MTP2026-2Desktop`. Any future DOS emulator should be a separately gated feature with its own tests and licensing review; it must not add an OS chooser or switch the main app away from MTP2026 Desktop OS.

## Upstream references

- Microsoft MS-DOS source repository: https://github.com/microsoft/MS-DOS
- Microsoft announcement for MS-DOS 1.25 and 2.0: https://devblogs.microsoft.com/commandline/re-open-sourcing-ms-dos-1-25-and-2-0/
- GreyXor repository (a fork of the MS-DOS repository): https://github.com/GreyXor/Windows-11
