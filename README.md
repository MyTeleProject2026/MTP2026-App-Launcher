# MTP2026 App Launcher

MTP2026 App Launcher is the central MYTELEPROJECT2026 web/PWA launcher. VexaAccount provides SSO identity, while each user's application library is stored in **TiDB MySQL** and synchronized by VexaAccount identity across devices.

## Architecture

- `frontend/` — Vite + React premium MTP2026 launcher UI and launcher PWA.
- `backend/` — Express API for VexaAccount SSO callback, application metadata discovery, library synchronization, favorites, pinned state, and recent activity.
- `database/schema/002_tidb_mysql.sql` — canonical TiDB/MySQL schema.
- `backend/schema.sql` — backend-compatible schema used by the `db:init` script.
- `render.yaml` — independent Render Web Service + Static Site deployment configuration.

## Database — TiDB MySQL

This project intentionally uses **TiDB MySQL**, not PostgreSQL. The Node.js API uses `mysql2/promise`.

For TiDB Cloud public endpoints, keep TLS enabled. TiDB's official Node.js `mysql2` guidance requires TLS for public Starter/Essential endpoints. citeturn0search11

Example:

```text
mysql://USERNAME:PASSWORD@HOST:4000/DATABASE
```

Initialize the canonical schema:

```bash
mysql --host HOST --port 4000 --user USERNAME --password DATABASE < database/schema/002_tidb_mysql.sql
```

Or use the backend initializer:

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

The frontend defaults to `http://localhost:4000/api` when `VITE_API_BASE_URL` is not configured.

## VexaAccount SSO

The browser uses authorization-code + PKCE. The frontend creates and validates the OAuth `state` and PKCE verifier before sending the authorization code to the backend. The backend exchanges the code with VexaAccount and validates the resulting bearer token through VexaAccount userinfo.

Configure:

- `VEXA_ACCOUNT_ISSUER_URL`
- `VEXA_ACCOUNT_CLIENT_ID`
- `VEXA_ACCOUNT_CLIENT_SECRET`
- `VITE_VEXA_ACCOUNT_ISSUER_URL`
- `VITE_VEXA_ACCOUNT_CLIENT_ID`
- `VITE_VEXA_ACCOUNT_REDIRECT_URI`
- `FRONTEND_ORIGIN`

Never commit the client secret or database password.

## Product behavior

Creators can add any legitimate HTTPS web application. The API attempts to discover its public title, favicon, web manifest, theme color, and PWA support. Non-PWA sites remain valid Web Apps.

The user's library is persisted in TiDB per VexaAccount subject. Favorites, pinned state, category, ordering, and recent-open timestamps are synchronized through the API rather than browser-only local storage.

The frontend uses the supplied premium dark MTP2026 theme: glass panels, purple/cyan gradients, responsive sidebar, search, filters, application cards, add-application modal, account controls, mobile navigation, PWA install prompt, and cloud synchronization status.

## Security

- Only HTTPS application URLs are accepted.
- Server-side metadata fetching blocks localhost, private, loopback, link-local, and reserved addresses to reduce SSRF risk.
- Metadata redirects are not followed during inspection.
- Application URLs open in a separate browser tab with `noopener,noreferrer`.
- OAuth state and PKCE are checked before token exchange.
- Secrets belong in Render environment variables, not source control.

## Render deployment

Render supports deploying independent services from one monorepo by assigning each service a root directory. citeturn0search0turn0search1

### API Web Service

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/api/health`

Required environment variables:

```text
DATABASE_URL=<TiDB MySQL connection URL>
TIDB_SSL=true
TIDB_SSL_REJECT_UNAUTHORIZED=true
VEXA_ACCOUNT_ISSUER_URL=<VexaAccount issuer>
VEXA_ACCOUNT_CLIENT_ID=<server client id>
VEXA_ACCOUNT_CLIENT_SECRET=<server client secret>
FRONTEND_ORIGIN=<deployed frontend origin>
```

### Frontend Static Site

- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

Required environment variables:

```text
VITE_API_BASE_URL=<deployed API>/api
VITE_VEXA_ACCOUNT_ISSUER_URL=<VexaAccount issuer>
VITE_VEXA_ACCOUNT_CLIENT_ID=<public client id>
VITE_VEXA_ACCOUNT_REDIRECT_URI=<frontend origin>/auth/callback
```

Render static sites are served through Render's global CDN and support automatic deploys from the connected Git branch. citeturn0search5

## Deployment order

1. Create/configure the TiDB MySQL database.
2. Apply `database/schema/002_tidb_mysql.sql`.
3. Deploy the backend on Render and set the TiDB + VexaAccount secrets.
4. Confirm `https://<api>/api/health` reports `database: true` and `databaseType: TiDB MySQL`.
5. Register the frontend callback URL in VexaAccount.
6. Deploy the frontend Static Site with the API and VexaAccount public variables.
7. Sign in through VexaAccount.
8. Add a HTTPS web application and verify that it appears after refreshing on another signed-in device.
