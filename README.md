# MTP2026 App Launcher

Premium MYTELEPROJECT2026 web/PWA application launcher connected to VexaAccount SSO.

## What is implemented

- VexaAccount OAuth/OIDC authorization-code + PKCE integration points.
- Responsive premium dark MTP2026 launcher UI based on the supplied template theme.
- Search, Favorites, Recent, PWA Ready and Web App views/filters.
- Add Application modal with HTTPS validation and live URL preview.
- Server-side title, favicon, manifest and theme-color discovery.
- Safe server-side metadata fetching with private-network/localhost blocking.
- TiDB Cloud MySQL persistence for users, applications and per-user library state.
- Favorites, pinned state, categories and ordering through the API.
- PWA manifest/service-worker support for the launcher itself.
- Mobile navigation, keyboard shortcut (Ctrl/Cmd+K), install prompt and account controls.

## Repository layout

```text
frontend/   Vite + React launcher UI
backend/    Express API, SSO callback and metadata service
database/   TiDB MySQL schema and migrations
docs/       Architecture and integration documentation
```

## Database — TiDB Cloud MySQL

This repository uses **TiDB Cloud's MySQL-compatible database** as its persistent database. It does not use PostgreSQL.

1. Create a TiDB Cloud SQL database.
2. Copy the TiDB connection URL into `DATABASE_URL`.
3. Use the schema in `database/schema/002_tidb_mysql.sql`.
4. Keep `TIDB_SSL=true` for TiDB Cloud connections.

Example connection format:

```text
mysql://USERNAME:PASSWORD@HOST:4000/DATABASE
```

The backend uses `mysql2/promise` and supports the TiDB Cloud TLS connection on port 4000.

## Local development

1. Copy `.env.example` to `.env` and configure VexaAccount plus TiDB Cloud.
2. Apply `database/schema/002_tidb_mysql.sql` to TiDB.
3. Install dependencies for the root, backend and frontend packages.
4. Run the API with `npm start` from `backend` (or the root workspace command).
5. Run the launcher with `npm run frontend:dev`.
6. Build the frontend with `npm run frontend:build`.

## Render deployment

### Frontend Static Site

- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Environment: `VITE_API_BASE_URL`, `VITE_VEXA_ACCOUNT_ISSUER_URL`, `VITE_VEXA_ACCOUNT_CLIENT_ID`, `VITE_VEXA_ACCOUNT_REDIRECT_URI`

### Backend Web Service

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: `DATABASE_URL`, `TIDB_SSL=true`, `TIDB_SSL_REJECT_UNAUTHORIZED=false`, `VEXA_ACCOUNT_ISSUER_URL`, `VEXA_ACCOUNT_CLIENT_ID`, `VEXA_ACCOUNT_CLIENT_SECRET`, `FRONTEND_ORIGIN`

Apply `database/schema/002_tidb_mysql.sql` to the TiDB database before using the persistent library.

## Security

Only HTTPS application URLs are accepted. Metadata fetching resolves DNS and blocks localhost/private/link-local/reserved network addresses to reduce SSRF risk. Redirects are not followed during metadata inspection. Application URLs are opened in a separate browser tab with `noopener,noreferrer`.
