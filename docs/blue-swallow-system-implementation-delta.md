# Blue Swallow Society System Implementation Delta

**Audit timestamp:** 2026-07-11 20:47 PDT  
**Scope:** deployed website, Azure Static Web Apps Functions, Azure VM/infrastructure, Cybermap/PostGIS design, Mosaic & Murmurs automation, and the Blue Swallow Wardriver Android fork  
**Method:** source review, proposal/spec comparison, local test/build execution, read-only Azure/GitHub inspection, Hermes scheduler inspection, and deployed-host smoke tests

## Executive verdict

Blue Swallow Society currently has a **working Black ICE entry split, a protected operator dashboard, public-source OSINT/market adapters, a private Wardriver download path, a tested Cybermap SQL schema, and a buildable Android sensor prototype**.

It does **not** yet have the designed end-to-end intelligence spine.

The missing center is the backing system of record:

```text
Wardriver observation exporter
  -> authenticated VM ingest API
  -> deployed PostgreSQL/PostGIS
  -> materializer
  -> Cybermap read API
  -> token-gated SWA proxies
  -> Godeye provenance UI
```

At audit time the Azure VM was deallocated and contained only the public echo-lab design. No Cybermap API service, managed PostgreSQL server, applied migration, materializer, or Wardriver-to-VM flow was deployed. Repair work has since added the first authenticated/idempotent ingest service, PostgreSQL store, second migration, and typed Android batch contract in source; none of that new spine is deployed or wired into scanner lifecycle yet.

The implementation therefore has three distinct maturity bands:

1. **Operational:** public/passcode split, event cover site, operator-token shell/API gates, private APK download, CI deployment, core public-source adapters.
2. **Prototype / partial:** Godeye, Tzeentch paper books, morning brief automation, paper-memory loop, Breach Mirror model, Wardriver RaID/local bridge, and the source-only authenticated Cybermap ingest slice.
3. **Designed only or not deployed:** deployed PostGIS/API service, Cybermap materializer/read path, enrolled Wardriver scanner upload, real RaID ranging/identification, nightly dream consolidation, autonomous-but-bounded agent loops, and later sensorium/embodiment stages.

## Audit boundaries and provenance

### Website/API repository

- Repository: `/home/ph3/repos/blue-swallow-society`
- Branch/commit: `main` at `a3b9be6` (`fix: restore BSS passcode split and private APK`)
- Remote: local `main` matched `origin/main`
- Deployed workflow: GitHub Actions run `29173745441`, successful, head `a3b9be6`
- Deployment host: `https://lively-pebble-0e8b1ec1e.7.azurestaticapps.net`
- Working tree: dirty; paper-memory/public-events/docs changes remain uncommitted and are not part of the deployed commit

### Wardriver repository

- Repository: `/home/ph3/repos/blue-swallow-wardriver`
- Branch/commit: `main` at `911a556`
- Working tree: dirty; bridge hardening, VM upload client, encrypted outbox, and their tests are uncommitted

### Status vocabulary

- **Operational:** implemented, locally verified, and live or directly usable.
- **Implemented, not deployed:** code exists and tests pass, but the live environment does not run it.
- **Prototype:** real code exists, but it is not an end-to-end production path.
- **Schema only:** data contract/migration exists without a running store/service.
- **Designed only:** proposal/spec exists without corresponding executable path.
- **Blocked:** implementation exists but an external or runtime dependency prevents operation.

## Capability matrix

| Capability | Designed intent | Actual state | Status | Primary evidence |
|---|---|---|---|---|
| Public root | Unchanged title, one entry field, lowercase login button | Implemented and live; root contains no APK/operator links | **Operational** | `app/index.html`, `app/main.js`, deployed root smoke |
| Passcode split | Operator credential opens hidden console; all other values open event cover site | Server-side digest validation and signed session issuance; non-match opens event site | **Operational** | `api/validate-passcode/index.js`, live valid/invalid probes |
| Event cover site | Standard personal/event-planning surface | Calendar/list and local-browser supply claims implemented; latest enhancements are partly uncommitted | **Operational / evolving** | `app/main.js`, `app/public-events.mjs`, UI tests |
| Hidden operator shell | Real shell must not ship in public root | Shell HTML is token-gated behind `/api/operator-shell`; static loader redirects unauthenticated users | **Operational with exposure gap** | `api/_private/operator/shell.html`, `api/operator-shell/index.js` |
| Operator code concealment | No public-side operator implementation disclosure | `/operator/main.js` and `/operator/tzeentch.mjs` are anonymously downloadable if paths are guessed | **Partial** | live anonymous `200` on operator modules |
| Operator API auth | All operator data/actions require scoped session token | WiGLE, OSINT, agent, Tzeentch, shell, and download routes call `requireOperatorToken` | **Operational** | `api/_lib/operator-auth.js`, anonymous live `403` probes |
| Wardriver distribution | APK available only after operator auth | APK/metadata served from Functions-private directory; public `/downloads/*` returns `404` | **Operational** | `api/operator-downloads/index.js`, live smoke |
| Wardriver artifact quality | Reproducible, release-signed field artifact | Distributed artifact is a debug APK; no release-signing/promotion pipeline | **Prototype** | private artifact metadata, `buildType: debug` |
| Godeye/WiGLE map | Live Cybermap backed by durable observations and provenance | Can render sample/local/bridge-derived markers; no durable Cybermap backend read | **Prototype** | `app/operator/wigle.mjs`, `/api/wigle` |
| Browser AR | Current observation overlays with honest confidence/range | Candidate boxes are signal/heuristic UI; no camera/depth/bearing fusion | **Prototype** | `app/operator/main.js`, Wardriver repair plan |
| OSINT | Token-gated public-source reconnaissance with SSRF controls | Implemented with target classification, bounded fetches, DNS/private-IP checks, and redirect revalidation | **Operational, bounded** | `api/osint/index.js`, `api/osint/safety.js`, tests |
| Tzeentch feeds | Murmurs perception feed plus Mosaic/Bridge context | Live public news/crypto/prediction adapters and operator UI exist | **Operational / partial doctrine** | `api/tzeentch/index.js`, `app/operator/tzeentch.mjs` |
| Paper books | Five $1,000 paper books, per-book PnL/drawdown, autonomous risk-policy-bound actions | Deployed code has three $10,000 warm-memory strategies and executes paper orders on refresh; five-book model is uncommitted | **Prototype; contract drift** | deployed `HEAD:api/tzeentch/index.js`, working diff, ledger config |
| Durable paper ledger | Append-only VM-backed paper history and memory | Deployed path is warm Function memory unless an optional file path exists; local script writes local files | **Not durable** | `api/tzeentch/index.js`, paper-memory script/docs |
| Autonomous investment execution | Mosaic and Murmurs make investment decisions without per-action human review, bounded by machine-enforced capital/risk policy | Execution is coupled to feed refresh and lacks durable idempotency, decision traces, and canonical five-book state | **Autonomous prototype; controls incomplete** | `buildPaperOrder` / execution path |
| Morning brief | 06:30 PT Mosaic/Murmurs/Bridge brief with paper footer | Collector and Hermes job registered; job had not yet completed its first scheduled morning run at audit time | **Implemented, first-run pending** | collector, implementation doc, cron job state |
| Hourly pulse/paper tick | Local append-only loop records and paper ledger updates | Two no-agent Hermes jobs had successful runs | **Operational locally** | Hermes cron state and local artifacts |
| Dream consolidation | Nightly durable memory/source/calibration consolidation | Proposal exists; no corresponding scheduled dream job was registered | **Designed only** | dream proposal versus cron inventory |
| Breach Mirror | Bounded report/repair/retest self-pentest loop | Deterministic readiness builders/tests and one report artifact exist; no recurring autonomous runner | **Prototype** | operator ledger code, tests, self-pentest proposal |
| S0 sensorium | Broad lawful read-only source catalog with health/provenance | Public-source collectors cover a useful subset; no unified source catalog/health service | **Partial** | collector sources, doctrine, schema |
| Azure CI/CD | GitHub OIDC deploy of infra, settings, SWA | Canonical workflow succeeds and deploys current site | **Operational** | `.github/workflows/deploy-static-web-app.yml`, run `29173745441` |
| Public custom domain | `blueswallow.net` and `www` bound to SWA | Azure DNS resources exist, but names do not resolve and SWA has no custom hostname binding | **Blocked: registrar/delegation** | Azure hostname list and DNS resolution |
| VM compute | Private backing API host | VM exists but was deallocated; design still provisions public IP/ports | **Scaffold / offline** | Azure resource inventory and VM power state |
| VM API | Versioned health, ingest, Cybermap, memory, and journal endpoints | Health/readiness and authenticated idempotent observation ingest now exist in source with bounded PostgreSQL transactions, non-blocking batch locks, active-session ownership checks, durable receipt validation, and memory-store tests; deployed VM remains echo-only | **Implemented slice, not deployed** | `vm/cybermap-api/src/`, API tests |
| PostgreSQL/PostGIS resource | Managed B1MS store attached privately | VNet/subnet/private-DNS prerequisites exist; no Flexible Server resource exists | **Not deployed** | `infra/main.bicep`, Azure resource inventory |
| Cybermap schema | Append-only observations, entities, H3 cells, memories, sync batches | `0001` core plus `0002` scoped device credentials/content hashes/durable receipts exist and textual contract tests pass | **Schema only** | `vm/cybermap-api/db/migrations/` |
| Schema execution | Migration applies against empty PostGIS and is versioned | No disposable/managed PostGIS execution proof was found | **Missing verification** | only static Node schema tests exist |
| Cybermap materializer | Derive cells/entities from observations with provenance | No materializer implementation found | **Designed only** | no materializer files; design docs only |
| SWA Cybermap proxy | Same-origin token-gated viewport/cell/entity reads | No `/api/cybermap/*` Functions exist | **Designed only** | repair plan/API spec versus `api/` tree |
| Wardriver branding/package | Co-installable BSS fork | App id, version, icon, and default English name are branded | **Operational** | Gradle, manifest, resources |
| Wardriver scan platform | Wi-Fi/BLE/cell/GNSS capture from WiGLE base | Upstream scanning/database surfaces remain functional and build-tested | **Operational base** | inherited app code and Gradle tests |
| RaID camera surface | Live camera plus range/ID/service telemetry | CameraX preview, decorative mesh, reticle, and honest “range pending” status | **Prototype** | `RaIDFragment.java`, `RaIDOverlayView.java` |
| RaID ranging/ID | ARCore/depth/bearing/object/service fusion | No ARCore, detector, SLAM, depth, RF bearing, or real boxes | **Designed only** | RaID source comments and repair plan |
| Device-local bridge | Explicit lab-only loopback sensor tap | Rich read-only bridge exists; current hardening makes it build-time and session gated, default off | **Implemented, uncommitted** | `BssLocalBridge.java`, working diff |
| Wardriver VM client | HTTPS batch ingest with device/scoped token | Typed strict batch model, semantic timestamp validation, device/idempotency envelope binding, client headers/replay signal, and exact-body stage/retry coordinator exist; scanner lifecycle does not instantiate them | **Implemented boundary, unwired/uncommitted** | `BssVmObservationBatch.java`, `BssVmUploadClient.java`, `BssVmBatchCoordinator.java` |
| Encrypted outbox | AES-GCM staging before controlled upload | Outbox plus coordinator tests prove exact-body stage/retry/upload transitions and leave malformed receipts pending; caller-supplied key still has no Android Keystore owner or app integration | **Implemented boundary, unwired/uncommitted** | `BssVmEncryptedOutbox.java`, `BssVmBatchCoordinator.java` |
| Enrollment/retry/receipts | Device token enrollment, WorkManager retry, idempotency, status UI | Batch/header idempotency, durable receipt validation, and replay receipt signal exist; enrollment, Keystore, WorkManager, and status UI do not | **Partial, unwired** | VM/Android contract tests |
| End-to-end field flow | Wardriver -> VM -> PostGIS -> Cybermap -> Godeye | No integration path exists | **Missing** | all three system reviews |

## Website and Static Web Apps review

### What is genuinely working

1. **The requested split is restored.** The deployed root is the minimal Blue Swallow login face. A non-matching entry returns the public event branch without an operator token. A matching entry issues a signed token and opens the operator route.
2. **The APK is no longer public static content.** Anonymous metadata/APK requests return `403`, while the old static download path returns `404`.
3. **The real shell markup is server-side.** `/operator/` is a loader; `/api/operator-shell` returns the private shell only after token validation.
4. **Operator data APIs fail closed.** Anonymous WiGLE, Tzeentch, OSINT, agent, and download calls are denied.
5. **OSINT URL probing has meaningful SSRF controls.** It requires HTTPS, rejects credentials/private/reserved hosts, resolves DNS, revalidates redirects, caps response bytes, and uses timeouts.
6. **CI/CD is healthy.** The canonical GitHub workflow deployed the audited commit successfully.

### Material gaps and risks

#### P0 — public echo path reaches a public VM scaffold

`/api/echo` remains anonymous and forwards to a VM base configured as public HTTP port `8080`. Azure currently allows inbound SSH and `8080` from `*`. The VM was deallocated, so the deployed echo request returned `502` or waited on the unavailable upstream.

This is the opposite of the intended Black ICE topology even though the current service is only an echo daemon. It exposes the VM address/port design, creates an unauthenticated proxy path, and retains internet ingress that the planned Tailscale/private path was supposed to remove.

**Required repair:** remove `/api/echo` from production or token-gate it; eliminate public `8080`; restrict SSH; deploy the real API behind private/Tailscale/HTTPS reachability; add upstream timeouts and circuit-breaker behavior.

#### P1 — operator JavaScript is discoverable without auth

The shell/data are protected, but guessed requests to `/operator/main.js` and `/operator/tzeentch.mjs` return `200`. Those bundles disclose operator labels, route names, and client behavior.

This is not a direct authorization bypass, but it falls short of “materially hidden” and leaks attack-surface intelligence.

**Required repair:** serve operator bundles through a token-gated Function or produce a token-gated self-contained shell bundle. Keep the public `/operator` response to a generic redirecting loader with no capability names.

#### P1 — browser-readable bearer session

The session token is stored in `sessionStorage` and attached by JavaScript. The API also emits an HttpOnly cookie, but the deployed cookie path did not authenticate the curl cookie-jar smoke while the custom bearer header did. A same-origin XSS could therefore exfiltrate an eight-hour token, and there is no server-side revocation list.

**Required repair:** determine why cookie auth is ineffective in the deployed SWA path; prefer HttpOnly/SameSite cookie auth if the platform permits it; shorten TTL; add rotation/revocation semantics; keep CSP strict and remove unnecessary dynamic HTML injection.

#### P1 — login throttling is instance-local

The passcode rate limit is an in-memory map keyed from forwarded headers. It resets on cold start/scale-out and depends on platform-supplied client IP semantics.

**Required repair:** move throttling to an edge/service with durable counters, or use SWA/Front Door/WAF controls. Treat the passcode as one factor protecting a hidden surface, not as a durable identity system.

#### P1 — autonomous investment execution lacks durable controls

Mosaic and Murmurs are responsible for making investment decisions autonomously; there is no per-action human review gate. The deployed Tzeentch implementation is directionally autonomous, but it mutates warm paper books as a side effect of feed refresh and does not persist a durable decision trace, idempotency key, risk-policy evaluation, or the canonical five $1,000 books.

**Required repair:** move autonomous evaluation/execution onto a scheduled ledger loop; enforce capital, exposure, drawdown, cooldown, and stale-data policy in code; make every action idempotent and append-only; deploy the canonical five-book ledger after tests and migration.

### UI/product delta

- **Operator landing:** still primarily mood/interface scaffolding rather than operational health and queue state.
- **Godeye:** useful local/demo map renderer, not Cybermap. Sample data must remain visibly labeled and never become fallback “live” data.
- **Browser AR:** implementation helpers exist, but the private shell does not expose a complete sensor-fusion workflow.
- **Tzeentch:** strongest implemented operator surface, but Mosaic truth synthesis, Bridge deltas, provenance calibration, and durable autonomous decision history are thinner than the doctrine.
- **Agent surface:** protected UI/API scaffolding exists; it is not the planned autonomous dual-loop daemon.

## Backing VM API and infrastructure review

### What exists

- Azure resource group and canonical Static Web App.
- Ubuntu VM, NIC, public IP, NSG, auto-shutdown, VNet/subnets, and private DNS zones.
- Cloud-init echo service on port `8080`.
- Cybermap migrations with PostGIS/pgcrypto, append-only observations, source classes, sessions, entities, H3 columns, cells, memories, sync batches, scoped credential digests, content hashes, and durable receipts.
- An executable Node Cybermap API slice with health/readiness, strict authenticated batch ingest, bounded PostgreSQL transactions, non-blocking batch locks, active-session ownership checks, durable receipt validation, in-memory contract tests, and a PostgreSQL store.
- Static and behavioral Node tests for schema, validation, passive-observation preservation, authentication, replay, changed-content conflicts, H3 derivation, and transactional store behavior.
- Detailed API and geospatial design documents.

### What does not exist

- A deployed Cybermap API service unit/container or GitHub promotion step.
- Device enrollment, rotation, revocation, or Android Keystore token ownership.
- Managed-PostgreSQL execution proof for the new ingest migrations.
- Memory/journal/narrative endpoints.
- Viewport/cell/entity query handlers.
- A deployed PostgreSQL Flexible Server.
- Proof that the migration applies against real PostGIS.
- Seed/source-catalog jobs.
- A materializer.
- Backup/restore, retention, audit, and observability implementation.
- Private VM connectivity from SWA Functions.

### Design-to-code delta by proposed P0 endpoint

| Endpoint | State |
|---|---|
| `GET /healthz` | Implemented in source; not deployed |
| `GET /readyz` | Implemented in source with migration readiness; not deployed |
| `POST /api/v1/sensorium/sessions` | Missing |
| `POST /api/v1/observations/batch` | Implemented and tested in source; not deployed |
| `GET /api/v1/cybermap/viewport` | Missing |
| `GET /api/v1/cybermap/cells/{h3Cell}` | Missing |
| `GET /api/v1/entities/{id}` | Missing |
| `POST /api/v1/narrative/fragments` | Missing |
| `GET /api/v1/narrative/stream` | Missing |
| `POST /api/v1/journal/entries` | Missing |
| `POST /api/v1/paper/books/{bookId}/ticks` | Missing |
| `GET /api/v1/paper/ledger` | Missing |
| `POST /api/v1/memory/patches` | Missing |
| `GET /api/v1/memory/patches` | Missing |

The authenticated handler and PostgreSQL store now exist in source, but they are not evidence of a working field backend until both migrations execute against real PostGIS and the deployed service passes authenticated replay tests.

## Wardriver review

### What is genuinely working

- The fork builds as `co.blueswallow.wardriver`, version `2.109-bss.1`.
- CameraX RaID navigation and preview are integrated.
- The inherited WiGLE scanner/database platform remains available.
- `BssLocalBridge` provides a substantial loopback-only, read-only view over current network/GNSS state, signal envelopes, heuristic boxes, and passive BLE/Flipper-like candidates.
- The current working-tree hardening defaults the bridge off and requires an explicit session preference in addition to the build flag.
- The typed VM batch model, idempotency-aware upload client, AES-GCM outbox, and exact-body coordinator pass JVM tests.
- The Jetson/aarch64 build lane works through the user-local QEMU AAPT2 override.

### What remains prototype or missing

1. **RaID is camera chrome, not Range-and-ID.** It renders a preview, grid, reticle, and status string. There is no measurement/inference pipeline.
2. **Heuristic AR data is not wired into RaID.** The local bridge can emit hashed screen hints, but the Android camera overlay does not consume them.
3. **The bridge enable setter has no product UI caller.** With the new default-off build, the bridge is effectively unavailable unless a future lab surface calls it.
4. **VM upload remains outside scanner lifecycle.** The typed model, outbox, coordinator, and client compose a tested boundary, but production scanner/session code never instantiates it.
5. **The typed batch contract is not an exporter.** `BssVmObservationBatch` serializes the canonical contract, but no code maps real WiGLE database/session rows into it.
6. **No Android Keystore owner exists.** The outbox accepts a key from its caller; there is no production key lifecycle.
7. **No enrollment/retry/receipt UI exists.** No scoped token storage, WorkManager job, sync status, or redaction policy is connected.
8. **Sensitive primary data remains outside the new outbox.** The inherited WiGLE database is the real store, and the manifest currently allows Android backup. Encrypting an unused outbox does not protect the main observation database.
9. **Distributed artifact is debug-signed.** Suitable for sideload tests, not a controlled field release.
10. **Localization is incomplete.** Default English branding is BSS, while many translated resources still identify WiGLE; that is acceptable for lineage but not a fully rebranded product.

### Android security delta

- Set `android:allowBackup="false"` or provide explicit backup/data-extraction rules that exclude RF observations, credentials, and outbox material.
- Add Android Keystore-backed keys and non-exportable scoped ingest credentials.
- Keep upload disabled until explicit enrollment and operator-visible consent.
- Add certificate pinning only if operational rotation can be supported; otherwise rely on validated HTTPS/Tailscale identity and short-lived scoped tokens.
- Produce a release-signed APK with a documented promotion/checksum process. Do not silently replace the operator artifact from arbitrary local debug builds.

## Mosaic & Murmurs proposal delta

### Implemented slices

- Public-source collector across US/Washington/news/security/technology/market/trend sources.
- Registered 06:30 PT morning-brief job.
- Registered local pulse and paper-tick jobs with successful executions.
- Operator Tzeentch source and market panels.
- Paper-only language and ledger structures.
- Deterministic Tier-2/Breach-Mirror readiness models and tests.
- Source-health/staleness concepts in code and docs.

### Planned but not yet real

- Durable Mosaic truth graph and contradiction ledger.
- Durable Murmurs spread graph with platform-jump evidence.
- Bridge calibration against resolved outcomes.
- VM-backed narrative stream and memory patches.
- Durable autonomous investment decision/execution state, machine-enforced risk evidence, and operator observability/override UI.
- Nightly dream consolidation scheduler and persisted outputs.
- Recurring Breach Mirror runner with repair tickets and retest promotion.
- Unified source catalog/health service.
- S1 paid data, S2 expanded sensor fleet, S3 active collection, or S4 physical actuation.
- Embodiment beyond dashboard/notification metaphors.

### Automation drift

The daily note says wake and dream cadences were registered, but scheduler inspection found only:

- `mosaic-murmurs-pulse`
- `mosaic-murmurs-paper-tick`
- `mosaic-murmurs-morning-brief`

No dream-consolidation job was present. Documentation should distinguish **proposed cadence**, **registered job**, and **completed run**.

## Security posture summary

### Controls that are working

- No passcode literal/hash in the browser bundle.
- Digest and signing material validated in CI settings.
- Operator APIs fail closed without a signed token.
- APK absent from public static paths.
- CSP/HSTS/frame/content-type/referrer headers configured.
- OSINT private-target and redirect checks are substantial.
- WiGLE direct coordinate-bearing public API lookup is disabled.
- Wardriver local bridge binds loopback and is being changed to default-off/session-gated.
- Encrypted outbox design uses AES-GCM so full-fidelity RF observations are not staged as plaintext at rest.

### Open findings

| Priority | Finding | Impact |
|---|---|---|
| P0 | VM ingress permits public SSH/8080 and `/api/echo` is anonymous | Public backing surface contradicts Black ICE architecture |
| P0 | Authenticated ingest exists only in source; no deployed backend/system of record exists | Wardriver/Cybermap field claims still cannot be fulfilled or audited live |
| P1 | Static operator modules are anonymously retrievable | Capability/route disclosure despite protected shell/data |
| P1 | Browser bearer token is script-readable and long-lived | XSS/token theft blast radius; no revocation |
| P1 | Login throttling is memory-local | Weak brute-force resistance under scale/cold starts |
| P1 | Autonomous paper orders mutate as a side effect of feed refresh | Lacks durable idempotency, risk-policy evidence, and reproducible evaluation semantics |
| P1 | Debug APK is the distributed field artifact | Weak release provenance and signing posture |
| P1 | Android backup is enabled for a sensor database app | Potential extraction of observation/configuration data |
| P1 | Working-tree security fixes are uncommitted | Tested state can be lost and is absent from reproducible history |
| P2 | DNS/custom domains unresolved | Default Azure hostname remains the only working public endpoint |
| P2 | Documentation overstates registered/deployed capabilities | Operators can mistake schema/prototype code for live controls |

## Verification results

### Local

- BSS Node suite: **97 passed, 0 failed**
- BSS Python suite: **7 passed, 0 failed**
- Wardriver JVM tests: **38 passed, 0 failed, 0 skipped**
- Wardriver debug assembly: **successful**
- Local debug APK: `67,008,791` bytes; SHA-256 verified during audit

### Deployed

- Root: `200`, minimal login face
- Non-operator split: public event surface returned without operator session
- Operator credential: signed session issued
- `/operator/`: anonymous loader `200`
- `/api/operator-shell`: anonymous `403`; token header `200`
- Wardriver metadata/APK: anonymous `403`; token header `200`
- Old `/downloads/...apk`: `404`
- `/api/wigle`: anonymous `403`
- `/api/tzeentch`: anonymous `403`; token header `200`
- `/operator/main.js` and `/operator/tzeentch.mjs`: anonymous `200`
- `/api/echo`: unavailable upstream (`502`/timeout behavior while VM deallocated)

### Azure/runtime

- Canonical SWA exists and latest deploy succeeded.
- VM power state: deallocated.
- NSG allows inbound TCP `22` and `8080` from `*`.
- No PostgreSQL Flexible Server resource found.
- SWA custom hostname list empty.
- `blueswallow.net`, `www.blueswallow.net`, `blueswallow.co.in`, and `www.blueswallow.co.in` did not resolve from the audit host.

## Recommended delivery sequence

### P0 — close the exposed scaffold and create the real spine

1. Remove/token-gate production `/api/echo`; add a strict upstream timeout immediately.
2. Restrict NSG ingress; remove public `8080`; choose private/Tailscale/HTTPS reachability.
3. Deploy PostgreSQL/PostGIS and run `0001_cybermap_core.sql` plus `0002_device_ingest_contract.sql` in CI against an empty disposable database before production.
4. Promote the tested health/readiness/observation-ingest slice, then add session create and viewport/cell/entity reads.
5. Add device enrollment/rotation/revocation and bind scoped credentials to Android Keystore; retain the implemented idempotency enforcement.

### P1 — connect field capture to the spine

6. Commit the Wardriver bridge hardening/client/outbox after review.
7. Implement `ObservationBatchV1` export from real scanner/session records.
8. Add Android Keystore enrollment, explicit upload policy, WorkManager retry, and sync receipts.
9. Add SWA `/api/cybermap/*` proxies and update Godeye to prefer backend data with no sample fallback.
10. Add one end-to-end test: fake Wardriver batch -> API -> PostGIS -> viewport -> Godeye payload.

### P1 — finish Black ICE and paper governance

11. Move operator JS behind token-gated delivery or a protected self-contained bundle.
12. Repair cookie-based session handling or document why bearer/sessionStorage is mandatory; shorten/revoke tokens.
13. Replace local login throttling with durable edge throttling.
14. Build a release-signed Wardriver promotion pipeline and disable/exclude Android backups.
15. Move autonomous paper decisions out of UI refresh; add idempotent decide/apply/record state with machine-enforced risk policy; deploy the canonical five $1,000 books with durable history.

### P2 — operationalize the proposals

16. Register and verify nightly dream consolidation.
17. Persist Mosaic/Murmurs/Bridge narrative and calibration records in the VM API.
18. Turn Breach Mirror from deterministic model output into a scheduled report/repair/retest workflow.
19. Add generated implementation status to CI so docs cannot claim deployed/runtime state from schema-only code.
20. Complete registrar delegation/custom-domain binding.
21. Only then advance real RaID depth/ID/bearing, Kismet federation, expanded sensorium, or physical embodiment stages.

## Definition of the next honest milestone

The next milestone should not be called “Cybermap complete” or “RaID backend repaired” until this thin vertical slice passes:

1. A release or test Wardriver build creates one versioned passive-observation batch with explicit `redaction_class` and `retention_class`.
2. A scoped device token submits it over an approved private/HTTPS path.
3. The VM API validates and idempotently stores it in deployed PostGIS.
4. The API returns a sync receipt.
5. The materialized observation appears in an authorized Cybermap viewport response.
6. Godeye renders it with source class, freshness, confidence radius, and provenance.
7. Anonymous/public users cannot discover or retrieve the artifact/data path.
8. Repeating the same batch creates no duplicate observation.

Until that passes, the project is a strong operator-shell and sensor prototype around a missing data spine—not yet the designed Mosaic & Murmurs field intelligence system.
