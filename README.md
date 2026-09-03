# MTP2026 App Launcher

MTP2026 App Launcher is the central MYTELEPROJECT2026 web/PWA launcher. VexaAccount is the identity provider, while each user's application library is stored in **TiDB MySQL** and synchronized by VexaAccount identity across devices.

## Architecture

- `frontend/` — Vite + React launcher UI and PWA.
- `frontend/src/auth/vexaAuth.js` — canonical VexaAccount OAuth 2.0 authorization-code + PKCE client.
- `frontend/src/auth.js` — compatibility re-export only; it contains no second authentication implementation.
- `backend/` — Express API for the SSO callback/token exchange, application metadata discovery, library synchronization, favorites, pinned state, and recent activity.
- `database/schema/002_tidb_mysql.sql` — canonical TiDB/MySQL schema.
- `backend/schema.sql` — backend-compatible schema used by the `db:init` script.
- `render.yaml` — independent Render API + Static Site deployment configuration.

## VexaAccount SSO

MTP2026 App Launcher follows the VexaAccount external-application SSO contract without modifying the VexaAccount repository, provider environment, or SSO implementation.

VexaAccount remains the identity provider. MTP2026 owns its launcher data, local authorization, and MTP application session.

### Backend-owned SSO workflow

1. The launcher frontend starts login through `GET /api/auth/login`.
2. The MTP backend generates OAuth `state`, a PKCE verifier, and an S256 challenge.
3. The backend stores the short-lived login transaction server-side.
4. The browser is redirected to VexaAccount `/api/sso/authorize`.
5. VexaAccount authenticates the user and redirects to the already-registered launcher callback.
6. The frontend forwards only the authorization `code` and `state` to MTP `POST /api/auth/callback`.
7. The MTP backend validates state, retrieves the server-side PKCE verifier, and exchanges the code using the backend-only client secret.
8. MTP retrieves `/api/sso/userinfo` and maps the stable VexaAccount `sub` to its own user record.
9. MTP creates an HttpOnly launcher session cookie. VexaAccount access/refresh tokens are encrypted and stored in the MTP backend database, not browser storage.
10. Launcher APIs use the MTP session and automatically refresh the VexaAccount token server-side when required.
11. Logout removes the MTP server-side session.

The browser never receives the VexaAccount client secret or refresh token.

### Required backend environment

The VexaAccount integration uses the two provider-facing variables documented for external applications:

```text
VEXA_ACCOUNT_CLIENT_SECRET=<secret issued to MTP2026>
VEXA_ACCOUNT_SSO_CONFIG={"url":"https://api-vexaaccount.onrender.com","clientId":"mtp2026-app-launcher","redirectUri":"https://mtp2026-app-launcher.onrender.com/auth/callback","scopes":["openid","profile","email","account","session","applications","notifications"],"timeoutMs":10000}
```

`VEXA_ACCOUNT_SSO_CONFIG` must not contain a client secret.

MTP also requires its own independent encryption key for persisted backend session tokens:

```text
MTP_SESSION_ENCRYPTION_KEY=<long random secret>
```

### Callback compatibility

The default branch preserves the existing registered VexaAccount callback URI:

```text
https://mtp2026-app-launcher.onrender.com/auth/callback
```

This avoids requiring any modification to the VexaAccount repository or provider environment. The callback page forwards the authorization code to the MTP backend, where state validation and PKCE code exchange remain server-side.


## Database — TiDB MySQL

This project intentionally uses **TiDB MySQL**, not PostgreSQL. The Node.js API uses `mysql2/promise`.

For TiDB Cloud public endpoints, keep TLS enabled.

Initialize the canonical schema:

```bash
mysql --host HOST --port 4000 --user USERNAME --password DATABASE < database/schema/002_tidb_mysql.sql
```

Or:

```bash
cd backend
npm install
DATABASE_URL='mysql://USERNAME:PASSWORD@HOST:4000/DATABASE' npm run db:init
```

## Local development

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run db:init
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Product behavior

Users can add legitimate HTTPS web applications. The API discovers public metadata such as title, favicon, web manifest, theme color, and PWA support. Favorites, pinned state, category, ordering, and recent-open timestamps are persisted per VexaAccount identity in TiDB rather than browser-only state.

## Security

- OAuth authorization-code + S256 PKCE.
- Exact redirect URI validation at the token exchange.
- One-time authorization codes and rotating refresh tokens are managed by VexaAccount.
- Client secret stays server-side.
- Access tokens are validated against VexaAccount userinfo before use.
- Application URLs require HTTPS.
- Metadata fetching blocks private/loopback/link-local destinations to reduce SSRF risk.
- Metadata redirects are not followed during inspection.
- External application links open with `noopener,noreferrer`.
- User library rows are keyed to the VexaAccount subject.

## Render deployment

Render can deploy the API and frontend independently from this monorepo.

### API Web Service

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/api/health`

### Frontend Static Site

- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

## Verification checklist

After deployment, verify in this order:

1. `/api/health` reports `database: true`.
2. VexaAccount SSO client is active with the exact callback URI above.
3. Signed-out launcher opens VexaAccount authentication rather than receiving a raw token-exchange error.
4. A signed-in VexaAccount user completes the callback and sees their own launcher library.
5. Refreshing the launcher preserves the authenticated session until its refresh token is revoked/expired.
6. A second VexaAccount user sees a separate library.
7. Adding, favoriting, pinning, opening, and deleting an application affects only the current user.
8. Revoking the launcher application in VexaAccount causes subsequent token refresh/API requests to fail safely and return the launcher to signed-out state.
