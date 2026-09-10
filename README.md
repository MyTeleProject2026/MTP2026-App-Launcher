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
- Cross-device launcher synchronization keyed by the stable VexaAccount subject.
- Connected-application records and device presence records without copying third-party cookies or raw third-party tokens.

## Current production deployment

The MTP backend is deployed as the Render web service `MTP2026-App-Launcher-Backend` at `https://mtp2026-app-launcher-backend.onrender.com`, using the `main` branch and the `backend` root directory. The current deployed repair for cross-origin VexaAccount SSO session handling is commit `e4bf3df54f7392a14e5d0e45e459163dc55d0ad1` and the Render deployment was reported live after deployment.

A live deployment is not by itself end-to-end certification. The authenticated browser flow must still be verified through the deployed frontend, VexaAccount authorization, callback, MTP session, protected APIs and logout.

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

### Cross-device synchronization

- `GET /api/sync` — atomic launcher restore payload for the authenticated VexaAccount identity.
- `GET /api/connections` — connected/restored application state.
- `PUT /api/apps/:id/connection` — application connection metadata; never stores third-party cookies or raw provider tokens.
- `GET /api/devices` — devices that have recently used this MTP identity.

The launcher sends a locally generated opaque device identifier so the backend can maintain device presence. Applications, favorites, pin state, ordering, categories, preferences and notifications are loaded from TiDB by `mtp_users.id`, which is deterministically mapped from the VexaAccount subject. A new device therefore restores the same launcher data after signing into the same VexaAccount.

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

## VexaAccount Owner Source Repair boundary

Consumer-side source repairs may be prepared through the VexaAccount Owner SSO Control System when the MTP repository is authorized/allowlisted. The Owner workflow is repository-aware: it can analyze the bounded source tree, identify relevant authentication/session/routing candidates, prepare a precise repair plan, show affected files/findings, generate reviewed repair source, run fresh preflight checks and commit only after explicit Owner approval. MTP remains the owner of its own consumer-side implementation; VexaAccount remains the identity provider and control-plane authority.

## Verification boundary

Source/build verification is not the same as production certification. A true production certification requires the deployed frontend/backend, real TiDB database, active VexaAccount SSO client and a real authenticated browser login to be exercised. In particular, verify `/api/auth/session`, protected launcher endpoints such as `/api/apps`, `/api/apps/recent`, `/api/settings` and `/api/notifications`, and logout after the callback succeeds.

## VexaAccount-first sign-in UX

MTP2026 is a VexaAccount relying application. The launcher does not own, validate, store, or proxy user passwords.

The MTP2026 login surface provides:

- **Continue with VexaAccount** for normal SSO and account reuse.
- Email hint entry before redirecting to the registered VexaAccount Authorization Code + S256 PKCE flow.
- A password-shaped sign-in form for familiar account UX, but credentials are never submitted to MTP2026; authentication, password entry, 2FA, account creation, recovery and verification continue on the VexaAccount origin.
- **Forgot password**, **Create one**, and **Help with signing in** routes that take the user to VexaAccount instead of creating a second identity system.
- **Manage VexaAccount** and **Switch account** controls in the signed-in account menu.
- Profile name, email and avatar supplied only by the VexaAccount OIDC-style userinfo response.

This keeps one authoritative identity system while allowing MTP2026 to provide a Google/YouTube-style account entry point and then return to the launcher with a backend-managed session.

## Documentation maintenance

Keep this README synchronized with the actual `main` branch implementation. Distinguish source implementation, CI/build verification, Render deployment state and true end-to-end runtime certification. Do not describe an in-progress or unverified browser flow as certified.
