# Society Functions map

Functions are the authenticated same-origin boundary. Route families are:

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
- `tzeentch/`, `paper-state/`, and `morning-brief/` stay behind their explicit
  contracts. Paper state is paper-only.

Preserve no-store/private responses, bounded bodies/timeouts, POST bodies for
sensitive coordinates, and redacted logs. Do not accept platform principal
headers or request actors as authorization. New routes must add a focused test
and a Function binding only when the source contract requires it.

Focused checks:

```bash
node --test tests/common-api-auth.test.mjs tests/owner-auth.test.mjs tests/operator-shell-api.test.mjs tests/operator-downloads-api.test.mjs
node --test tests/cybermap-ingest-api.test.mjs tests/cybermap-viewport-api.test.mjs tests/entity-proxy.test.mjs
npm test --prefix vm/cybermap-api
git diff --check
```
