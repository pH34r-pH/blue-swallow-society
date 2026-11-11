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
  -> public journal; explicit Login opens password entry
  -> /api/companion-auth/{session|login}
  -> durable viewer session
  -> /operator/{map|encounters|trips|downloads}
  -> app/companion-loader.mjs
  -> /api/companion-ui/{shell.html|theme.css|main.mjs}
  -> isolated viewer-safe shell; browser development-download facade
  -> explicit Read shared data loads private dataset client/worker
  -> /api/companion-datasets/{roster|object}
  -> bounded signed-chain admission in worker memory; progress controls

Retained owner tools
  -> /owner + app/owner/main.js
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
Functions before private reads. The public root contains the journal and
explicit Login; it does not reveal the companion shell or Wardriver artifacts.
The private downloads view offers a secret-free phone-page link, release details,
and an explicit update check; each artifact request remains viewer-authorized and
bound to an immutable version and revision.
The private shell's explicit Admin login initiates the separate Entra owner flow;
normal friend navigation does not. Password-authorized shared entity inspection
is required but not yet implemented; the existing entity workbench remains
owner-only and is not evidence of friend access.
`scripts/prepare-linked-frontend.mjs` builds a local source-bound frontend-only
candidate for the future linked-backend path and records file hashes separately.
The semantic release workflow packages and attests that frontend beside the
matching OCI image. A local candidate is not release or deployment evidence.

## Companion dashboard boundaries

Society vNext is being implemented under
[`specs/031-society-vnext/`](../specs/031-society-vnext/spec.md). Its first source
slice adds opt-in password viewer sessions and a browser-authorized development
download facade. The second adds the public journal, explicit Login and an
isolated Vector Edge shell with Map/Encounters/Trips/Downloads navigation.
The separate [bird-history package](../specs/032-bird-history/spec.md) contains
an owner-only, same-origin CSV preview endpoint and `/owner/birds` preview UI;
its candidate format is not yet verified, and durable private import and
publication remain open.
When private storage is explicitly configured, the preview compares candidates
against the current validated draft snapshot without treating missing rows as
deletions or provisional identities as proven. The Blob adapter supports ETag
conditional writes; no storage was provisioned.
An owner-only commit endpoint applies a fingerprint-bound selection as drafts;
the owner UI provides paginated field review and explicit selection. No storage
was provisioned, and no publication workflow has been connected.
An unconnected publication planner creates sanitized, explicitly selected
projections; it does not write or publish them.
Shared observation history can now be read explicitly into a verifying private
worker. Map displays receiver fixes; Encounters and Trips remain unavailable.
The bounded receiver-fix projection is in
`api/_private/companion/data/receiver-projection.mjs`; it preserves contributor
provenance and excludes ambiguous or invalid geometry. Its worker query checks
epoch and generation; the client invalidates pending queries on changes, clear,
refresh or teardown. The MapLibre view uses these fixes and an optional explicit
OpenStreetMap basemap. It is not an emitter map.
Receiver points can be selected on the map or through a keyboard-accessible list;
the details and inspector show contributor, session, clock and accuracy values.
The contributor filter scopes receiver fixes to a signed roster member; it does
not change membership, erase history or make ambiguous geometry trustworthy.
The next slice adds the separately enabled read-only Blob transport in
`api/companion-datasets/`, with current signed-roster checks and bounded exact
object reads. The [dataset reader contract](companion-dataset-reader.md) defines
its authority, producer compatibility, bounded admission/refresh implementation
and remaining map/history projection and Android parity requirements.
The browser-compatible codec in `api/_private/companion/data/` now verifies
signed v1/v2 envelopes and supported records using static protobufjs and
WebCrypto. Actual Kotlin producer bytes pass Node and Chromium-worker checks;
shared admission, cutoff/conflict handling and projection are not connected yet.
Retained owner APIs remain separate. See [the foundation contract](society-vnext-foundation.md)
for configuration and limits; this is not launch or deployment evidence.

`api/_private/companion/` is the new viewer-safe shell. It supports route
history, explicit renewal, desktop panel resize, phone collapse and private
development downloads. The public `/api/bird-journal` projection serves approved
posts/sightings only; its initial publication is empty. Real import/publication,
generated feeds and the compatible shared-dataset reader remain open work.

`api/_private/operator/shell.html` remains the separate owner dashboard:

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
coordination, the Godeye live-feed request/response boundary, focused Godeye
render helpers, and the retained public aggregate request/renderer while
preserving the existing browser contract. Follow-up slices
may extract remaining retained render/data helpers with browser evidence. Tzeentch and
Morning-dossier surfaces are retained only as paper-only contracts and are not part
of this backlog; dormant AR correctness, hosting, authentication provisioning, and
new product features remain separate work.

## Implemented code versus unverified operation

| Boundary | Implemented and checked in source | Still unverified here |
|---|---|---|
| Owner access | Entra authorization-code/PKCE flow, exact tenant/audience/owner checks, five-minute signed session, HttpOnly cookie, memory-only browser token | Real Microsoft sign-in, production identities/consent, live wrong-owner denial, and deployment settings |
| vNext viewer foundation | Public-first journal, explicit password dialog, isolated Vector Edge shell; scrypt (including versioned prehashed migration), global/caller throttling, durable 15-minute idle/eight-hour absolute sessions, ETag renewal, revocable logout, cross-tab lock and immutable development-download card | Private configuration/table provisioning, timer/runtime qualification, compatible dataset reader, populated map/history and live downloads |
| Private companion | Loader fetches private shell/assets through operator token and fixed allowlist; browser tests cover route navigation and asset handoff | Live hosted shell/asset behavior on the deployed origin |
| Entity workbench | VM contract, migration 0007, Functions scope checks, optimistic preview/mutate, replay/stale-revision handling, browser/PostGIS tests | Live migration/application and real owner `Entities.Write` consent |
| Observation upload | Functions batch proxy validates method/body/HTTPS backend and forwards device, token, and idempotency headers; Wardriver source owns encrypted V2 staging and receipt handling | A production Wardriver-to-VM upload, deployed PostGIS persistence, and device certificate/token acceptance |
| AR/vision | Society contains parser/geometry/rendering helpers and the hosted dashboard has no browser AR tab; Wardriver owns the actual ARCore/LiteRT camera feature | Physical camera/ARCore behavior, model accuracy, depth availability, and any RF/visual association |
| Release delivery | Private manifest validation, operator-only metadata, five-minute HTTPS read-only Blob SAS, and Android metadata-only update client contracts | Current Blob manifest, live artifact provenance, installed-device update, and real release acceptance |
| vNext development updates | Separate bearer-gated HTML index, signer-pinned immutable receipt validation, and fresh five-minute APK/FAP grants under `api/wardriver-development/`; independent reader hashes allow per-device update-read revocation | Protected reader/storage/signer configuration, qualified Node 24 deployment, publisher integration, Obtainium updates, and physical Bluetooth installation |
| Private device dataset sync | `api/wardriver-sync/` validates RS256 device proofs, atomically claims invitations and replay nonces, publishes a versioned signed roster, and grants group reads / own immutable creates / exact own head writes through managed identity | Protected group/owner/signer settings, private container and managed-identity roles, live prefix enforcement, qualified Node 24 deployment, and phone onboarding/sync |
| Paper trading | Tzeentch routes and paper ledger remain read-only/paper-only; research and ledger records are retained | No live exchange, broker, wallet, or prediction-market execution is implied or authorized |

Do not turn a test fixture, local proof, source route, or historical deployment
observation into a live claim. In particular, `docs/azure-resources.md`,
`docs/cybermap-geospatial-backend.md`, and `docs/owner-entra-cutover.md` contain
design or cutover constraints that must be reconciled with private deployment
evidence before use as operations guidance.

The vNext feed contract is in
[`specs/028-vnext-private-update-feed/`](../specs/028-vnext-private-update-feed/spec.md).
It uses a stable authenticated index and immutable versioned download paths;
expiring Blob grants are issued at download time. Its credentials do not authorize
owner APIs, observation upload, or shared-map access. Current Society source
requires Node 24 and is packaged by the public Functions OCI release workflow;
Wardriver's retained Node 22 managed-SWA promoter cannot deploy this source.
Runtime qualification and live configuration remain separate work.

The private dataset access contract is
[`docs/wardriver-device-sync-access.md`](wardriver-device-sync-access.md), with
source acceptance in
[`specs/029-wardriver-device-sync-access/`](../specs/029-wardriver-device-sync-access/spec.md).
It issues access metadata only: phones transfer payloads directly to Blob storage
and maintain their own incremental maps. Device keys establish membership without
accounts; the protected owner pin and owner-authorized service signer establish
the group. This route does not call the retained observation-ingestion service.

## Change routing and focused validation

| Change area | Start with | Focused validation |
|---|---|---|
| Public journal/viewer entry | `app/index.html`, `app/main.js`, `app/journal-view.mjs`, `app/companion-loader.mjs`, `api/companion-ui/`, `api/bird-journal/` | `node --test tests/society-vnext.browser.mjs tests/journal-companion-boundary.test.mjs` |
| Retained owner sign-in | `app/owner/`, `api/owner-auth/`, `api/shared/owner-session.cjs`, `api/_lib/owner-*` | `node --test tests/owner-auth.test.mjs tests/owner-login.browser.mjs` |
| vNext viewer/download foundation | `api/companion-auth/`, `api/companion-downloads/`, `api/_lib/viewer-session*`, `api/_lib/companion-auth.js` | `node --test tests/viewer-session.test.mjs tests/companion-auth.test.mjs tests/companion-downloads.test.mjs tests/passcode-rate-limit.test.mjs` |
| Companion route/shell/assets | `app/operator/`, `api/_private/operator/`, `api/operator-shell/`, `api/operator-assets/` | `node --test tests/companion-navigation.test.mjs tests/companion.browser.mjs tests/ui-shell.test.mjs tests/operator-shell-api.test.mjs` |
| Travels/history/nearby map | `api/cybermap-history/`, `api/operator-signals/`, `vm/cybermap-api/src/history-*`, `api/_private/operator/assets/travels-*` | `node --test tests/history-api.test.mjs tests/travels-state.test.mjs tests/travels.browser.mjs vm/cybermap-api/test/history-*.test.mjs` |
| Entities/auth | `api/cybermap-entities/`, `api/_lib/entity-*`, `api/_private/operator/assets/entity-*`, `vm/cybermap-api/src/entity-*` | `node --test tests/entity-proxy.test.mjs tests/entity-edit-auth.test.mjs tests/entity-workbench.browser.mjs tests/entity-integration.browser.mjs vm/cybermap-api/test/entity-workbench*.test.mjs vm/cybermap-api/test/entity-api-adapter.test.mjs` |
| Ingest/schema | `api/cybermap-observations-batch/`, `vm/cybermap-api/src/contracts.mjs`, `db/migrations/`, `shared/contracts/` | `node --test tests/cybermap-ingest-api.test.mjs tests/cybermap-schema.test.mjs vm/cybermap-api/test/contracts.test.mjs vm/cybermap-api/test/wardriver-contract-conformance.test.mjs` |
| Private dataset access | `api/wardriver-sync/`, `api/_lib/wardriver-sync-*`, `docs/wardriver-device-sync-access.md` | `node --test tests/wardriver-sync-auth.test.mjs tests/wardriver-sync-api.test.mjs` |
| Browser dataset transport | `api/companion-datasets/`, `api/_lib/companion-dataset-store.js`, `docs/companion-dataset-reader.md` | `node --test tests/companion-datasets.test.mjs` |
| Browser dataset wire codec | `api/_private/companion/data/`, `vendor/wardriver-wire/`, `scripts/build-companion-wire.mjs` | `node scripts/build-companion-wire.mjs --check`; `node --test tests/dataset-wire.test.mjs tests/dataset-wire.browser.mjs` |
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

Use this maintained Markdown map and the scoped `AGENTS.md` files for navigation,
then verify claims in source with `rg`. Update the affected map when a boundary
changes. Generated topology is not a development or validation dependency.

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

The private Wardriver development feed also exposes a reader-authenticated `current.json` receipt for native clients; its source availability does not establish live deployment.

The private device-sync source can optionally issue a five-minute development update grant to explicitly allowlisted active devices. The development feed verifies the purpose-typed signed grant independently of dataset storage grants and existing reader tokens. This source does not establish deployment or device enrollment.
