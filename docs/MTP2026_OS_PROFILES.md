# MTP2026 four OS profiles

MTP2026 now treats the four selectable systems as **MTP2026-owned OS personalities** sharing one portable ARM64/application foundation:

- **MTP2026 Device OS** — mobile/gesture UI inspired by modern mobile OS patterns.
- **MTP2026 Android OS** — Android-style mobile UI, quick settings and APK host handoff.
- **MTP2026 Desktop OS** — desktop/start-menu/taskbar/file-workspace behavior inspired by Windows-style workflows.
- **MTP2026 Gaming OS** — controller-first gaming hub, performance overlay and game/application library behavior.

These profiles are not Apple iOS firmware, Microsoft Windows firmware, or an Android vendor image. They are MTP2026-owned operating-system experiences that run the MTP2026 application layer.

## Shared platform

Every profile uses:

- VexaAccount identity/session
- VexaStore application catalog
- MTP2026 WebApp registry
- MTP2026 Files/storage abstraction
- ARM64 guest runtime contract
- native installer handoff where the host actually supports it

## Application installation

VexaStore publishes a signed-by-HTTPS installation manifest for each application. MTP2026 WebApps are registered into the authenticated application library and become available to every MTP2026 guest profile.

Native packages remain host-controlled:

- Android APK → real Android PackageInstaller bridge when the host is Android.
- Windows package → real Windows installer/UAC when a Windows native host is available.
- iOS IPA → Apple-authorized distribution only; browser code never silently sideloads IPA files.
- Gaming native packages → compatible native runtime only.

A browser cannot truthfully claim that an APK/IPA/EXE was installed merely because its download completed.

## External OS references

The runtime manifest may reference published external projects/media without bundling proprietary media. For example, ARM64 Android VM work can use the published LineageOS/QEMU ecosystem, while gaming Linux can use a compatible open-source ARM64 gaming distribution. The MTP2026-owned profile remains the default portable experience.
