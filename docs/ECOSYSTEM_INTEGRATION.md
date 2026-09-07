# VexaAccount Ecosystem Integration

MTP2026 is the consumer-side launcher and integration host. VexaAccount remains the identity authority and owner control plane.

## Consumer contract

```text
Owner registers an application in VexaAccount
  -> exact HTTPS redirect URI + minimum scopes
  -> MTP backend stores the client secret
  -> MTP creates state + S256 PKCE
  -> VexaAccount User SSO authorization UI
  -> authorization code
  -> MTP server-side token exchange
  -> VexaAccount userinfo
  -> MTP user mapping + encrypted session
  -> MTP application APIs
```

## MTP-owned state

MTP stores launcher-specific applications, recent activity, preferences, notifications and its own session. It does not duplicate VexaAccount passwords, registration, verification, 2FA or owner authorization.

## Generated integrations

The repository's integration generator creates consumer-side artifacts without embedding a client secret. Generated applications must still register their own VexaAccount client and exact callback URI.

## Verification

Run `npm run integration:verify -- --dir <generated-dir>` for generated artifacts. Then separately verify the real deployed consumer with a real VexaAccount account.

## Security

Never put a Vexa client secret or refresh token in browser code, Vite variables, generated public files or Git history. Use Authorization Code + S256 PKCE and a server-side consumer session.
