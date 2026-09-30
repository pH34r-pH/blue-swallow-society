# Explicit Web entity editing authorization

Source-only follow-up to PR97. No registration, grants, consent configuration or live settings
are changed. Existing BLUE_SWALLOW_ENTRA_API_CLIENT_ID selects the Society API; absent/invalid
configuration keeps editing unavailable. The approved scope name is Entities.Write.

Ordinary login requests openid/profile and api://<API_CLIENT_ID>/Owner.Read. The Entities tab
starts read-only, with disabled correction inputs and an Enable editing button. Its GET
/api/owner-auth/edit returns only configured/editing booleans for a verified owner cookie.
Choosing Enable editing sends POST to that existing owner-auth action. The action requires a
valid signed owner cookie, exact configured Origin and an active server MSAL session. It downgrades
any existing edit intent first, then requests Owner.Read plus the incremental Entities.Write
scope on the same API, alongside openid/profile. No Observations.Upload or arbitrary scope input
is accepted. State, nonce, PKCE and the original owner session are sealed into the existing
five-minute HttpOnly transaction cookie. The browser receives only an authorization URL.

The existing callback checks transaction state/lifetime, owner session/cache liveness, ID token
signature/nonce/owner and the canonical API validator for Owner.Read and Entities.Write. Success
creates a new bounded owner session and records the explicitly requested scopes in the existing
memory cache. The old cache entry is forgotten. Every entity operation revalidates the delegated
API token; Web writes additionally require cached explicit edit intent. A broader token returned
by MSAL during ordinary read login cannot authorize a correction.

Cancellation, denied grants, wrong owner/nonce and provider errors return a still-valid original
session to /operator/entities in read-only mode. Expiry, logout or invalid/tampered state cannot
exchange codes or restore editing and require sign-in again. Session/cache loss fails closed.
Correction scope denial/expiry disables controls and invalidates pending confirmation. The
browser never stores API or refresh tokens. No read-proof grants writes.

The app session remains at most five minutes. Entra access tokens retain their standard provider
lifetime (often 60–90 minutes); logout forgets local cache/session state but cannot revoke a copied
API access token before its expiry. Provider grant/consent behavior must be tested during the
separately approved live cutover, including logout residual behavior.

Synthetic validation: four focused authorization tests with local RSA-signed ID/API tokens,
254 root contracts and Chromium cancel/success/read-only controls in the real private shell.
Real isolated PostGIS browser corrections remain covered. No Microsoft consent or live RF data
was used. #44 remains open for live acceptance and its broader model requirements.
