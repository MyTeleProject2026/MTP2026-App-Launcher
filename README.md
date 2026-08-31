# MTP2026 App Launcher

Central MYTELEPROJECT2026 web/PWA application launcher.

## Product vision

MTP2026 App Launcher is a VexaAccount-connected launcher for web applications. Creators can add an arbitrary HTTPS web-app URL, create an application entry, and organize applications in a cloud-synchronized library.

The application library is associated with the signed-in VexaAccount profile so the same library can be restored on another device after SSO login. Actual browser PWA installation remains device-specific.

## Planned architecture

- VexaAccount SSO / OIDC authentication
- Profile and account switching
- Server-side application library
- Add URL -> Create Application
- Website metadata and favicon discovery
- PWA manifest/installability detection
- Search, categories, favorites and pinned apps
- Responsive desktop/mobile launcher
- Secure HTTPS URL validation
- REST API and persistent database

## Repository layout

```text
frontend/   Launcher web/PWA client
backend/    API, authentication and metadata services
database/   Schema and migrations
docs/       Architecture and integration documentation
```

## Security

MTP2026 should never treat a user-supplied URL as trusted server-side input. URL validation, SSRF protections for metadata fetching, authentication, authorization and safe redirect/open behavior are required before production deployment.

## Status

Initial repository scaffold. Implementation will be added incrementally with VexaAccount integration points kept configurable through environment variables.
