# VexaAccount ecosystem integration

MTP2026 App Launcher now contains the consumer-side integration toolkit. VexaAccount remains the identity authority and Owner Control Center; MTP2026 does not duplicate Owner authorization or Client Secret storage.

## Contract

```text
Owner registers application in VexaAccount
  → exact HTTPS redirect URI
  → supported scopes
  → one-time Client Secret display
  → external backend stores VEXA_ACCOUNT_CLIENT_SECRET
  → generated integration uses Authorization Code + S256 PKCE
  → VexaAccount authorize
  → callback
  → token exchange
  → /api/sso/userinfo
  → external application's own session
```

The current VexaAccount Owner Control Center documentation explicitly requires exact production callbacks, S256 PKCE, server-side state validation, stable `userinfo.sub`, and server-side Client Secret handling. See `README_OWNER_CONTROL_CENTER.md` in VexaAccount.

## Generator

```bash
npm run integration:generate -- --app vexamail --framework all \
  --client-id YOUR_REGISTERED_CLIENT_ID \
  --redirect-uri https://vexamail.example.com/auth/callback
```

Supported framework templates:

- Vanilla browser JavaScript
- React
- Next.js
- Express/Node
- Android configuration shell

The generator also creates `.env.example`, deployment configuration, integration documentation and a Node test suite. It never writes a Client Secret into generated source.

## Automatic patching

For a local target project:

```bash
node tools/patch-generated-integration.mjs \
  --target /path/to/project \
  --generated generated/vexamail
```

Existing files are skipped by default. `--force` is required to replace an existing generated file. The patcher is deliberately filesystem-local; it does not execute arbitrary code or modify a remote repository implicitly.

## Verification

```bash
npm run integration:verify -- --dir generated/vexamail
```

Verification checks required artifact files, HTTPS provider/redirect URLs, required `openid` scope, absence of a Client Secret in generated configuration, and executes the generated tests.

## Ecosystem templates

`ecosystem/templates.json` defines the initial integration targets:
VexaMail, VexaWallet, VexaCloud, Vexa Password Manager, VexaAuthenticator and VexaWholes Professional.

Each ecosystem application must still be registered in VexaAccount with its own client ID and exact redirect URI. A template is not a credential and does not bypass VexaAccount authorization.
