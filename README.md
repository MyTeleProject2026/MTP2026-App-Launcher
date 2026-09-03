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
https://<vexaaccount-user-host>/#/sso/authorize?...authorization parameters...
```

The complete flow is:

```text
MTP2026 Sign in
  ↓
MTP backend GET /api/auth/login
  ↓
Generate cryptographic state + PKCE verifier + S256 challenge
  ↓
Build VexaAccount User frontend URL
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
MTP backend POST /api/auth/callback
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

### Why the User frontend is required

VexaAccount deliberately separates the browser authentication experience from the protected authorization API. The User frontend provides the continuation screen, preserves the pending request during authentication and resumes it after the user signs in. This allows future applications to reuse the real VexaAccount authentication UI instead of rebuilding Login/Register/Forgot Password/verification/2FA screens.

### MTP owns only its application session

The VexaAccount access token and refresh token are never stored in browser localStorage/sessionStorage. MTP stores encrypted token material server-side and gives the browser only an HttpOnly MTP session cookie. Launcher APIs authenticate through that MTP session.

## VexaAccount client registration

Before integrating MTP2026, an Owner/Super Admin creates an SSO application in VexaAccount:

```text
Create application
  → choose application key
  → register exact HTTPS redirect URI
  → grant only required scopes
  → activate application
  → receive client ID + client secret
```

For this launcher, the production callback is:

```text
https://mtp2026-app-launcher.onrender.com/auth/callback
```

The URI must exactly match the VexaAccount registered redirect URI. Do not add a different path, trailing slash, wildcard or alternate hostname unless that exact value is separately registered.

## Scopes used by MTP2026

MTP should request the minimum scopes required. The current default example intentionally uses:

```text
openid profile email
```

These provide the launcher with a stable subject, display identity and verified email without requesting broader account/session/application/notification claims that the launcher does not need for its core library workflow.

If a future MTP feature genuinely needs additional VexaAccount claims, add the scope to the VexaAccount client's allowed scopes **and** to MTP's `scopes` array. VexaAccount rejects any requested scope that is unsupported or not allowed for the registered client.

### Available VexaAccount scopes

| Scope | Grants | Use it when | Do not request it merely because |
|---|---|---|---|
| `openid` | OpenID-style identity subject (`sub`) and the authorization-code identity contract | Always request it for an identity/SSO login | You want extra profile data; `openid` itself is not a profile bundle |
| `profile` | `name`, `given_name`, `family_name`, `picture`, `phone_number`, `country` | The app needs a user's display/profile information | The app only needs an internal user ID |
| `email` | `email` and `email_verified` | The app needs the user's email address or verification state | The app can operate entirely from `sub` |
| `account` | `account_id` and `vexa_account=true` | The app explicitly needs VexaAccount account-level identity semantics | You only need `sub`; `sub` is already the stable external identity key |
| `session` | `vexa_session=true` | The app has a feature that explicitly needs to know that the SSO session claim is available | You want to manage authentication locally; MTP's own session is separate |
| `applications` | `vexa_applications=true` | The app needs an explicit indication that application/connected-app claims were granted | The app only needs to know who signed in |
| `notifications` | `vexa_notifications=true` | The app has a feature that explicitly consumes VexaAccount notification capability/claim state | The app has its own notifications unrelated to VexaAccount |

**Important:** these scopes are not interchangeable. Requesting a scope does not grant arbitrary access to VexaAccount databases or APIs. It grants the claims defined by the SSO `userinfo` implementation for that scope. The integrating application should request the smallest set necessary for its feature set.

## How to add a scope correctly

Example: a future MTP feature needs the user's VexaAccount profile picture.

1. In VexaAccount Owner/Super Admin SSO application settings, add `profile` to the client's allowed scopes.
2. In MTP backend `VEXA_ACCOUNT_SSO_CONFIG`, add `profile` to `scopes`.
3. Redeploy the MTP backend.
4. Start a new SSO authorization; previously issued tokens keep their original granted scope.
5. Read the corresponding `userinfo` claim only after confirming the scope is present.

For example:

```env
VEXA_ACCOUNT_SSO_CONFIG={"url":"https://api-vexaaccount.onrender.com","userUrl":"https://<vexaaccount-user-host>","clientId":"mtp2026-app-launcher","redirectUri":"https://mtp2026-app-launcher.onrender.com/auth/callback","scopes":["openid","profile","email"],"timeoutMs":10000}
```

Never put the client secret inside this JSON. The secret belongs only in `VEXA_ACCOUNT_CLIENT_SECRET` on the MTP backend.

## Required backend environment

```env
VEXA_ACCOUNT_CLIENT_SECRET=<secret issued to MTP2026>
VEXA_ACCOUNT_SSO_CONFIG={"url":"https://api-vexaaccount.onrender.com","userUrl":"https://<vexaaccount-user-host>","clientId":"mtp2026-app-launcher","redirectUri":"https://mtp2026-app-launcher.onrender.com/auth/callback","scopes":["openid","profile","email"],"timeoutMs":10000}
MTP_SESSION_ENCRYPTION_KEY=<long random secret>
FRONTEND_ORIGIN=https://mtp2026-app-launcher.onrender.com
```

`url` is the VexaAccount API issuer. `userUrl` is the VexaAccount User frontend origin. They may be different deployments and must not be confused.

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

Users add legitimate HTTPS web applications. The API discovers title, favicon, manifest, theme color and PWA support. Favorites, pinned state, category, ordering and recent-open timestamps are persisted per VexaAccount identity in TiDB.

## Render deployment

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

After deployment:

1. `/api/health` reports the database is available.
2. The VexaAccount client is active.
3. The exact callback URI is registered.
4. `userUrl` points to the deployed VexaAccount User frontend.
5. Signed-out MTP login opens `#/sso/authorize`, not the protected VexaAccount API authorization endpoint directly.
6. The VexaAccount User frontend shows its SSO continuation and sends a signed-out user through the normal VexaAccount authentication/recovery flow.
7. After authentication, VexaAccount resumes the pending request and returns `code` + `state` to MTP.
8. MTP exchanges the code server-side and validates `userinfo.sub`.
9. The browser receives only the MTP HttpOnly session cookie.
10. A second VexaAccount user receives a separate MTP library.
11. Refreshing the launcher preserves the MTP session while the VexaAccount refresh lifecycle remains valid.
12. Disabling/revoking the VexaAccount client causes future provider operations to fail safely.
13. Adding, favoriting, pinning, opening and deleting applications affects only the current MTP user.

## Troubleshooting SSO

### `Authentication required` from `/api/sso/authorize`

Do not test the protected provider authorization API as if it were a public login page. Start from the VexaAccount User frontend `#/sso/authorize` URL. The User frontend is responsible for getting the user authenticated and then calling the protected authorization endpoint.

### `Invalid SSO client or redirect URI`

Check all three values character-for-character:

```text
client_id
redirect_uri
VexaAccount registered redirect URI
```

Also verify that the client is active.

### `Requested scope is not allowed`

The scope must be one of VexaAccount's supported scopes **and** be included in the client's allowed scopes. Remove unnecessary scopes or update the client registration.

### `PKCE verification failed`

The MTP backend must send the same verifier corresponding to the S256 challenge used in the authorization request. Never generate a new verifier between authorization and token exchange.

### Login works but MTP does not create a session

Check that the callback reached the MTP frontend/backend, the state transaction still exists, the authorization code is unused/not expired, the client secret is correct, and `/api/sso/userinfo` returns a stable `sub`.

## Related VexaAccount documentation

When integrating another application, start with the VexaAccount repository documentation rather than copying MTP-specific code:

- VexaAccount `README.md` — platform architecture, complete SSO model and scope reference.
- `docs/SSO_INTEGRATION.md` — provider SSO contract.
- `docs/VexaAccount-SSO-Frontend-Integration.md` — canonical User frontend browser bridge.
- `integrations/vexaaccount-node-backend/README.md` — reusable backend integration guidance.

The VexaAccount User frontend owns the authentication UI. The integrating application owns its own application session and application-specific data.
