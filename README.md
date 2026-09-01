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

The launcher uses VexaAccount as its single identity provider. The browser creates a cryptographically random OAuth `state` and PKCE verifier, stores them only for the current browser session, and sends the authorization-code request to VexaAccount. The launcher backend performs the confidential-code exchange with the VexaAccount client secret and validates the returned access token through VexaAccount `userinfo` before creating the launcher profile mapping.

The flow is:

1. User selects **Sign in with VexaAccount** in the launcher.
2. Browser creates `state`, PKCE verifier, and S256 challenge.
3. Browser opens VexaAccount `/api/sso/authorize` with the launcher client ID and exact callback URL.
4. VexaAccount authenticates the user and grants the requested scopes.
5. VexaAccount redirects to `/auth/callback` with a one-time authorization code and the original state.
6. Browser validates the state and sends the code + verifier to the launcher backend.
7. Launcher backend validates the exact redirect URI and exchanges the code with VexaAccount using the confidential client secret.
8. Launcher backend retrieves the user through VexaAccount `userinfo` and returns the launcher access/refresh session.
9. Launcher stores only the returned session material needed by the PWA and automatically refreshes an expired access token once through the VexaAccount refresh-token grant.
10. All launcher application-library API calls are scoped to the VexaAccount `sub`, so two users never share application-library rows.

### VexaAccount client registration

Create an active VexaAccount SSO client for this launcher in the VexaAccount Super Admin SSO registry. Use:

```text
Application key: mtp2026-app-launcher
Display name: MTP2026 App Launcher
Redirect URI: https://mtp2026-app-launcher.onrender.com/auth/callback
Scopes: openid profile email account session applications notifications
Environment: production
```

The generated **client secret must be stored only in the launcher backend's Render environment**. It must never be placed in frontend source, `.env.example`, Git history, or browser storage.

### Required launcher environment

Backend:

```text
DATABASE_URL=<TiDB MySQL connection URL>
TIDB_SSL=true
TIDB_SSL_REJECT_UNAUTHORIZED=true
VEXA_ACCOUNT_ISSUER_URL=https://api-vexaaccount.onrender.com
VEXA_ACCOUNT_CLIENT_ID=<VexaAccount launcher client id>
VEXA_ACCOUNT_CLIENT_SECRET=<VexaAccount launcher client secret>
VEXA_ACCOUNT_REDIRECT_URI=https://mtp2026-app-launcher.onrender.com/auth/callback
FRONTEND_ORIGIN=https://mtp2026-app-launcher.onrender.com
```

Frontend:

```text
VITE_API_BASE_URL=https://mtp2026-app-launcher-backend.onrender.com/api
VITE_VEXA_ACCOUNT_ISSUER_URL=https://api-vexaaccount.onrender.com
VITE_VEXA_ACCOUNT_CLIENT_ID=<same public launcher client id>
VITE_VEXA_ACCOUNT_REDIRECT_URI=https://mtp2026-app-launcher.onrender.com/auth/callback
```

The backend redirect URI and frontend redirect URI must be exactly the same as the URI registered in VexaAccount.

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
