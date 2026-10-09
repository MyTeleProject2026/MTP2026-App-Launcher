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

## Host and independent OS frontends

The Render Blueprint now defines a separate static host frontend at `frontend-MTP2026-AppLauncher/` in addition to the four independent OS static sites:

- App Launcher host: `frontend-MTP2026-AppLauncher/`
- Desktop OS: `frontend-MTP2026-2Desktop/`
- Android OS: `frontend-MTP2026-Android/`
- Gaming OS: `Frontend-MTP202026-ROG_gamingOS/`
- Device OS: `frontend-MTP2026OS/`

The host dashboard checks the shared backend and guest manifest and links to each independent frontend. Configure its `VITE_API_BASE_URL` to the deployed shared backend. Configure backend `FRONTEND_ORIGINS` as a comma-separated list of the exact HTTPS origins actually assigned to all five deployed static sites; the backend validates SSO return origins against this allowlist. Do not enter arbitrary return URLs.

## Remote QEMU runtime service

The Blueprint now defines an isolated Docker service under `runtime/`. It downloads the selected MTP2026-owned ARM64 guest bundle from the physical-test GitHub Release, verifies the bundle SHA-256 against the release manifest, extracts the firmware/kernel/initramfs/boot disk, starts `qemu-system-aarch64`, preserves a per-user QCOW2 data disk, and exposes display/input through a token-scoped noVNC WebSocket bridge. The shared backend proxies start/status/stop only after VexaAccount-backed MTP session authentication; the runtime API key is server-side only.

Required Render configuration after syncing the Blueprint:

- On `mtp2026-qemu-runtime`, set `MTP2026_RUNTIME_API_KEY` to a long random secret and `MTP2026_RUNTIME_PUBLIC_URL` to that service's exact HTTPS origin.
- On `mtp2026-app-launcher-api`, set `MTP2026_RUNTIME_API_KEY` to the same secret and `MTP2026_RUNTIME_URL` to the runtime service's exact HTTPS origin.
- On all four OS static sites, set `VITE_API_BASE_URL` to the deployed shared backend URL. Configure `FRONTEND_ORIGINS` to the exact HTTPS origins for all five frontend sites.
- Keep the persistent runtime disk attached. QEMU AArch64 software emulation is CPU- and memory-intensive; choose a Render instance with enough RAM/CPU for the guest memory configured in `runtime/server.js`. A Blueprint sync alone does not set those dashboard secrets or prove the live service has booted.

The UI requests a guest only from an explicit Start action. The runtime does not report `running` until its serial log confirms both the guest system and GUI compositor boot markers. Missing release assets, checksum mismatch, runtime secrets, boot confirmation, or display configuration produce an error rather than a simulated boot.

## Full-system emulator readiness boundary

The frontend runtime adapters can use `window.MTP2026NativeGuestRuntime` or `window.MTP2026QemuWasmRuntime`, but those are provider contracts, not emulator binaries. The current static-site build does not bundle a complete `qemu-system-aarch64` WebAssembly engine, and a manifest/image URL alone does not boot a guest. The native QEMU runner script under `os/mtp2026-guest-profiles/run-qemu.sh` is a local/native execution path, not a browser-accessible remote VM service.

A real web-hosted full-system guest still requires all of the following before the UI can report a VM as running:

1. A built and licensed QEMU AArch64 system-emulator binary (WebAssembly or a remote runtime service).
2. A compatible, verified guest boot bundle and persistent guest disk for each profile.
3. A display/input bridge (for example, a QEMU display device exposed through a secure WebSocket viewer) and guest networking.
4. Authenticated per-user start/stop/status APIs, resource limits, and lifecycle cleanup.
5. Runtime integration tests proving that the guest kernel actually reaches a confirmed boot state.

Until those components are deployed and tested, the browser OS shell is a frontend experience, not proof that a full ARM64 guest OS is executing. Do not label a browser-shell fallback as a real VM boot.

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
