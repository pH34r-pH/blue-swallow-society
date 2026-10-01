# Blue Swallow Society current source map

This is a source map for the current checkout, not a deployment certificate. It
records what the repository implements, which tests exercise it, and what still
requires live or physical evidence. Historical audits and scientific records keep
their original dates and claims; see [the implementation delta](blue-swallow-system-implementation-delta.md)
and [the Wardriver/RaID repair record](wardriver-raid-backend-repair-plan.md) for
provenance rather than current operation.

## Evidence vocabulary

- **Implemented in source** means the named files contain the path and focused
  tests exercise its contract.
- **Locally verified** means the command in this document passed in a checkout;
  it does not prove cloud configuration or an external provider.
- **Deployed** requires an exact-SHA deployment record and live probes. Public CI
  alone is not deployment evidence; see [the public handoff](public-ci-handoff.md).
- **Physical acceptance** requires a target Android device. JVM, browser, and
  synthetic PostGIS tests cannot prove camera, permissions, RF collection, TLS
  identity, or field upload behavior.

## Architecture and data flow

```text
Web browser
  -> app/index.html + app/main.js
  -> /api/owner-auth/login or /api/owner-auth/session
  -> five-minute owner session in a Secure HttpOnly cookie
  -> /operator/{travels|entities|world|devices}
  -> app/operator/loader.js
  -> /api/operator-shell + allowlisted /api/operator-assets/*
  -> private companion shell and modules in api/_private/operator/

Travels / nearby Cybermap
  -> private travels-view.mjs / godeye modules
  -> /api/cybermap/history or /api/operator-signals
  -> owner-read validation + delegated Owner.Read token
  -> VM /api/v1/cybermap/{history|operator-signals}
  -> append-only observations / derived map views in PostGIS

Entities
  -> entity-workbench.mjs + entity-client.mjs
  -> /api/cybermap/entities/{list|detail|preview|mutate}
  -> Owner.Read for reads; explicit Entra Entities.Write for preview/mutate
  -> VM entity adapter/service/store -> migration 0007 tables

Wardriver observation upload
  -> Android BssUploadRunner (in the companion repository)
  -> bss.observation_batch.v2 over direct mTLS or opt-in Entra bearer transport
  -> /api/v1/observations/batch, directly or through the bounded
     Functions batch proxy with device, ingest-token, and idempotency headers
  -> validated durable receipt -> immutable observations and progress

Paper runtime
  -> api/tzeentch + scripts/config under paper-only contracts
  -> public-source reads and paper ledger state only; no live trade/order path
```

The browser never connects directly to the VM or Postgres. Sensitive coordinates
are sent in POST bodies, not URLs. Operator assets and data APIs fail closed in
Functions before private reads. The public root contains only the owner sign-in
surface; it does not reveal the companion shell or Wardriver artifacts.

## Companion dashboard boundaries

`api/_private/operator/shell.html` is the current private companion dashboard:

- **Travels / Cybermap** (`/operator/travels`) shows bounded observation history
  and an optional nearby capture context. It labels capture coordinates as
  evidence of collection, not inferred emitter location or a complete trip.
- **Entities** (`/operator/entities`) is a read-first workbench. `preview` and
  `mutate` require the explicit owner editing flow in
  [`entity-edit-authorization.md`](entity-edit-authorization.md); commands carry
  expected revisions, an idempotency key, a reason, and evidence IDs.
- **World** (`/operator/world`) is separate public/aggregate context. It is not
  personal observation history, verified identity, or live tracking. Selected
  orbital positions are propagated predictions with freshness and epoch bounds.
- **Devices / Utilities** (`/operator/devices`) exposes the current Wardriver
  release card and other device utilities. It does not make the APK public.

`app/operator/loader.js` owns private asset boot and
`api/_private/operator/assets/main.js` owns view teardown;
`companion-tabs.mjs` coordinates route activation and lifecycle transitions, and
`companion-navigation.mjs` is the route vocabulary. Travels and World use
separate controllers with explicit deactivation when their surfaces are left.
The eagerly mounted Entity workbench guards asynchronous responses with
generation tokens and is destroyed on logout/pagehide; switching tabs does not
promise request cancellation for that workbench.

## Retained companion stabilization backlog

Issue #78 is bounded to behavior-preserving reliability and structural cleanup of
the retained companion: navigation, Travels/history and personal map rendering,
Entities, and Devices/Utilities. The current slices extract route lifecycle
coordination, the Godeye live-feed request/response boundary, and focused Godeye
render helpers while preserving the existing browser contract. Follow-up slices
may extract remaining retained render/data helpers with browser evidence. Tzeentch and
Morning-dossier surfaces are retained only as paper-only contracts and are not part
of this backlog; dormant AR correctness, hosting, authentication provisioning, and
new product features remain separate work.

## Implemented code versus unverified operation

| Boundary | Implemented and checked in source | Still unverified here |
|---|---|---|
| Owner access | Entra authorization-code/PKCE flow, exact tenant/audience/owner checks, five-minute signed session, HttpOnly cookie, memory-only browser token | Real Microsoft sign-in, production identities/consent, live wrong-owner denial, and deployment settings |
| Private companion | Loader fetches private shell/assets through operator token and fixed allowlist; browser tests cover route navigation and asset handoff | Live hosted shell/asset behavior on the deployed origin |
| Entity workbench | VM contract, migration 0007, Functions scope checks, optimistic preview/mutate, replay/stale-revision handling, browser/PostGIS tests | Live migration/application and real owner `Entities.Write` consent |
| Observation upload | Functions batch proxy validates method/body/HTTPS backend and forwards device, token, and idempotency headers; Wardriver source owns encrypted V2 staging and receipt handling | A production Wardriver-to-VM upload, deployed PostGIS persistence, and device certificate/token acceptance |
| AR/vision | Society contains parser/geometry/rendering helpers and the hosted dashboard has no browser AR tab; Wardriver owns the actual ARCore/LiteRT camera feature | Physical camera/ARCore behavior, model accuracy, depth availability, and any RF/visual association |
| Release delivery | Private manifest validation, operator-only metadata, five-minute HTTPS read-only Blob SAS, and Android metadata-only update client contracts | Current Blob manifest, live artifact provenance, installed-device update, and real release acceptance |
| Paper trading | Tzeentch routes and paper ledger remain read-only/paper-only; research and ledger records are retained | No live exchange, broker, wallet, or prediction-market execution is implied or authorized |

Do not turn a test fixture, local proof, source route, or historical deployment
observation into a live claim. In particular, `docs/azure-resources.md`,
`docs/cybermap-geospatial-backend.md`, and `docs/owner-entra-cutover.md` contain
design or cutover constraints that must be reconciled with private deployment
evidence before use as operations guidance.

## Change routing and focused validation

| Change area | Start with | Focused validation |
|---|---|---|
| Root/owner sign-in | `app/`, `api/owner-auth/`, `api/shared/owner-session.cjs`, `api/_lib/owner-*` | `node --test tests/owner-auth.test.mjs tests/owner-login.browser.mjs tests/root-login-handoff-browser.test.mjs` |
| Companion route/shell/assets | `app/operator/`, `api/_private/operator/`, `api/operator-shell/`, `api/operator-assets/` | `node --test tests/companion-navigation.test.mjs tests/companion.browser.mjs tests/ui-shell.test.mjs tests/operator-shell-api.test.mjs` |
| Travels/history/nearby map | `api/cybermap-history/`, `api/operator-signals/`, `vm/cybermap-api/src/history-*`, `api/_private/operator/assets/travels-*` | `node --test tests/history-api.test.mjs tests/travels-state.test.mjs tests/travels.browser.mjs vm/cybermap-api/test/history-*.test.mjs` |
| Entities/auth | `api/cybermap-entities/`, `api/_lib/entity-*`, `api/_private/operator/assets/entity-*`, `vm/cybermap-api/src/entity-*` | `node --test tests/entity-proxy.test.mjs tests/entity-edit-auth.test.mjs tests/entity-workbench.browser.mjs tests/entity-integration.browser.mjs vm/cybermap-api/test/entity-workbench*.test.mjs vm/cybermap-api/test/entity-api-adapter.test.mjs` |
| Ingest/schema | `api/cybermap-observations-batch/`, `vm/cybermap-api/src/contracts.mjs`, `db/migrations/`, `shared/contracts/` | `node --test tests/cybermap-ingest-api.test.mjs tests/cybermap-schema.test.mjs vm/cybermap-api/test/contracts.test.mjs vm/cybermap-api/test/wardriver-contract-conformance.test.mjs` |
| Paper runtime | `api/tzeentch/`, `config/`, `scripts/mosaic_murmurs_*`, `tests/paper*` | `node --test tests/tzeentch-route.test.mjs tests/tzeentch-dashboard.test.mjs tests/paper-state-contract.test.mjs && python3 -m unittest discover -s tests -p 'paper*_test.py'` |
| Infra/deployment | `infra/`, `.github/workflows/`, `docs/public-ci-handoff.md` | `node --test tests/wardriver-release-delivery-config.test.mjs tests/wardriver-basemap-delivery-config.test.mjs tests/node-runtime-contract.test.mjs`; deployment/what-if workflows are separate and manual |

For a normal source change, run the focused command first, then the applicable
public-CI command:

```bash
npm ci --prefix api --ignore-scripts --engine-strict
npm ci --prefix vm/cybermap-api --ignore-scripts --engine-strict
node --test --test-skip-pattern='^Obscura ' tests/*.test.mjs
npm test --prefix vm/cybermap-api
git diff --check
```

The checked-in Graphify report is a navigation aid, not a current proof. The
checkout currently has no `graphify` executable; do not regenerate or claim a
semantic refresh until the tool is available. Documentation-only changes do not
require a Graphify refresh under the repository instructions.

## Documentation and artifact CI

`.github/workflows/documentation-artifact.yml` is the current lightweight CI
boundary for documentation changes. Its Python guard always checks changed paths
for incidental artifacts and new living-document names. It writes no bytes when
the changed set contains no living Markdown; the workflow then skips markdownlint
and lychee while still running the guard and its regression tests. When living
Markdown is selected, the job runs pinned markdownlint-cli2 0.18.1 and lychee
0.20.1 against actual relative links. It does not maintain a duplicate inventory
of these maps or alter the public/structural job admission.

The focused local checks are:

```bash
python3 scripts/check_documentation_artifacts.py --changed-since HEAD^
python3 scripts/check_documentation_artifacts.py --changed-since HEAD^ --list-living-docs
python3 -m unittest discover -s scripts -p 'test_docs_hygiene.py' -v
```
