# MTP2026 Architecture

## Identity boundary

VexaAccount is the identity provider. MTP2026 accepts the verified VexaAccount subject/profile through its own server-side SSO session and never asks the browser to supply the authenticated user ID.

```text
VexaAccount SSO
   -> MTP state + PKCE
   -> code exchange
   -> userinfo.sub
   -> mtp_users
   -> encrypted mtp_sso_sessions
   -> HttpOnly mtp_session
```

## Application library

Application definitions are global records; user memberships contain favorite/pin/category/order/recent state. The library is server-side and cross-device.

## Launcher state

MTP also persists:

- `mtp_user_preferences`: theme, default view, open behavior and compact mode.
- `mtp_notifications`: launcher/system notifications and read state.

These are authenticated by the same MTP session and owned by the mapped MTP user.

## Add application

```text
HTTPS URL
 -> normalize and reject non-HTTPS URLs
 -> resolve DNS and reject private/link-local addresses
 -> fetch metadata without following redirects
 -> detect title/icon/manifest/theme
 -> upsert application definition
 -> create user membership
 -> render launcher card
```

## Cross-device behavior

1. Authenticate through VexaAccount.
2. Resolve the stable provider subject to `mtp_users`.
3. Load applications, preferences and notifications from TiDB/MySQL.
4. Apply preferences to the launcher.
5. Mutations persist through authenticated API routes.

## Session lifecycle

Login transactions are server-side and single-use. Vexa access/refresh tokens are encrypted at rest. Access tokens are refreshed server-side near expiry. Logout removes the local session and attempts upstream refresh-token revocation.

## Account switching

A new VexaAccount login creates a new MTP session and loads only that subject's records. Browser storage is not used as an identity authority.
