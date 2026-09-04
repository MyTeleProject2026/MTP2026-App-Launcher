# MTP2026 App Launcher

MTP2026 App Launcher is the central MYTELEPROJECT2026 web/PWA launcher. **VexaAccount is the identity provider**; MTP2026 owns the application library, launcher-specific data and its own application session.

## Architecture

- `frontend/` — Vite + React launcher UI and PWA.
- `frontend/src/auth/vexaAuth.js` — frontend auth/session adapter; it does not implement a second identity system.
- `backend/` — Express API for VexaAccount SSO callback/token exchange, user mapping, launcher sessions, metadata discovery and application-library APIs.
- `backend/src/auth/vexaaccount-sso.js` — server-side VexaAccount SSO configuration, state/PKCE generation, authorization URL construction, code exchange, refresh and userinfo.
- `backend/src/routes/vexaaccount-auth.js` — MTP login/callback/session/logout workflow.
- `database/schema/002_tidb_mysql.sql` — canonical TiDB/MySQL schema.
- `render.yaml` — independent Render API + Static Site deployment configuration.

MTP2026 does **not** duplicate VexaAccount registration, password recovery, email verification or 2FA. Those remain VexaAccount workflows.

## VexaAccount SSO — canonical integration workflow

MTP2026 uses VexaAccount's **User frontend SSO bridge**. Do not send a signed-out browser directly to VexaAccount's protected `/api/sso/authorize` endpoint. That API endpoint expects an authenticated VexaAccount session. The browser entry point is the deployed User frontend:

```text
https://vexaaccount-management.onrender.com/#/sso/authorize?...authorization parameters...
```

The complete flow is:

```text
MTP2026 Sign in
  ↓
MTP backend GET /api/auth/login
  ↓
Generate cryptographic state + PKCE verifier + S256 challenge
  ↓
Build canonical VexaAccount User frontend URL
  ↓
VexaAccount User frontend #/sso/authorize
  ↓
Show SSO continuation + requested scopes
  ↓
If signed out → existing VexaAccount Login/Register/Forgot Password/Help/verification/2FA flow
  ↓
After authentication → resume the pending SSO request
  ↓
VexaAccount backend /api/sso/authorize
  ↓
Validate client, exact redirect URI, scopes and S256 PKCE
  ↓
Create one-time authorization code
  ↓
Redirect to MTP2026 /auth/callback with code + state
  ↓
MTP backend GET /auth/callback
  ↓
Validate state and recover server-side PKCE verifier
  ↓
VexaAccount POST /api/sso/token with client secret + verifier
  ↓
Receive access token + rotating refresh token
  ↓
VexaAccount GET /api/sso/userinfo
  ↓
Use stable VexaAccount sub as the MTP identity key
  ↓
Create MTP server-side session cookie
  ↓
MTP application-library APIs use the MTP session
```

### Canonical callback contract

The production callback is **exactly**:

```text
https://mtp2026-app-launcher.onrender.com/auth/callback
```

This path is implemented by the MTP backend and is the path that must be registered in VexaAccount. MTP also keeps `/auth/vexaaccount/callback` as a backward-compatible alias for older deployments; new registrations must use `/auth/callback`.

### Why the User frontend is required

VexaAccount deliberately separates the browser authentication experience from the protected authorization API. The User frontend provides the continuation screen, preserves the pending request during authentication and resumes it after the user signs in. This allows future applications to reuse the real VexaAccount authentication UI instead of rebuilding Login/Register/Forgot Password/verification/2FA screens.

### MTP owns only its application session

The VexaAccount access token and refresh token are never stored in browser localStorage/sessionStorage. MTP stores encrypted token material server-side and gives the browser only an HttpOnly MTP session cookie. Launcher APIs authenticate through that MTP session.

## VexaAccount client registration — production checklist

Before integrating MTP2026, an Owner/Super Admin creates an SSO application in VexaAccount:

```text
Create application
  → application key: mtp2026-app-launcher
  → register exact HTTPS redirect URI
  → grant the scopes MTP actually requests
  → activate application
  → copy the generated client secret once
  → store that secret only in the MTP backend Render service
```

For the current production client, MTP uses:

```text
Client ID:
vexa_mtp2026-app-launcher_b1f581a66224d89c

Redirect URI:
https://mtp2026-app-launcher.onrender.com/auth/callback

Provider API:
https://api-vexaaccount.onrender.com

User frontend:
https://vexaaccount-management.onrender.com
```

The URI must exactly match the VexaAccount registered redirect URI. Do not add a different path, trailing slash, wildcard or alternate hostname unless that exact value is separately registered.

**Important for the live `Invalid SSO client or redirect URI` error:** this response is produced before scope validation when VexaAccount cannot find an active client whose registered redirect URI exactly equals the callback above. The VexaAccount Owner/Super Admin registry must therefore contain the client ID above, mark it `active`, set `is_active=1`, and contain the exact callback URI. Code changes cannot safely bypass this server-side trust boundary.

## Scopes used by MTP2026

MTP should request the minimum scopes required. The current source default is:

```text
openid profile email
```

If the deployed MTP configuration requests additional scopes, those same scopes must be allowed on the VexaAccount client. VexaAccount supports:

| Scope | Grants |
|---|---|
| `openid` | Stable authorization identity subject (`sub`) |
| `profile` | Name, family name, picture, phone and country claims |
| `email` | Email and email verification state |
| `account` | VexaAccount account identity claims |
| `session` | VexaAccount session capability claim |
| `applications` | Connected-application capability claim |
| `notifications` | VexaAccount notification capability claim |

VexaAccount rejects any requested scope that is unsupported or not allowed for the registered client. Do not grant broad scopes merely to make authorization succeed.

## Required backend environment

```env
VEXA_ACCOUNT_CLIENT_SECRET=<secret issued to MTP2026>
VEXA_ACCOUNT_SSO_CONFIG={"url":"https://api-vexaaccount.onrender.com","clientId":"vexa_mtp2026-app-launcher_b1f581a66224d89c","redirectUri":"https://mtp2026-app-launcher.onrender.com/auth/callback","scopes":["openid","profile","email"],"timeoutMs":10000}
MTP_SESSION_ENCRYPTION_KEY=<long random secret>
FRONTEND_ORIGIN=https://mtp2026-app-launcher.onrender.com
```

The VexaAccount User frontend URL is intentionally canonical in MTP source code and is **not** a backend environment variable. `url` is the VexaAccount API issuer; the source-controlled User frontend origin is the browser entry point. Never put the client secret inside `VEXA_ACCOUNT_SSO_CONFIG` or any Vite `VITE_*` variable.

## Token and session lifecycle

### Authorization code

- Short-lived and single-use.
- Bound to the registered client and exact redirect URI.
- Bound to the S256 PKCE challenge.
- MTP exchanges it only from the backend.

### Access token

- Used by MTP only for VexaAccount `userinfo` and other explicitly integrated provider calls.
- MTP does not expose it to the browser.

### Refresh token

- Stored encrypted on the MTP backend.
- Used server-side when the access token is close to expiry.
- VexaAccount rotates refresh tokens; MTP replaces the stored encrypted value after refresh.

### MTP session

- Browser receives only an HttpOnly, Secure, SameSite session cookie.
- MTP maps the authenticated VexaAccount `sub` to its own `mtp_users` record.
- MTP application-library rows remain application-owned data.

## Logout and revocation behavior

MTP logout deletes the MTP server-side session and clears its cookie. If the VexaAccount application/client is disabled or its refresh token is revoked, the next required refresh fails and MTP returns the user to a signed-out state rather than treating the old session as permanently valid.

For security incidents, revoke the VexaAccount application's sessions/credentials and rotate the client secret through the VexaAccount Owner controls.

## Security rules

- Use authorization-code + S256 PKCE.
- Generate unpredictable `state` values and validate them server-side.
- Register exact production HTTPS callback URIs.
- Keep the VexaAccount client secret backend-only.
- Never put the client secret in Vite `VITE_*` variables, URLs, browser storage or source code.
- Use `userinfo.sub` as the stable VexaAccount identity key.
- Request only necessary scopes.
- Never accept an ID supplied by the browser as the authenticated identity.
- Keep VexaAccount tokens out of application-library records visible to the browser.

## Database — TiDB MySQL

This project intentionally uses **TiDB MySQL**, not PostgreSQL. The Node.js API uses `mysql2/promise`.

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
npm install
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend calls the MTP backend; VexaAccount credentials remain server-side.
