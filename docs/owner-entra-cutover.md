# Owner Entra authentication — code and cutover contract

This implementation is code-only. Merging does not deploy: deployment workflows require workflow_dispatch; image publishing requires release tags. Do not deploy this change with existing passcode-only configuration. The default mode is Entra and missing configuration returns unavailable (503), rather than granting access. No registration, grant, secret or live setting has been created by this work.

## Configuration requiring owner approval

The owner must confirm the exact immutable directory tenant ID, application/client ID and owner object ID in that tenant. Email, UPN, display names, groups and inferred identity are never substitutes. Values must be lowercase GUIDs. Approve the production HTTPS origin and exact Web redirect URI `<origin>/api/owner-auth/callback` for a single-tenant confidential Web application. The code requests only `openid profile`; it requests no Graph permissions or offline_access. A separately approved credential provisioning process must supply a client secret; do not put its value in an issue, source or browser bundle.

Functions settings:

- `BLUE_SWALLOW_AUTH_MODE=entra` (also the default).
- `BLUE_SWALLOW_ENTRA_TENANT_ID`: approved directory GUID.
- `BLUE_SWALLOW_ENTRA_CLIENT_ID`: approved application GUID and exact ID-token audience.
- `BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID`: approved owner's immutable object GUID in this tenant.
- `BLUE_SWALLOW_ENTRA_CLIENT_SECRET`: confidential application credential, held only server-side.
- `BLUE_SWALLOW_PUBLIC_ORIGIN`: exact HTTPS origin, no path or trailing slash.
- `BLUE_SWALLOW_OWNER_SESSION_KEY`: independently generated secret of at least 32 bytes; use high-entropy random material.
- `BLUE_SWALLOW_OWNER_PROXY_PRIVATE_KEY`: Ed25519 PKCS8 PEM private key, Functions only.

VM settings: `BLUE_SWALLOW_AUTH_MODE=entra`, the same tenant and owner IDs, and `BLUE_SWALLOW_OWNER_PROXY_PUBLIC_KEY` (matching Ed25519 SPKI PEM public key). Retain the existing backend read credential and all device upload credentials. The VM does not receive the session key, client secret or proxy private key.

## Verification and lifetime

MSAL Node runs authorization-code + S256 PKCE with a five-minute encrypted transaction cookie, random state and nonce. JOSE independently verifies the ID token using the tenant's fixed Microsoft JWKS endpoint, RS256 signature, exact issuer `https://login.microsoftonline.com/<tenant>/v2.0`, client audience, tenant, owner object, nonce and expiry. Wrong owner is denied; missing configuration or provider availability failures are unavailable.

The application session lasts at most five minutes (and no longer than the ID token). It is held in a Secure HttpOnly SameSite=Strict __Host cookie and in browser memory for existing operator requests. It is never persisted to localStorage/sessionStorage. Cookie-authenticated writes require the exact origin. There is no refresh-token persistence. Lock clears the cookie and browser session; a copied bearer remains usable until expiry, and upstream account disablement is not rechecked within that five-minute lifetime. Rotating the session key invalidates all application sessions. This is an explicit residual lifetime, not immediate centralized revocation. Existing read-only HTTPS APK SAS links retain a five-minute expiry independent of logout; already downloaded files cannot be revoked.

Functions pass a signed owner proof to VM read routes alongside the existing service credential. Its maximum lifetime is 30 seconds. A service credential, mTLS device alone, or forged platform principal cannot read owner data in Entra mode. Compromise of the Functions signing authority is outside this boundary; keep its private key server-side.

## Reusable API contracts and coordination

New Functions handlers call `requireOperatorToken(context, req)` from `api/_lib/operator-auth.js` before reading data. Stop when `auth.ok` is false; it has already set a no-store denial response. Successful Entra results contain `auth.token.tid`, `.oid`, `.iss`, `.aud`, `.exp`, and `.operatorId = tid + ':' + oid`. Never accept an owner ID from a query, payload or x-ms-client-principal. Reuse `ownerBackendHeaders(auth)` when proxying owner reads. Do not log rawToken or headers.

New VM owner-read routes must use existing backend service validation plus `requireOwnerReadProof(req)` from `src/owner-read-auth.mjs` before store access. This checks the fixed owner tuple and short-lived server delegation and returns immutable `{ tenantId, objectId, operatorId }` context (legacy mode returns undefined). New entity writes must reject missing owner context; do not infer an actor in legacy mode. Domain ownership can use the configured/verified tuple; no entity schema or namespace migration is implied by this PR.

Android upload remains on the existing device-authenticated observation batch contract. **No Entra upload bearer audience, delegated scope or registration is defined here.** Do not send this Web application's ID token, application session or server proof from Android. Coordinate a separate resource audience and delegated access-token scope, exact immutable owner validation and migration with the Android/API owners before replacing device credentials. Existing direct Android map reads will be denied in Entra mode; that cutover dependency must be resolved first. Current-release metadata also becomes owner gated; release probe retains its independent operational credential.

## Deployment hold and rollback

Before any deployment: approve identities/origin/credential provisioning, validate a real owner login and wrong-owner denial in an isolated environment, validate deep-link reload/expiry/lock, direct Functions and VM denial, private metadata/APK gates, and coordinate Android direct reads/update metadata and upload onboarding. This work's tests use local signed identities and mocked identity-provider transport; they are not evidence of live Microsoft login or configured consent.

The explicit `BLUE_SWALLOW_AUTH_MODE=legacy` retains server compatibility tests but is not a complete UI rollback: the new root page has no passcode form. A full rollback requires the prior app/API revision and matching configuration. Do not remove old mandatory deployment tokens, paper APIs/jobs/stores, applied migrations, or old secrets until approved cutover and rollback validation. No deploy workflow or live auth settings are changed by this PR.

Microsoft references: [MSAL Node authorization code flow](https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests), [claims validation](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation).
