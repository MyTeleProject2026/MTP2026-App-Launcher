# MTP2026 VexaStore APK installation flow

## Native Android

1. MTP2026 Device OS opens the trusted VexaStore host inside the native WebView.
2. A direct HTTPS `.apk` download link is intercepted by the native Android host.
3. MTP2026 creates an Android `PackageInstaller` session and streams the APK directly into the session; it does not execute or unpack the APK itself.
4. Android validates the package and applies the platform installation policy.
5. If MTP2026 is not trusted to request package installs, Android opens the system setting for the user to grant that capability.
6. The PackageInstaller session commits the application and MTP2026 reports success/failure through the native notification channel.

Android's PackageInstaller is the correct native package-install API. On ordinary third-party Android installations, platform/user approval can still be required; a completely silent install requires an appropriate privileged/device-owner deployment. MTP2026 does not bypass Android security controls.

## Browser MTP2026 shell

A normal browser cannot install an APK as a native application. The MTP2026 web shell therefore exposes the installer as unavailable and directs users to the native MTP2026 Android build instead of pretending that an APK was installed.

## VexaStore contract

VexaStore should expose HTTPS APK download links. Optional integration can call:

```js
window.MTP2026AppInstaller?.installApk({
  url: 'https://www.vexastore.2bd.net/path/app.apk',
  packageName: 'com.example.app',
  appName: 'Example App'
});
```

The native host only accepts APK URLs from the trusted VexaStore host allowlist.

## MTP2026 application lifecycle

After PackageInstaller reports success, the application becomes available to Android's package manager. The MTP2026 launcher can then refresh its application registry and show the application in the MTP2026 Device OS application surface.
