# Current Static Web App functionality

This document describes the current source contract. It is not live deployment
evidence. See [`current-source-map.md`](current-source-map.md) for the broader
system map and the evidence boundary.

## Public entrypoint and owner session

`app/index.html` contains only the Blue Swallow sign-in face. `app/main.js`
restores `/api/owner-auth/session` and redirects approved users to one of the
four same-origin companion routes:

- `/operator/travels`
- `/operator/entities`
- `/operator/world`
- `/operator/devices`

The active source mode is Microsoft Entra (`api/shared/owner-session.cjs`):
authorization-code + S256 PKCE, exact tenant/client/owner claims, a five-minute
signed `__Host-bss_owner_session` cookie, and browser memory for the current
operator token. The root has no passcode field. The legacy
`/api/validate-passcode` handler remains for compatibility tests but returns
`410 passcode_retired` unless legacy mode is explicitly selected; legacy mode is
not a complete UI rollback because the current root has no passcode form.

Missing identity configuration fails closed with `503`; wrong owners fail closed
with denial. The repository does not claim that production Entra identities,
consent, redirect URIs, or settings are configured.

## Private companion dashboard

`app/operator/` is a redirecting loader, not the private dashboard. After a
valid owner session:

1. `/api/operator-shell` returns `api/_private/operator/shell.html`.
2. `app/operator/loader.js` fetches a fixed allowlist from
   `/api/operator-assets/{asset}` with the session header.
3. Modules are rewritten to private object URLs; object URLs are revoked on
   page teardown.
4. `api/_private/operator/assets/main.js` mounts the selected controller.

The shell separates these boundaries:

- **Travels / Cybermap:** `travels-view.mjs` queries POST
  `/api/cybermap/history`; the nearby disclosure uses the bounded operator
  signal route and labels capture evidence separately from inferred emitter
  position.
- **Entities:** `entity-client.mjs` and `entity-workbench.mjs` call list/detail/
  preview/mutate through `/api/cybermap/entities/{operation}`. Reads require
  `Owner.Read`; editing is read-only until the explicit owner Entra flow grants
  `Entities.Write`.
- **World:** `world-view.mjs` uses `/api/world-context` for public/aggregate
  reports and renders bounded ground/orbit context. It is not personal history,
  verified identity, or live tracking.
- **Devices / Utilities:** the release card reads operator-only release
  metadata and obtains a bounded Blob download URL only after validation.

## Functions and backend routes

All routes are anonymously reachable at the SWA routing layer so the application
can perform its own session handshake; private handlers fail closed inside
Functions. The browser does not call the VM or Postgres.

| Source route | Boundary | Backend/data contract |
|---|---|---|
| `api/cybermap-history/` | owner read; POST only; no query string | VM `/api/v1/cybermap/history` |
| `api/operator-signals/` | owner read; body-bounded current viewport | VM `/api/v1/cybermap/operator-signals` |
| `api/cybermap-viewport/` | owner read; coordinates only in POST body | VM `/api/v1/cybermap/viewport` |
| `api/cybermap-global-viewport/` and `api/cybermap-tiles/` | owner/read token plus layer policy | aggregate PostGIS cells/tiles |
| `api/cybermap-entities/` | `Owner.Read` for list/detail, `Entities.Write` for preview/mutate | VM entity service/store |
| `api/cybermap-observations-batch/` | POST, device ID, ingest token, idempotency key, HTTPS backend | VM `/api/v1/observations/batch` |
| `api/operator-downloads/` | operator token; validated private manifest | metadata or five-minute HTTPS read-only Blob SAS |
| `api/tzeentch/`, `api/paper-state/` | protected read/paper state | paper-only dashboard and ledger |

The entity path never takes an actor from a request body or platform principal.
The ingest path preserves the exact request body and required device/idempotency
headers. The release path never reads a checked-in APK fallback.

## Wardriver and AR boundary

The Society browser does not scan Wi-Fi, read Android app-private SQLite, or
prove camera behavior. Wardriver owns:

- local Wi-Fi/BLE/cellular/GNSS collection and the durable local observation DB;
- explicit authenticated BSS upload and its encrypted outbox/receipt lifecycle;
- the actual ARCore/LiteRT RaID camera path.

Society’s `vision*.mjs` modules are parser/controller/rendering helpers only, and
the current private shell does not expose a browser AR tab. A source helper,
fixture, or local bridge must not be described as physical-device behavior.

## Release delivery

`api/_lib/wardriver-release-store.js` accepts only a schema-1 release manifest
with package `co.blueswallow.wardriver`, `buildType: release`, a matching
`wardriver-v<versionName>` tag, an immutable source-commit/blob path, artifact
and signer SHA-256 values, and a bounded publication/build record.

`operator-downloads/{metadata|apk}` requires the operator boundary. Metadata is
private/no-store; APK delivery is either a validated HTTPS read-only Blob SAS
representation or a redirect. `wardriver-release-current` exposes only
device-safe version metadata to its configured owner route. The source contains
no current release bytes. Manifest existence, artifact provenance, live CORS,
and an installed-device update need separate evidence.

## Paper-only boundary

`api/tzeentch`, `config/mosaic-murmurs-paper-ledger.json`, and the Mosaic/Murmurs
scripts describe public-source reads and paper state. They do not authorize live
exchange, broker, wallet, or prediction-market orders. Preserve the paper-trading
extraction and its historical/scientific records when documenting other system
surfaces.

## Focused validation

```bash
node --test tests/owner-auth.test.mjs tests/owner-login.browser.mjs tests/root-login-handoff-browser.test.mjs
node --test tests/companion-navigation.test.mjs tests/companion.browser.mjs tests/travels.browser.mjs tests/ui-shell.test.mjs
node --test tests/entity-proxy.test.mjs tests/entity-edit-auth.test.mjs tests/entity-workbench.browser.mjs tests/entity-integration.browser.mjs
node --test tests/cybermap-ingest-api.test.mjs tests/cybermap-viewport-api.test.mjs tests/operator-downloads-api.test.mjs
git diff --check
```

Browser commands require the `api/` dependencies and Playwright setup used by
the public CI workflow. These tests are source/contract evidence only. For the
complete applicable gate, use the commands in [`public-ci-handoff.md`](public-ci-handoff.md)
and the private Wardriver exact-SHA promotion checks.
