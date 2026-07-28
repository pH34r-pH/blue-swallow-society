# Architecture decisions

**Source baseline:** `6124e64f8cc4970657a6c060713f97c4f1eb4abd`, reviewed 2026-07-28. This note describes code and IaC in this repository. It does not attest that any Azure resource, VM service, database migration, custom domain, or Wardriver artifact is live.

## Boundary model

Blue Swallow Society has four runtime boundaries. Each boundary has a distinct trust decision; none substitutes for another.

```text
public cover                         authenticated operator
app/index.html                       /operator loader -> private shell
  -> passcode API                       -> operator token on API calls
       -> short-lived in-memory signed token

field device                          backend data plane
observation batch -> Function        Function -> HTTPS Caddy gateway
  -> device credential                     -> loopback Cybermap API
  -> idempotency key                       -> private PostgreSQL/PostGIS
```

| Boundary | Owner | Contract | Trust rule |
|---|---|---|---|
| Public cover | `app/` | root page and event branch | No operator routes or artifact links in the root bundle. |
| Operator session | `api/validate-passcode`, `api/_lib/operator-auth.js`, `app/operator/operator-session.mjs` | five-minute signed token held only in an ES-module closure; global token-version revocation | Every operator data route re-verifies the token. Reload requires a fresh passcode flow. |
| Edge proxy | `api/` | same-origin Functions routes | HTTPS upstream only; each proxy applies route-specific validation. |
| Backend | `vm/cybermap-api/` | device ingest, read tokens, strict payloads | VM re-authenticates before store access; PostgreSQL is not browser-reachable. |

## Current source topology

```text
browser
  -> Azure Static Web App
     -> public root: app/index.html + app/main.js
     -> /operator: loader only
     -> /api/operator-shell: token-gated HTML
     -> app/operator/: client modules after shell authorization
     -> /api/*: Azure Functions (Node 22)
        -> BACKEND_CYBERMAP_BASE_URL (HTTPS)
           -> Caddy :443
              -> bss-cybermap-api on 127.0.0.1:8080 (Node 24)
                 -> PostgreSQL Flexible Server through private DNS
```

`infra/main.bicep` composes the Static Web App, shared VM/PostgreSQL network, PostgreSQL Flexible Server, VM gateway, Wardriver release storage, and optional Azure OpenAI resource. `infra/scripts/install-cybermap-api.sh` installs Node 24, copies `vm/cybermap-api` to `/opt/bss/cybermap-api`, applies migrations `0001` through `0003`, writes a root-only environment file, starts `bss-cybermap-api`, configures Caddy, and disables the legacy `echo-server.service`.

The source still retains `/api/echo` and `GET /echo` for compatibility. They are legacy connectivity paths, not the Cybermap data contract.

## Module ownership

| Area | Responsibility | Allowed dependencies |
|---|---|---|
| `app/` | Cover UI and public event behavior | Same-origin public APIs only. |
| `app/operator/` | Session-aware operator UI, Godeye, Tzeentch, AR presentation | Same-origin token-gated APIs; self-hosted vendor assets. |
| `api/_lib/` | Shared operator authentication and release-store policy | Node built-ins and explicitly declared Functions dependencies. |
| `api/<route>/` | Thin Azure Functions validation/proxy/response boundary | `_lib`, configuration, HTTPS backends. |
| `vm/cybermap-api/src/` | HTTP routing, contracts, authentication, memory/PostgreSQL stores | Node 24, `pg`, `h3-js`; no browser concerns. |
| `vm/cybermap-api/db/` | Ordered PostgreSQL/PostGIS schema | Migration-only SQL. |
| `infra/` | Deployable resource topology and service bootstrap | Bicep modules and installer only. |
| `scripts/` | Local collectors and deterministic paper engine/sync | Explicit API contract; no browser runtime dependency. |
| `specs/` | Behavior authority and verification traceability | No runtime ownership. |

Dependency direction is intentionally one way:

```text
app/operator -> api routes -> VM HTTP contract -> store -> migrations
scripts       -> VM paper-state HTTP contract -> store
infra         -> service artifact + runtime configuration
specs/docs    -> describe and verify the above; they do not execute it
```

## Implemented data paths

### Operator data

1. The passcode Function validates a configured digest and returns a five-minute signed session. The browser keeps it only in an ES-module closure; no cookie transport is assumed.
2. The root document uses the in-memory session to fetch `/api/operator-shell`; direct `/operator` navigation returns to `/`.
3. Operator client modules call token-gated routes for legacy WiGLE compatibility, OSINT, Tzeentch, downloads, VM operator signals, and tiles.
4. Godeye uses a fixed layer registry. MVT tiles are green-source summaries; signal requests are POSTed body-only through the Function and VM, then returned as a redacted `bss.operator_signal_snapshot.v1` projection.

### Cybermap writes and reads

```text
field device
  -> POST /api/cybermap/observations/batch
  -> VM POST /api/v1/observations/batch
  -> strict contract + device credential + idempotency
  -> PostgresObservationStore

operator Godeye
  -> POST /api/operator-signals or GET /api/cybermap/tiles/{z}/{x}/{y}
  -> Function operator-token gate + HTTPS backend read token
  -> VM read-token gate
  -> PostgreSQL/PostGIS viewport or green-only MVT query
```

### Paper state

The local Python paper engine produces the canonical 3×8 ledger. `api/paper-state` and the VM `/api/v1/paper/state` require a dedicated paper-state token. `api/tzeentch` accepts only a valid canonical snapshot; it displays an unavailable/empty state rather than demo books when the backend is absent, stale, malformed, or non-HTTPS.

## Constraints and non-goals

- No direct browser connection to PostgreSQL.
- No raw-observation MVT tiles, arbitrary map endpoint input, or browser map persistence.
- No demo/fallback data in Tzeentch or Godeye production paths.
- No real-money execution path; paper state must remain `paper_only`.
- No claim that source-only features are deployed without runtime receipts.

## Material gaps from source review

1. **Operator client modules are still publicly fetchable static assets.** Authorization protects shell/data routes, not route-name concealment. Do not call the operator surface materially hidden.
2. **Operator access material is memory-only.** `app/operator/operator-session.mjs` keeps the five-minute signed token outside Web Storage. Increment `BLUE_SWALLOW_OPERATOR_TOKEN_VERSION` in SWA app settings to revoke all issued tokens; do not reset that setting in deployment automation.
3. **Passcode throttling uses a dedicated Azure Table counter.** Caller identities are normalized then SHA-256 hashed; independent Function instances share bounded expiry windows. A missing or failed counter returns `503` for the passcode route without affecting the public cover.
4. **Viewport privacy is body-only across the internal hop.** The Function and VM accept authenticated JSON POSTs and reject coordinate query parameters; the direct VM GET/query route is retired.
5. **The VM installer accepts only a pinned commit archive and expected SHA-256.** It verifies before extraction/migration and writes `/etc/bss/cybermap-api-release.json` with public revision/digest provenance.
6. **Legacy WiGLE parsing is runtime-neutral.** `shared/legacy-wigle-parser.mjs` is a compatibility adapter; `api/wigle` no longer imports browser code. The primary Godeye data path is the Wardriver/VM contract projection, verified against a Wardriver golden batch fixture.
7. **Initial seams are extracted.** `operator-session.mjs`, `operator-signal-client.mjs`, `api/_lib/cybermap-backend.js`, `api/_lib/passcode-rate-limit.js`, and `vm/cybermap-api/src/viewport.mjs` own the new policy boundaries. Further decomposition remains incremental.

## Documentation authority

- `README.md` is the entry-point and runtime map.
- This file owns module boundaries and data topology.
- `docs/vm-api.md` owns the implemented VM HTTP/API contract.
- `docs/cybermap-geospatial-backend.md` owns Godeye/ingest data policy and the browser-versus-upstream location boundary.
- `docs/vm-echo-wiring.md` owns the legacy echo compatibility path.
- `vm/cybermap-api/README.md` owns service-local setup and request semantics.
- `docs/blue-swallow-system-implementation-delta.md` owns the source-versus-runtime evidence boundary.
- `docs/adversarial-review-repair-guidance.md` owns repair sequencing, decision boundaries, and proof conditions.
- Feature `spec.md` files own observable behavior; their plan/tests/tasks are downstream implementation records.
