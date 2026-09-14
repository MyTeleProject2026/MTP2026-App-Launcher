# MTP2026 VexaStore installation flow

## WebApp installation — all four MTP2026 guest profiles

1. The user opens a published VexaStore application and selects **Install to MTP2026**.
2. VexaStore sends the `MTP2026_VEXASTORE_INSTALL` message to an already-open MTP2026 launcher window, or opens `/?vexastoreInstall=1&slug=<slug>` as the direct-install fallback.
3. MTP2026 validates the VexaStore origin and fetches the public VexaStore install manifest.
4. MTP2026 registers the HTTPS WebApp through the authenticated `/api/apps` endpoint, so the application belongs to the user's VexaAccount application library rather than only one browser tab.
5. MTP2026 mirrors the library entry locally for fast/offline startup.
6. The application is then visible from all four MTP2026-owned guest profiles:
   - MTP2026 Device OS
   - MTP2026 Android OS
   - MTP2026 Desktop OS
   - MTP2026 Gaming OS
7. Launching the installed entry opens its verified HTTPS WebApp URL through the current host/native external-app bridge.

This is the real installation model for WebApps: the application is registered, versioned and launchable, rather than pretending that a browser downloaded a native binary.

## Native Android APK

1. MTP2026 Device OS opens the trusted VexaStore host inside the native Android WebView.
2. A direct HTTPS `.apk` download link is intercepted by the native Android host.
3. MTP2026 creates an Android `PackageInstaller` session and streams the APK directly into the session; it does not execute or unpack the APK itself.
4. Android validates the package and applies the platform installation policy.
5. If MTP2026 is not trusted to request package installs, Android opens the system setting for the user to grant that capability.
6. The PackageInstaller session commits the application and MTP2026 reports success/failure through the native notification channel.

Android's PackageInstaller is the correct native package-install API. On ordinary third-party Android installations, platform/user approval can still be required; a completely silent install requires an appropriate privileged/device-owner deployment. MTP2026 does not bypass Android security controls.

## Browser MTP2026 shell

A normal browser cannot install an APK as a native application. The MTP2026 web shell therefore keeps APK installation as a native-host capability and reports the limitation instead of pretending that an APK was installed.

## VexaStore contract

VexaStore exposes a public HTTPS install manifest at:

`/api/platform/apps/:slug/install-manifest`

and an MTP2026 direct-install URL:

`https://mtp2026-app-launcher.onrender.com/?vexastoreInstall=1&slug=<slug>`

The native Android host only accepts APK URLs from the trusted VexaStore host allowlist.

## MTP2026 OS model

The four guest profiles are MTP2026-owned operating-system shells with different interaction models. They are not redistributed copies of proprietary Apple iOS, Microsoft Windows, Google Android or ASUS ROG firmware.

They share:

- VexaAccount identity
- VexaStore application registry
- MTP2026 storage abstraction
- Files / Settings / notifications
- application launch lifecycle

while providing different mobile, desktop and gaming UI behavior.
