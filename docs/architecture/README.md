# MTP2026 Architecture

## Identity

VexaAccount is the identity provider. MTP2026 should accept a verified OIDC identity and use a stable VexaAccount subject/profile identifier as the owner of the launcher library.

## Application library

A user's library is server-side and must not depend on localStorage. Store application definitions separately from user-specific launcher settings.

```text
VexaAccount identity
        |
        v
MTP2026 user/profile
        |
        +--> application memberships
                 |
                 +--> application URL
                 +--> title/icon/metadata
                 +--> category/favorite/pin/order
```

## Cross-device behavior

1. User signs in through VexaAccount SSO.
2. MTP2026 resolves the authenticated profile.
3. MTP2026 loads that profile's application memberships from the API/database.
4. The same library is rendered on every authenticated device.
5. Each device independently determines whether a PWA can be installed.

## Add application flow

```text
HTTPS URL
   -> validate URL
   -> fetch metadata with SSRF-safe server controls
   -> parse title/icon/manifest/PWA signals
   -> create application definition
   -> create user membership
   -> return launcher card
```

Metadata fetching must protect against SSRF, private-network access, unsafe redirects, oversized responses and unsupported protocols.

## Account switching

Account switching must replace the active authenticated profile context and reload the corresponding application membership set. Do not mix application libraries between profiles.
