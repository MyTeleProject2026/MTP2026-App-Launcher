# MTP2026 App Launcher Android packaging

Canonical native Android package for the MTP2026 App Launcher web application.

Package: `com.mytele.mtp2026.launcher`.

The launcher opens the HTTPS deployment configured by `WEB_APP_URL`; override it with `-PwebAppUrl=...` when the deployment hostname changes. The documented production callback is `https://mtp2026-app-launcher.onrender.com/auth/callback`.

Build with `./gradlew assembleRelease bundleRelease`. GitHub Actions builds a real APK and AAB on every `main` push and manual run. The project targets Android API 36 and uses JDK 17 in CI.

No signing keys are committed. Configure the production signing key in the release pipeline before store publication.
