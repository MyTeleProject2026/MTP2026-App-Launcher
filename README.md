# MTP2026 App Launcher

MTP2026 is the MYTELEPROJECT2026 central web/PWA application launcher. **VexaAccount is the identity provider; MTP2026 owns its launcher data, preferences, notifications and application session.**

## Current implementation

- React/Vite responsive launcher and installable PWA.
- VexaAccount Authorization Code + S256 PKCE SSO.
- Server-side login state and one-time callback consumption.
- Encrypted server-side Vexa access/refresh token storage.
- HTTP-only MTP session cookie; provider tokens never enter browser storage.
- TiDB MySQL persistence for users, applications, recent activity, preferences, notifications and SSO sessions.
- Real application metadata discovery with HTTPS/private-network protection.
- Add/remove/favorite/pin/category/sort/recent application workflows.
- Functional launcher search and filters.
- Functional launcher settings: theme, default view, open behavior and compact mode.
- Functional notification center with unread state and read/read-all actions.
- PWA install prompt and responsive navigation.
- Logout removes the local MTP session and attempts upstream Vexa refresh-token revocation.
- Production verification workflow for frontend revision, backend health, TiDB and SSO contract.

## SSO workflow

```text
MTP Sign in
  -> MTP backend /api/auth/login
  -> server-side state + PKCE
  -> VexaAccount User SSO authorization UI
  -> VexaAccount authentication/consent
  -> one-time code + state -> MTP /auth/callback
  -> MTP server-side code exchange + PKCE
  -> VexaAccount userinfo
  -> mtp_users mapping
  -> encrypted mtp_sso_sessions row
  -> HttpOnly mtp_session cookie
  -> authenticated launcher APIs
```

Production callback:

`https://mtp2026-app-launcher.onrender.com/auth/callback`

The exact callback must be registered as an active VexaAccount SSO client redirect URI. The MTP client secret belongs only in the MTP backend environment.

## API surface

### Authentication

- `GET /api/auth/login`
- `POST /api/auth/callback`
- `GET /auth/callback`
- `GET /auth/vexaaccount/callback` (compatibility alias)
- `GET /api/auth/session`
- `POST /api/auth/logout`

### Application library

- `GET /api/apps`
- `POST /api/apps`
- `POST /api/apps/:id/open`
- `GET /api/apps/recent`
- `PATCH /api/apps/:id`
- `DELETE /api/apps/:id`

### Preferences and notifications

- `GET /api/settings`
- `PATCH /api/settings`
- `GET /api/notifications`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`

All authenticated endpoints derive the identity from the server-side MTP session rather than a browser-supplied user ID.

## Database

The canonical schema is `schema.sql` and is also mirrored in `backend/schema.sql`. The backend startup runs `scripts/init-db.js`, which verifies the TiDB/MySQL connection and creates missing tables with `CREATE TABLE IF NOT EXISTS`.

## Deployment

Render hosts the MTP backend and frontend independently. Required backend secrets include the Vexa client secret and a strong `MTP_SESSION_ENCRYPTION_KEY`. `FRONTEND_ORIGIN` must contain the deployed frontend origin.

## Security boundary

MTP2026 does not implement VexaAccount registration, password recovery, email verification, 2FA or Owner authorization. Those remain VexaAccount workflows. MTP consumes the existing provider contract and must not modify VexaAccount source code for ordinary MTP work.

## Verification boundary

Source/build verification is not the same as production certification. A true production certification requires the deployed frontend/backend, real TiDB database, active VexaAccount SSO client and a real authenticated browser login to be exercised.
