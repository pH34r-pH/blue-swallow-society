# Society Functions map

Functions are the authenticated same-origin boundary. Route families are:

- `companion-auth/`, `_lib/viewer-session*`, and `_lib/companion-auth.js` add
  explicit password-mode viewer sessions with scrypt, durable revocation and
  conditional renewal. Only the asynchronous companion guard accepts viewers;
  do not widen the synchronous owner/operator guard. `viewer-session-cleanup/`
  performs bounded expiry cleanup. These routes do not yet change the public UI.
- `companion-downloads/` authorizes browser viewers/owners before reusing the
  separate development receipt validator for exact immutable APK/FAP grants.
  It never makes browser cookies valid on `wardriver-development/`. Configuration
  and rollout constraints are in `docs/society-vnext-foundation.md`.
- `owner-auth/`, `_lib/owner-*`, `_lib/api-access-token.js`, and
  `_lib/operator-auth.js` establish the owner/operator session and scoped API
  principal. Reject before reading private data.
- `operator-shell/` and `operator-assets/` return the private companion shell
  and fixed asset allowlist. `_private/operator/` is not a public static tree.
- `cybermap-history/`, `operator-signals/`, `cybermap-viewport/`,
  `cybermap-global-viewport/`, `cybermap-tiles/`, `cybermap-entities/`, and
  `world-context/` validate the owner boundary before proxying bounded requests
  to `BACKEND_CYBERMAP_BASE_URL`.
- `cybermap-observations-batch/` is the device ingest proxy. It is not an
  operator-session route: it requires POST plus device, ingest-token, and
  idempotency headers, preserves the JSON body, and requires an HTTPS backend.
- `operator-downloads/` reads a validated private release manifest and returns
  metadata or a short-lived HTTPS read-only Blob SAS; it never reads a tracked APK.
- `wardriver-development/` serves the separate private vNext update index,
  a current JSON receipt, immutable receipts, and APK/FAP grants. It validates a dedicated read-only
  bearer against configured hashes before storage access, pins the APK signer,
  and never accepts an owner session as a development reader credential. An optional,
  separately enabled device update grant is signed after active membership and
  allowlist checks, scoped to the update feed and storage, and expires in five minutes. See
  `specs/028-vnext-private-update-feed/` for the publication/configuration contract.
- `wardriver-sync/` and `_lib/wardriver-sync-*` are the separate device-key
  invitation and Blob capability boundary. Pinned owner configuration seeds one
  private group; RS256 challenges/proofs, conditional membership state, and signed
  rosters authorize five-minute dataset read / own create / exact head grants.
  Never accept scan bodies or substitute owner sessions/update-reader tokens.
  See `specs/029-wardriver-device-sync-access/` and
  `docs/wardriver-device-sync-access.md` for configuration and wire contracts.
- `tzeentch/`, `paper-state/`, and `morning-brief/` stay behind their explicit
  contracts. Paper state is paper-only.

Preserve no-store/private responses, bounded bodies/timeouts, POST bodies for
sensitive coordinates, and redacted logs. Do not accept platform principal
headers or request actors as authorization. New routes must add a focused test
and a Function binding only when the source contract requires it.

Focused checks:

```bash
node --test tests/viewer-session.test.mjs tests/companion-auth.test.mjs tests/companion-downloads.test.mjs tests/passcode-rate-limit.test.mjs
node --test tests/common-api-auth.test.mjs tests/owner-auth.test.mjs tests/operator-shell-api.test.mjs tests/operator-downloads-api.test.mjs
node --test tests/wardriver-development-api.test.mjs tests/wardriver-development-store.test.mjs
node --test tests/wardriver-sync-auth.test.mjs tests/wardriver-sync-api.test.mjs
node --test tests/cybermap-ingest-api.test.mjs tests/cybermap-viewport-api.test.mjs tests/entity-proxy.test.mjs
npm test --prefix vm/cybermap-api
git diff --check
```
