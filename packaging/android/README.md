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
