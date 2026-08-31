# MTP2026 App Launcher

Premium MYTELEPROJECT2026 web/PWA application launcher connected to VexaAccount SSO.

## What is implemented

- VexaAccount OAuth/OIDC authorization-code + PKCE integration points.
- Responsive launcher UI using the supplied premium dark MTP2026 theme.
- Search, Favorites, Recent, PWA Ready and Web App views/filters.
- Add Application modal with HTTPS validation and live URL preview.
- Server-side title, favicon, manifest and theme-color discovery.
- Safe server-side metadata fetching with private-network/localhost blocking.
- PostgreSQL persistence for users, applications and per-user library state.
- Favorites, pinned state, categories and ordering through the API.
- PWA manifest/service-worker support for the launcher itself.
- Mobile navigation, keyboard shortcut (Ctrl/Cmd+K), install prompt and account controls.

## Repository layout

```text
frontend/   Vite + React launcher UI
backend/    Express API, SSO callback and metadata service
database/   PostgreSQL schema and migrations
docs/       Architecture and integration documentation
```

## Local development

1. Copy `.env.example` to `.env` and configure VexaAccount plus PostgreSQL.
2. Install dependencies for the root and frontend packages.
3. Run the API with `npm start`.
4. Run the launcher with `npm run frontend:dev`.
5. For production, build the frontend with `npm run frontend:build` and deploy `frontend/dist` as the static site.

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
- Environment: `DATABASE_URL`, `VEXA_ACCOUNT_ISSUER_URL`, `VEXA_ACCOUNT_CLIENT_ID`, `VEXA_ACCOUNT_CLIENT_SECRET`, `FRONTEND_ORIGIN`

Apply `database/schema/001_initial.sql` to the PostgreSQL database before using the persistent library.

## Security

Only HTTPS application URLs are accepted. Metadata fetching resolves DNS and blocks localhost/private/link-local/reserved network addresses to reduce SSRF risk. Redirects are not followed during metadata inspection. Application URLs are opened in a separate browser tab with `noopener,noreferrer`.
