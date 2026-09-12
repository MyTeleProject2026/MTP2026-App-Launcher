# MTP2026 non-blocking runtime architecture

The launcher must never make the UI lifecycle depend on a slow API request. Authentication, library, settings, notifications and recent activity are independent resources. A warm cached shell may render while the backend wakes; protected operations remain server-authorized.

## Runtime rules

- UI renders independently from library/settings/notifications requests.
- Every remote request has a bounded timeout.
- GET resources use stale-while-revalidate caching.
- One failing resource does not block unrelated resources.
- Large custom icon blobs are not included in application-list payloads; icons are lazy-loaded.
- Native Android/iOS authentication returns to the launcher through an app callback/deep link; credentials are never collected by the launcher.
- Windows 11, Android, iOS and Gaming are launcher experience modes. They are not distributions of Microsoft Windows, Apple iOS, or Android and must not claim to boot those proprietary operating systems.
