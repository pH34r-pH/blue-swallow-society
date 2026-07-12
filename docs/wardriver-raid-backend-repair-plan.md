# Wardriver RaID + BSS Backend Repair Plan

**Status:** Current-state investigation and phased repair plan
**Date:** 2026-07-11
**Scope:** Blue Swallow Society public/operator split, Wardriver RaID, device-local bridge, BSS Functions, VM Cybermap API, and Godeye Cybermap rendering

## Security invariant

The public site is a cover surface, not an operator launchpad.

Required behavior:

1. `/` renders only the unchanged login screen: `blue swallow society`, one text entry box, and a lowercase `login` button.
2. The canonical operator passcode value stays secret-only. It is represented in docs as `[REDACTED]` and configured only through `BLUE_SWALLOW_PASSCODE_SHA256` plus signing material.
3. Correct passcode unlocks the hidden operator surface and issues a short-lived operator session/token.
4. Any other passcode opens the standard event-planning personal site and returns no operator session.
5. Public HTML, scripts, and routes must not link to, name, or embed the operator console, Wardriver APK, operator APIs, or private artifacts.
6. The Wardriver APK must not exist under public static paths such as `app/downloads`. It is private Functions material and is served only through `/api/operator-downloads/wardriver/*` after `X-Blue-Swallow-Operator-Token` validation.

That invariant is non-negotiable. RaID/Cybermap repairs must never weaken it.

## Current implementation review

### Wardriver fork

Real pieces found:

- Android app id is `co.blueswallow.wardriver` with BSS build flags in `wiglewifiwardriving/build.gradle`.
- `RaIDFragment.java` and `res/layout/raid.xml` provide a RaID camera/overlay surface using CameraX preview plus a custom `RaIDOverlayView`.
- `MainActivity.java` gates `BssLocalBridge` behind `BSS_LOCAL_BRIDGE_ENABLED` plus explicit `PREF_BSS_LOCAL_BRIDGE_SESSION_ENABLED`; the BSS build flag now defaults off.
- `BssLocalBridge.java` binds only to loopback, defaulting to `127.0.0.1:9736`.
- `BssVmObservationBatch.java` serializes the strict `bss.observation_batch.v1` contract with semantic RFC3339 timestamps.
- `BssVmUploadClient.java` posts typed Wardriver observation batches to `/api/v1/observations/batch` using scoped ingest-token, device-id, and idempotency headers; it validates device/idempotency envelope binding, rejects remote plaintext HTTP, and reports the replay signal.
- `BssVmEncryptedOutbox.java` provides an AES-GCM encrypted local pending/uploaded batch queue so sensitive RF observations are not staged as plaintext at rest.
- `BssVmBatchCoordinator.java` serializes each typed batch once, stages the exact body encrypted, retries with its embedded idempotency key, refuses batches bound to a different enrolled device, and marks it uploaded only after a validated durable `bss.sync_receipt.v1`.
- The bridge is read-only. It accepts `GET` and `OPTIONS` only and advertises loopback-only/no-cloud-upload semantics.
- The bridge exposes:
  - `/health`, `/api/health`, `/api/v1/health`
  - `/api/wigle`, `/api/v1/current`
  - `/api/v1/stats`
  - `/api/v1/flipper`
  - `/api/v1/signal-envelopes`
  - `/api/ar-detections`, `/api/v1/ar-detections`
- The bridge pulls from `MainActivity.getNetworkCache()` and current GNSS state, then emits normalized Wi-Fi/BLE/cellular observations, confidence radii, signal envelopes, and Flipper-like passive BLE candidates.

Stubbed or weak pieces:

- RaID AR boxes are heuristic. `BssLocalBridge.arBox()` hashes a device id into normalized screen coordinates. It is not ARCore anchoring, SLAM, depth, camera object detection, or RF direction finding.
- Confidence/range is an RSSI + age + GPS accuracy heuristic. It is useful field UI, not verified emitter localization.
- Flipper support is passive name/service/manufacturer heuristic only. There is no explicit paired-device service telemetry contract yet.
- `BssLocalBridge` is tied to activity lifecycle rather than a hardened foreground service with explicit operator-visible status and notification.
- The local bridge has no upload path. It is intentionally read-only, so no backend persistence can happen from it alone.
- The VM upload client/outbox are not yet wired into scanner/session lifecycle, enrollment UI, retry scheduling, or receipt display.

Missing pieces:

- No scanner/session exporter maps real WiGLE records into the typed `BssVmObservationBatch` contract.
- No per-device token enrollment or scoped device credential storage.
- No VM client retry worker or sync receipt UI.
- No field session lifecycle (`start`, `heartbeat`, `end`) tied to RaID runs.
- No integration test proves device observations flow from Wardriver to BSS storage and then to Cybermap.

### BSS Static Web App and Functions

Real pieces found:

- Public/operator split is implemented in the Static Web App and Functions layer. The public root is intended to remain passcode-only.
- `/api/validate-passcode` issues an operator session only for the configured passcode digest.
- `/api/operator-shell`, `/api/wigle`, `/api/osint`, `/api/agent`, the paper/runtime endpoint, and `/api/operator-downloads/wardriver/*` all call `requireOperatorToken` in the Functions layer.
- `/downloads/*` is explicitly blocked by `app/staticwebapp.config.json`.
- `/api/wigle` supports three read modes:
  - `mode=current`: recent observations for AR, read from `WIGLE_LOCAL_DB_PATH` or `WIGLE_LOCAL_DB_URL`.
  - `mode=database`: local snapshot, same source without AR recency gating.
  - `mode=live`: server-side live bridge via `WIGLE_LIVE_BRIDGE_URL`.
- Direct public WiGLE API lookup is disabled because it requires coordinate-bearing URL queries.
- `scripts/wigle-local-bridge.py` can expose a WiGLE sqlite database as JSON for local development.

Stubbed or weak pieces:

- `app/operator/wigle.mjs` still carries `createSampleWigleDataset()` and sample APs. It is safe only if clearly labeled and never promoted as live.
- `buildArCandidateBoxes()` renders candidate UI boxes from normalized signal/candidate data; it is not real AR sensor fusion.
- `buildWigleMapState()` renders local viewport markers but does not read a durable Cybermap backend.
- Hosted SWA browsers cannot read a phone's `127.0.0.1` bridge or Android app-private sqlite database. Production must go through a server-reachable bridge/backend, not browser-local fantasy wiring.
- `docs/vm-api.md` and `docs/cybermap-geospatial-backend.md` describe the target Cybermap API/PostGIS design, but the live VM path is still echo-scaffold unless separately deployed.

Missing pieces:

- The repository now has a strict authenticated/idempotent `/api/v1/observations/batch` implementation and PostgreSQL store, but it is not deployed to the VM.
- No PostGIS-backed observation ledger is deployed or wired to production Godeye/Cybermap.
- No materializer writes `cybermap_cells` from Wardriver/RaID observations.
- No SWA Function proxy exposes Cybermap viewport/cell/entity reads from the VM.
- No upload telemetry exists for range/ID/service observations from the APK into the backend.

## Root cause summary

RaID currently has a local sensor/visualization slice, not an end-to-end field intelligence system.

The Android fork can observe local Wi-Fi/BLE/cellular cache and expose it on loopback. The BSS operator UI can render candidate overlays and local map markers. The BSS Functions API can read configured local/live sources. The first authenticated/idempotent ingest backend now exists in source, but there is still no deployed PostGIS ledger, scanner-to-batch exporter, enrolled upload worker, Cybermap materializer, or read path.

That is why AR/range/ID/service telemetry, upload, and Cybermap still feel missing or stubbed: the shipped path remains read-only local snapshot plus UI heuristics. The write contract is no longer hand-waving, but it is not yet a live field path.

## Bridge role decision

If the hosted VM is the API backend, the Wardriver loopback bridge is **not** the production backend and should not sit on the critical ingest path. Keep it as an optional device-local/lab surface only:

- **Keep:** on-device RaID status, local debugging, same-device WebView/Chrome diagnostics, offline field display, and a narrow read-only proof of current scanner/GNSS state. In production builds, keep it disabled by default or start it only during an explicit RaID/lab session with visible status.
- **Do not use for production:** durable observation upload, Cybermap persistence, Godeye backend reads, operator APK distribution, or any browser path that assumes a hosted SWA can reach a phone's `127.0.0.1`.
- **Production path:** Wardriver/RaID writes `ObservationBatchV1` directly to the hosted VM API over HTTPS/Tailscale with a per-device token, local encrypted outbox, idempotency key, redaction policy, and sync receipt.
- **Dashboard path:** Godeye/SWA reads through token-gated same-origin Functions proxies that call the VM API; it does not scrape the phone bridge.

This makes the bridge a **local sensor tap**, not a server of record. Black ICE posture improves because the public website stays silent, the APK stays token-gated, and the VM/PostGIS spine becomes the only durable Cybermap authority.

## Implementation checkpoint — 2026-07-11

Wardriver changes now in the Android fork:

- `BSS_LOCAL_BRIDGE_ENABLED` defaults `false` in the BSS build.
- `MainActivity.onStart()` calls `syncBssLocalBridgeSession()` instead of unconditionally starting loopback.
- `PREF_BSS_LOCAL_BRIDGE_SESSION_ENABLED` plus `setBssLocalBridgeSessionEnabled(...)` create an explicit local/lab session gate for bridge startup when a lab build enables the bridge feature flag.
- `BssVmObservationBatch` constructs privacy-bounded `bss.observation_batch.v1` JSON with stable caller-owned idempotency keys, semantic RFC3339 timestamps, and no server-derived fields.
- `BssVmUploadClient` posts typed batches with `X-Blue-Swallow-Ingest-Token`, `X-Blue-Swallow-Device-Id`, and `Idempotency-Key`; it rejects insecure remote `http://`, requires an explicit runtime lab gate for loopback HTTP, validates batch device/idempotency envelope binding before upload, and reports `Idempotent-Replayed`.
- `BssVmEncryptedOutbox` stages batches as AES-GCM encrypted pending/uploaded files and decrypts only for upload.
- `BssVmBatchCoordinator` owns the exact-body stage/retry transition; it refuses pending batches for a different enrolled device, validates durable `bss.sync_receipt.v1` count/status/time/id shape, leaves failed or malformed receipts pending, and moves only successful validated receipts to uploaded state.
- Targeted JVM verification passes in this aarch64 runtime using the restored QEMU/AAPT2 override.

Remaining Android wiring: real scanner/session exporter, token and outbox-key enrollment/Keystore lifecycle, WorkManager scheduling/backoff, receipt/status UI, and RaID status display.

## Repair plan

### Phase 0 — Preserve Black ICE gates before feature work

Goal: ensure every future RaID change keeps the public split locked.

Tasks:

1. Keep root `/` passcode-only: no public APK/operator links, no operator API names, no console markup.
2. Keep wrong-passcode branch on the public event-planning personal site with no operator token in body, cookies, or storage.
3. Keep correct-passcode branch server-side and token-issued only from Functions.
4. Keep `app/downloads` empty or absent; block `/downloads/*` with route tests.
5. Keep private APK metadata and binary under `api/_private/downloads` only.
6. Require `X-Blue-Swallow-Operator-Token` as the browser/download primary credential because SWA/platform auth can mutate `Authorization`.

Test gates:

- Root UI regression: title/input/lowercase `login` only.
- Wrong passcode regression: no `operatorSession`, no operator redirect, no operator markers.
- Correct passcode regression: operator token issued, operator shell available.
- Anonymous `/api/operator-downloads/wardriver/*` and `/api/wigle` return `403`.
- Static `/downloads/*` returns `404` or `403`.
- Secret scans reject passcodes, token signing keys, connection strings, and copied APK token material.

### Phase 1 — Freeze the device/backend contract

Goal: stop hand-waving between Android, SWA, and VM.

Add versioned schemas under a repo docs/spec path, then implement against them:

- `SignalEnvelopeV1`
  - source id, source class, modality, observed time, lat/lon/accuracy, confidence, confidence radius, local-only flag, provenance, payload.
- `RaIDDetectionV1`
  - track id, label, modality, confidence, confidence radius, optional screen box, optional bearing, optional service fingerprint, provenance.
- `ServiceTelemetryV1`
  - BLE service UUIDs, manufacturer id, observed name, RSSI, scan mode, passive-only marker, paired/local marker if applicable.
- `FieldSessionV1`
  - device id, app version, operator/session pseudonym, start/end/heartbeat times, location quality summary, upload policy.
- `ObservationBatchV1`
  - idempotency key, device id, session id, schema version, observations, client clock, redaction/retention class.
- `SyncReceiptV1`
  - accepted/rejected counts, duplicate count, server batch id, validation errors, server clock.

Test gates:

- JSON schema fixtures validate in Node and Android tests.
- Golden payloads from `BssLocalBridge` match `SignalEnvelopeV1`/`RaIDDetectionV1`.
- No schema allows raw camera frames by default.
- Coordinates are sent in POST bodies only, never query strings.

### Phase 2 — Make Wardriver RaID a real local sensor surface

Goal: a field operator can prove local observation, status, and safe degradation on-device.

Android tasks:

1. Move bridge lifecycle into an explicit foreground service or documented foreground-only controller with visible status.
2. Keep bridge bind to loopback only; fail closed if host is not `127.0.0.1`/`localhost`.
3. Add bridge endpoint tests for health/current/stats/flipper/signal-envelopes/ar-detections.
4. Add a RaID status panel that shows:
   - bridge status;
   - scanner status;
   - GNSS freshness/accuracy;
   - network cache count;
   - pending upload count;
   - last sync receipt;
   - data retention mode.
5. Replace hashed AR placement with honest modes:
   - `screen_hint`: signal-ranked, UI-only boxes when no bearing exists;
   - `bearing_hint`: compass/bearing-derived placement when available;
   - `anchor`: future ARCore anchor only when real anchor data exists.
6. Label range as confidence radius and RSSI heuristic unless multiple observations support better localization.
7. Add passive BLE service telemetry normalization for Flipper/local BLE candidates without actuation.

Test gates:

- Gradle unit tests for bridge payloads and route handling.
- Instrumented smoke for RaID screen, camera permission denial, GNSS unavailable, empty network cache, and active scan state.
- Bridge CORS/private-network headers allow intended operator origins but no remote bind.
- APK inspection confirms package/version and no legacy public action markers.

### Phase 3 — Build the Cybermap VM API P0

Goal: create the durable backend the current UI assumes exists.

**Checkpoint:** health/readiness, strict authenticated batch ingest, digest-only device credential schema, bounded transactional execution, non-blocking batch locks, sorted observation locks, active-session ownership checks, batch/observation idempotency, durable receipt writes/validation constraints, PostGIS geometry, and H3 7/9/11 are implemented and unit-tested in source. Managed/PostGIS execution, VM promotion, session/read endpoints, and live enrollment remain open.

Backend tasks:

1. Replace echo-only VM with `cybermap-api` on localhost behind Caddy/nginx/Tailscale or HTTPS.
2. Add PostgreSQL Flexible Server/PostGIS migration for the documented core tables:
   - `source_catalog`
   - `sensorium_sessions`
   - `observations`
   - `cyber_entities`
   - `entity_observations`
   - `cybermap_cells`
   - `sync_batches`
3. Implement P0 endpoints:
   - `GET /healthz`
   - `GET /readyz`
   - `POST /api/v1/sensorium/sessions`
   - `POST /api/v1/observations/batch`
   - `GET /api/v1/cybermap/viewport`
   - `GET /api/v1/cybermap/cells/{h3Cell}`
   - `GET /api/v1/entities/{id}`
4. Add scoped token classes:
   - device ingest token;
   - operator read token;
   - materializer worker token;
   - agent loop token.
5. Enforce idempotency with `sync_batches.idempotency_key` and per-observation dedupe keys.
6. Compute H3/geohash in app/worker code; do not require a PostgreSQL H3 extension for P0.

Test gates:

- API contract tests against ephemeral Postgres/PostGIS.
- Migration test: schema applies from empty database and reports ready.
- Ingest idempotency: duplicate batch does not duplicate observations.
- Auth tests: device token cannot read operator-only routes; browser token cannot ingest.
- Viewport tests: only authorized green/owned/local layers return; orange/grey/red require owned/local trigger or explicit authorized scope.

### Phase 4 — Add Wardriver upload and sync receipts

Goal: move from local-only proof to controlled backend persistence.

Android tasks:

1. Add an encrypted local upload queue for `ObservationBatchV1`.
2. Add operator-controlled upload policy:
   - disabled by default until enrolled;
   - Wi-Fi-only option;
   - manual sync button;
   - foreground status;
   - never hidden background exfiltration.
3. Add device enrollment with scoped device token. Token storage uses Android keystore where available.
4. Add batch retry with exponential backoff and idempotency keys.
5. Add sync receipt display in RaID status panel.
6. Add redaction controls for SSIDs/BSSIDs or payload fields if a session is marked summary-only.

Backend tasks:

1. Validate batch schema and source scope. **Implemented in source.**
2. Store observations append-only with durable replay receipts. **Implemented in source; deployment proof pending.**
3. Return per-row validation errors without dropping the whole batch when safe.
4. Emit source reliability/degradation events for repeated client failures.

Test gates:

- Android unit tests for queue persistence, retry, receipt parsing, and redaction.
- API tests for malformed batch, duplicate batch, unauthorized source class, and retention-class enforcement.
- End-to-end local test: fake Android batch -> VM API -> PostGIS rows -> receipt.

### Phase 5 — Wire Cybermap/Godeye to real backend data

Goal: operator Cybermap shows persisted RaID/owned observations with provenance.

SWA/API tasks:

1. Add token-gated SWA Function proxy routes for Cybermap reads:
   - `/api/cybermap/viewport`
   - `/api/cybermap/cells/{h3Cell}`
   - `/api/cybermap/entities/{id}`
2. Keep browser clients same-origin; Functions proxy to VM over private/Tailscale/HTTPS path.
3. Update Godeye to prefer backend viewport data. Keep local bridge/sample modes as explicit lab modes only.
4. Add UI badges for source class, freshness, retention class, and confidence radius.
5. Add stale/unavailable suppression: no fake live markers when backend or bridge is absent.

Materializer tasks:

1. Convert observations into `cybermap_cells` by layer, source class, freshness, and salience.
2. Maintain provenance links from map cell -> entity -> raw observation summary.
3. Degrade gracefully when PostGIS or materializer is behind.

Test gates:

- Node tests for viewport proxy auth and query validation.
- Browser/UI tests proving sample data is labeled and cannot masquerade as live.
- Integration test: ingested RaID observation appears in Cybermap viewport with matching provenance.
- Deployed smoke: wrong passcode cannot hit Cybermap APIs; operator token can read only allowed layers.

### Phase 6 — Deploy, verify, and lock the runbook

Goal: make the repaired path repeatable.

Verification runbook:

1. Android:
   - `./gradlew testDebugUnitTest assembleDebug`
   - APK inspection for app id, version, bridge class, and banned legacy/public markers.
2. BSS repo:
   - `node --test tests/*.test.mjs`
   - `git diff --check`
   - secret scan over added lines.
   - static route uniqueness check.
3. Backend:
   - migrations apply cleanly.
   - API contract tests pass against ephemeral PostGIS.
   - `/healthz` and `/readyz` report expected state.
4. Deploy:
   - GitHub Actions deploy success.
   - default SWA host smoke.
   - public domain smoke after DNS delegation works.
5. Security smoke:
   - `/` has only passcode screen.
   - wrong passcode opens event site and no operator token.
   - anonymous operator APIs return `403`.
   - static `/downloads/*` remains blocked.
   - operator-token APK metadata and download succeed.
   - Cybermap viewport requires operator token and returns no red/orange/grey layers without scope.

## Acceptance criteria

A repair is complete only when all of these are true:

- Wardriver RaID shows real scanner/GNSS/bridge/session status, not just a camera overlay.
- Device-local bridge emits contract-valid current observations, signal envelopes, service telemetry, and AR detection hints.
- Wardriver can upload controlled, passive-observation, idempotent observation batches after operator enrollment, with explicit retention/redaction classes.
- VM Cybermap API persists observations in PostGIS and returns viewport/cell/entity reads.
- Godeye renders persisted backend data with freshness/source/provenance markers.
- Sample data is available only as explicitly labeled lab/demo mode.
- Public site remains unchanged and silent: no APK links, no operator links, no operator API names.
- All tests and deployed smoke gates pass.

## Related docs

- [Cybermap Geospatial Backend Design](./cybermap-geospatial-backend.md)
- [VM API Specification](./vm-api.md)
- [Static Web App Functionality](./static-web-app-functionality.md)
- [Kismet Wardriving Sensor Spine Research](./kismet-wardriving-sensor-spine-research.md)
