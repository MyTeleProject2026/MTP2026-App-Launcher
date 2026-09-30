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