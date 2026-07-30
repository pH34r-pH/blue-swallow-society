# Graph Report - cybermap-api  (2026-07-29)

## Corpus Check
- 74 files · ~46,216 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 694 nodes · 1355 edges · 35 communities (28 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e5147c0d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.mjs
- raid-model-contract.mjs
- postgres-store.mjs
- memory-store.mjs
- greenfeed-worker.mjs
- global-viewport-contract.mjs
- adapter-contract.mjs
- contracts.mjs
- run-morning-brief.mjs
- 0006_raid_model_lifecycle.sql
- deflock-viewport-contract.mjs
- global-viewport-postgres.test.mjs
- package.json
- greenfeed-materializer.test.mjs
- viewport.mjs
- raid-model-training-job-postgres.test.mjs
- BSS Cybermap API — authenticated observation ingest
- http.test.mjs
- postgres-store.test.mjs
- raid-model-http.test.mjs
- auth.mjs
- mtls-direct-api.test.mjs
- raid-training-dispatch.test.mjs
- global-viewport-http.test.mjs
- global-viewport-migration.test.mjs
- raid-model-migration.test.mjs
- 0001_cybermap_core.sql
- 0005_device_scoped_observation_identity.sql
- deflock-viewport-migration.test.mjs
- 0002_device_ingest_contract.sql
- 0004_godeye_global_cells_and_sources.sql
- mtls-installer-contract.test.mjs
- raid-model-mtls-installer.test.mjs

## God Nodes (most connected - your core abstractions)
1. `MemoryObservationStore` - 28 edges
2. `createRequestHandler()` - 26 edges
3. `PostgresObservationStore` - 24 edges
4. `invalid()` - 23 edges
5. `validateModelRelease()` - 20 edges
6. `validateGlobalViewportResponse()` - 18 edges
7. `validatePaperState()` - 18 edges
8. `main()` - 16 edges
9. `hashCanonicalJson()` - 16 edges
10. `validateCells()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `createRequestHandler()` --indirect_call--> `response()`  [INFERRED]
  src/server.mjs → test/greenfeed-worker.test.mjs
- `validateMorningBrief()` --indirect_call--> `artifact()`  [INFERRED]
  src/server.mjs → scripts/run-morning-brief.mjs
- `withServer()` --calls--> `createCybermapApiServer()`  [EXTRACTED]
  test/morning-brief.test.mjs → src/server.mjs
- `makeServer()` --calls--> `hashToken()`  [EXTRACTED]
  test/http.test.mjs → src/auth.mjs
- `createStore()` --calls--> `hashToken()`  [EXTRACTED]
  test/memory-store.test.mjs → src/auth.mjs

## Import Cycles
- None detected.

## Communities (35 total, 7 thin omitted)

### Community 0 - "server.mjs"
Cohesion: 0.06
Nodes (79): boundedDiagnosticCode(), buildEchoPayload(), canonicalJson(), clampFiniteNumber(), createRequestHandler(), finiteNumber(), forbiddenWithDiagnostic(), GLOBAL_VIEWPORT_LAYER_IDS (+71 more)

### Community 1 - "raid-model-contract.mjs"
Cohesion: 0.07
Nodes (41): compareVersions(), ContractError, FEEDBACK_REASONS, hasOnlyKeys(), invalidCatalogRequest(), invalidModelRelease(), isBase64(), isCatalogEligible() (+33 more)

### Community 2 - "postgres-store.mjs"
Cohesion: 0.05
Nodes (35): forbidden(), modelStore, pool, port, server, store, aggregateCaveats(), aggregateFreshness() (+27 more)

### Community 3 - "memory-store.mjs"
Cohesion: 0.06
Nodes (32): aggregateCaveats(), aggregateFreshness(), boundedGlobalLimit(), briefSummary(), cellUsesOnlyEligibleLayers(), centroidInBbox(), cloneBrief(), compareAggregateCells() (+24 more)

### Community 4 - "greenfeed-worker.mjs"
Cohesion: 0.07
Nodes (34): closeBoundary(), DEFLOCK_H3_RESOLUTIONS, materializeDeflockReports(), normalizePoint(), validTimestamp(), main(), runDeflockSourceProcess(), boundedCount() (+26 more)

### Community 5 - "global-viewport-contract.mjs"
Cohesion: 0.11
Nodes (45): BBOX_FIELDS, CELL_FIELDS, CENTROID_FIELDS, deepFreeze(), FRESHNESS_FIELDS, GlobalViewportContractError, H3_RESOLUTIONS, invalid() (+37 more)

### Community 6 - "adapter-contract.mjs"
Cohesion: 0.16
Nodes (24): createFixtureOnlyAdapter(), createSnapshot(), freezeSource(), invalidPayload(), normalizeClassification(), requireArray(), requireFiniteNumber(), requireLocation() (+16 more)

### Community 7 - "contracts.mjs"
Cohesion: 0.13
Nodes (26): assertJsonValue(), BATCH_FIELDS, ContractError, deepFreeze(), hashCanonicalJson(), hashPersistedObservation(), isPlainObject(), LOCATION_FIELDS (+18 more)

### Community 8 - "run-morning-brief.mjs"
Cohesion: 0.20
Nodes (20): artifact(), atomicJson(), buildBrief(), dispatchDiscord(), escapeHtml(), escapeXml(), execFileAsync, formatMoney() (+12 more)

### Community 9 - "0006_raid_model_lifecycle.sql"
Cohesion: 0.10
Nodes (20): raid_dataset_snapshot_examples_append_only_delete, raid_dataset_snapshot_examples_append_only_update, raid_dataset_snapshots_append_only_delete, raid_dataset_snapshots_append_only_update, raid_model_artifacts_append_only_delete, raid_model_artifacts_append_only_update, raid_model_feedback_append_only_delete, raid_model_feedback_append_only_update (+12 more)

### Community 10 - "deflock-viewport-contract.mjs"
Cohesion: 0.18
Nodes (18): BBOX_FIELDS, buildDeflockViewportResponse(), CELL_FIELDS, CENTROID_FIELDS, DeflockViewportError, finite(), LAYER_IDS, rejectUnknown() (+10 more)

### Community 11 - "global-viewport-postgres.test.mjs"
Cohesion: 0.12
Nodes (12): ALL_SOURCE_CLASSES, APPROVED_GLOBAL_SOURCE_CLASSES, expectedAggregateCell(), GLOBAL_VIEWPORT_REQUEST, isGloballyEligible(), queryConstrainedToApprovedSources(), queryGlobalViewport(), RAW_OBSERVATION_FIELDS (+4 more)

### Community 12 - "package.json"
Cohesion: 0.12
Nodes (15): h3-js, dependencies, h3-js, pg, engines, node, name, private (+7 more)

### Community 13 - "greenfeed-materializer.test.mjs"
Cohesion: 0.19
Nodes (10): createCell(), externalEventKey(), H3_RESOLUTIONS, materializeGreenfeedSnapshots(), snapshotIdentity(), toAggregateCell(), FIXTURE_URL, FORBIDDEN_RAW_FIELDS (+2 more)

### Community 14 - "viewport.mjs"
Cohesion: 0.26
Nodes (14): clampFiniteNumber(), finiteOrNull(), isPlainObject(), labelForKind(), parseFiniteNumber(), parseTimestampMs(), parseViewportBody(), parseViewportValues() (+6 more)

### Community 15 - "raid-model-training-job-postgres.test.mjs"
Cohesion: 0.15
Nodes (6): check(), examples, FIXED_NOW, HEX, ScriptedClient, TrainingPool

### Community 16 - "BSS Cybermap API — authenticated observation ingest"
Cohesion: 0.15
Nodes (11): Apply locally, Cybermap database migrations, Migration contract, BSS Cybermap API — authenticated observation ingest, Device enrollment record, Implemented, Not yet implemented or promoted, Request contract (+3 more)

### Community 17 - "http.test.mjs"
Cohesion: 0.18
Nodes (8): canonicalPaperState(), legacyPaperStateV2(), PAPER_BOOK_IDS, PAPER_LINES, PAPER_NOW_MS, PAPER_STRATEGIES, paperProfile(), SlowApplyStore

### Community 18 - "postgres-store.test.mjs"
Cohesion: 0.17
Nodes (4): check(), credentialRow, FakePool, ScriptedClient

### Community 19 - "raid-model-http.test.mjs"
Cohesion: 0.22
Nodes (7): createCybermapApiServer(), request, withServer(), makeServer(), makeServer(), CLIENT_FINGERPRINT, makeServer()

### Community 20 - "auth.mjs"
Cohesion: 0.39
Nodes (6): hashToken(), tokenDigestMatches(), ingestHeaders(), validBatch(), validObservation(), createStore()

### Community 22 - "raid-training-dispatch.test.mjs"
Cohesion: 0.36
Nodes (4): dispatchEligibleTraining(), normalizeCommand(), recordEvent(), policy

### Community 23 - "global-viewport-http.test.mjs"
Cohesion: 0.29
Nodes (3): GlobalViewportStore, VALID_REQUEST, VALID_RESPONSE

### Community 25 - "raid-model-migration.test.mjs"
Cohesion: 0.40
Nodes (4): installer, migration, modelStore, root

### Community 26 - "0001_cybermap_core.sql"
Cohesion: 0.50
Nodes (3): observations_append_only_delete, observations_append_only_update, schema_migrations

### Community 27 - "0005_device_scoped_observation_identity.sql"
Cohesion: 0.50
Nodes (3): observation_identity_scopes_append_only_delete, observation_identity_scopes_append_only_update, observations

## Knowledge Gaps
- **168 isolated node(s):** `observations_append_only_update`, `observations_append_only_delete`, `schema_migrations`, `sync_batches_finalized_update_guard`, `sync_batches_delete_guard` (+163 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PostgresObservationStore` connect `postgres-store.mjs` to `postgres-store.test.mjs`, `global-viewport-postgres.test.mjs`, `greenfeed-worker.mjs`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `validateMorningBrief()` connect `server.mjs` to `run-morning-brief.mjs`, `raid-model-contract.mjs`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `artifact()` connect `run-morning-brief.mjs` to `server.mjs`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **What connects `observations_append_only_update`, `observations_append_only_delete`, `schema_migrations` to the rest of the system?**
  _168 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06080246913580247 - nodes in this community are weakly interconnected._
- **Should `raid-model-contract.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.0675990675990676 - nodes in this community are weakly interconnected._
- **Should `postgres-store.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.054563492063492064 - nodes in this community are weakly interconnected._