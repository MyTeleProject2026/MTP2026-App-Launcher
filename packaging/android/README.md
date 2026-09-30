# MTP2026 Android packages

This module produces two independent Android products from the same maintained source:

| Variant | Application ID | Runtime | Purpose |
|---|---|---|---|
| `userRelease` | `com.mytele.mtp2026.launcher` | MTP2026 App Launcher | End-user application launcher + VexaAccount SSO |
| `ownerRelease` | `com.mytele.vexaaccount.ownercontrol` | VexaAccount Owner Control Center | Owner/Super Admin control-plane shell |

## Build

```bash
./gradlew assembleUserRelease bundleUserRelease
./gradlew assembleOwnerRelease bundleOwnerRelease
```

Optional URL overrides:

```bash
./gradlew assembleUserRelease -PwebAppUrl=https://mtp2026-app-launcher.onrender.com
./gradlew assembleOwnerRelease -PownerWebAppUrl=https://vexaaccount-management.onrender.com/super-admin.html
```

Release signing is intentionally supplied by environment variables and never committed:
`KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.

## Runtime security

The APK contains no VexaAccount Client Secret. SSO uses the backend-managed session and the registered VexaAccount redirect URI. The Owner APK points to the canonical VexaAccount Owner Control Center runtime; its owner authorization remains enforced by VexaAccount's authenticated Super Admin backend.

## Launcher icons

Adaptive and legacy launcher resources are checked into the Android source. They are vector resources so the Android resource compiler does not depend on a malformed PNG/SVG payload.

## MTP2026 Desktop Edition Android package

The `desktop` flavor is the Android host package for **MTP2026 Desktop Edition**.

| Variant | Application ID | Runtime | Orientation |
|---|---|---|---|
| `desktopDebug` | `com.mtp2026.desktop` | MTP2026 Desktop Edition at `https://mtp2026-desktopos.onrender.com` | Landscape |

Build locally:

```bash
cd packaging/android
./gradlew assembleDesktopDebug bundleDesktopDebug
```

The dedicated GitHub Actions workflow publishes an installable debug APK and a debug AAB as the `mtp2026-desktop-edition-android` artifact. The package is an Android application host for the existing MTP2026 Desktop Edition shell; it does not replace Android's kernel or claim that Android itself is a bootable MTP2026 kernel.

## Desktop APK guest core

The Desktop flavor is built as a self-contained Android application host for the MTP2026 Desktop Edition. Its CI workflow first builds the real MTP2026 ARM64 `desktop` guest profile, including the Linux ARM64 kernel, initramfs, native MTP2026 UI/services, ARM64 browser runtime, firmware, and boot disk. Those verified guest artifacts are copied into the APK under `assets/desktop-guest/` and are automatically imported into the application's private guest storage on first launch.

The Android host therefore carries the Desktop OS guest media instead of merely linking to the web shell. The APK is still an Android host: importing a Linux ARM64 guest does not replace the Android kernel or make arbitrary Android hardware boot MTP2026. Actual direct device boot requires a device-specific native QEMU/bootloader or hardware port.
