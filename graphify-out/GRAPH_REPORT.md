# Graph Report - blue-swallow-society  (2026-07-28)

## Corpus Check
- 244 files · ~243,009 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4942 nodes · 11191 edges · 212 communities (196 shown, 16 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 589 edges (avg confidence: 0.64)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6124e64f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- maplibre-gl.mjs
- maplibre-gl-shared.mjs
- constructor
- index.js
- mosaic-murmurs-paper-memory-loop.py
- get
- concat
- fresh_snapshot
- push
- get
- chained-daemon.mjs
- main.js
- _checkLoaded
- maplibre-gl-worker.mjs
- loadTile
- flyTo
- tzeentch-dashboard.mjs
- wigle.mjs
- add
- writeMessage
- l
- server.mjs
- index.js
- tzeentch.mjs
- Ea
- mosaic-murmurs-morning-brief-collect.py
- xt
- id
- mosaic_murmurs_paper_engine.py
- Implementation Plan: Godeye Policy-Bound Operator Map
- update
- constructor
- VM API Specification
- readVarint
- parameters
- fa
- uf
- clone
- main.js
- hasData
- Azure Resources Specification
- Static Web App Styling
- vision.mjs
- Mosaic & Murmurs Operating Doctrine
- security-review.test.mjs
- A
- wardriver-release-store.js
- dc
- Mosaic & Murmurs Source Expansion Research
- Tasks: [FEATURE NAME]
- getSource
- SKILL.md
- Mosaic & Murmurs Paper Memory Loop
- analyze.md
- zy
- Mosaic & Murmurs Dream Design: Cyber Augmentation Proposal
- Tasks: Static Web Application Functionality
- Tasks: Static Web Application Styling
- Tasks: VM Echo API
- Tasks: Azure Infrastructure Deployment
- http.test.mjs
- j
- memory-store.mjs
- contracts.mjs
- operator-auth.js
- godeye-map.mjs
- osint-applications.mjs
- Implementation Plan: Static Web Application Functionality
- Implementation Plan: Static Web Application Styling
- Implementation Plan: Azure Infrastructure Deployment
- Mosaic & Murmurs Dream Consolidation Proposal
- Proposal: Mosaic & Murmurs Morning Brief
- Proposal: Mosaic & Murmurs S0 Sensorium
- Implementation Plan: VM Echo API
- postgres-store.mjs
- $
- wigle-local-bridge.py
- Anti-Surveillance Style Research
- Proposal: Mosaic & Murmurs Breach Mirror Self-Pentest
- Blue Swallow Society Constitution
- Blue Swallow Society Constitution
- index.js
- U
- clone
- index.js
- gi
- Wardriver RaID + BSS Backend Repair Plan
- common.sh
- Implementation Plan: Wardriver Immutable Release Delivery
- onAdd
- toString
- Strategy taxonomy
- Public Official and Political Signal Radar
- index.js
- common.ps1
- ui-shell.test.mjs
- Kismet Wardriving Sensor Spine Research
- package.json
- createRequestHandler
- cameraForBoxAndBearing
- Cybermap Geospatial Backend Design
- Microsoft Layoff and Hiring Risk Radar
- godeye-map-shell.test.mjs
- mosaic_murmurs_market_data.py
- Feature Specification: [FEATURE NAME]
- cybermap-schema.test.mjs
- postgres-store.test.mjs
- index.js
- cp
- Mosaic & Murmurs Morning Brief Implementation
- User Scenarios & Testing *(mandatory)*
- co
- placeLayerBucketPart
- Core Principles
- PaperMarketDataTests
- tzeentch-browser.test.mjs
- tzeentch-route.test.mjs
- package.json
- index.js
- operator-downloads-api.test.mjs
- index.js
- index.js
- applyVisionDataset
- _executeRelevantHandler
- Material gaps and risks
- Mosaic & Murmurs Autonomous Paper Engine
- Static Web App Functionality
- create-new-feature.sh
- Implementation Plan: [FEATURE]
- cybermap-viewport-api.test.mjs
- wigle-api.test.mjs
- activateTabByIndex
- SKILL.md
- SKILL.md
- SKILL.md
- SKILL.md
- Azure Credentials Setup (OIDC, no secrets in GitHub)
- Product Surfaces
- Nacre-Moiré operator design system
- create-new-feature.ps1
- checklist.md
- plan.md
- specify.md
- tasks.md
- cybermap-tiles-api.test.mjs
- load_morning_module
- main.mjs
- index.js
- url
- Safe options
- Blue Swallow Society System Implementation Delta
- Personal Site Starter on Azure Static Web Apps + VM Echo Backend
- passcode-api.test.mjs
- agent.js
- deriveGodeyeSessionAnalysis
- Architecture decisions
- Tzeentch Paper API Status
- local-server.js
- Tasks: Wardriver Immutable Release Delivery
- paper-state-proxy.test.mjs
- .test_query_current_state_returns_recent_unique_observations_ordered_by_signal
- SKILL.md
- SKILL.md
- SKILL.md
- Recommended delivery sequence
- VM echo wiring
- install-cybermap-api.sh
- Deployment sequence
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- clarify.md
- constitution.md
- taskstoissues.md
- Test Design: Wardriver Immutable Release Delivery
- invokeRoute
- runtime-versions.test.mjs
- wardriver-release-delivery-config.test.mjs
- getPoint
- SKILL.md
- Wardriver review
- Audit boundaries and provenance
- Mosaic & Murmurs proposal delta
- Verification results
- Test Design: Adversarial Review Repairs
- implement.md
- 0001_cybermap_core.sql
- Microsoft Entra External ID setup checklist
- CustomDomainScriptTests
- 0002_device_ingest_contract.sql
- MAPLIBRE-VENDOR.md
- _queryCellCircle
- print-next-steps.sh
- wireup-backend-url.sh
- check-prerequisites.sh
- setup-plan.sh
- setup-tasks.sh
- plan.md
- tasks.md
- operator-shell-download.test.mjs
- toString
- backend-boundary.test.mjs

## God Nodes (most connected - your core abstractions)
1. `constructor()` - 138 edges
2. `push()` - 135 edges
3. `get()` - 58 edges
4. `get()` - 56 edges
5. `l()` - 52 edges
6. `constructor()` - 49 edges
7. `u()` - 44 edges
8. `evaluate()` - 44 edges
9. `flyTo()` - 39 edges
10. `ud()` - 37 edges

## Surprising Connections (you probably didn't know these)
- `authorizationHeader()` --calls--> `createOperatorToken()`  [EXTRACTED]
  tests/tzeentch-route.test.mjs → api/_lib/operator-auth.js
- `makeOperatorHeaders()` --calls--> `createOperatorToken()`  [EXTRACTED]
  tests/wigle-api.test.mjs → api/_lib/operator-auth.js
- `toHeader()` --indirect_call--> `key()`  [INFERRED]
  api/_lib/operator-auth.js → app/operator/vendor/maplibre-gl-shared.mjs
- `toHeader()` --indirect_call--> `key()`  [INFERRED]
  api/_lib/passcode-rate-limit.js → app/operator/vendor/maplibre-gl-shared.mjs
- `handler()` --indirect_call--> `error()`  [INFERRED]
  api/operator-downloads/index.js → app/operator/vendor/maplibre-gl-shared.mjs

## Import Cycles
- None detected.

## Communities (212 total, 16 thin omitted)

### Community 0 - "maplibre-gl.mjs"
Cohesion: 0.01
Nodes (101): addBucket(), addDash(), addRegularDash(), addRoundDash(), af, bo, broadcast(), calculateFogBlendOpacity() (+93 more)

### Community 1 - "maplibre-gl-shared.mjs"
Cohesion: 0.01
Nodes (141): renderSparklineGraphic(), ab(), addImageSection(), addTextSection(), ag(), angleWith(), angleWithSep(), ap (+133 more)

### Community 2 - "constructor"
Cohesion: 0.03
Nodes (97): _addDefaultHandlers(), addTo(), _applyChanges(), _blockedByActive(), bp, _cancelRenderFrame(), Cc(), ci() (+89 more)

### Community 3 - "index.js"
Cohesion: 0.06
Nodes (88): { assertPublicTarget, isLikelyIpAddress, isPrivateIp, isUnsafeHostName }, classifyByMode(), classifyTarget(), looksLikeDomain(), looksLikeEmail(), looksLikeIp(), looksLikeUrl(), net (+80 more)

### Community 4 - "mosaic-murmurs-paper-memory-loop.py"
Cohesion: 0.06
Nodes (99): Request, RuntimeError, collect_market_snapshot(), fetch_json(), held_prediction_market_ids(), iso_z(), normalize_iso(), parse_cboe_quote() (+91 more)

### Community 5 - "get"
Cohesion: 0.26
Nodes (21): ad(), bd(), bind(), cd(), clearStencil(), draw(), ed(), getMeshFromTileID() (+13 more)

### Community 6 - "concat"
Cohesion: 0.04
Nodes (79): add(), addIndicesForPlacedSymbol(), as(), ax(), Bx(), clear(), cs(), db() (+71 more)

### Community 7 - "fresh_snapshot"
Cohesion: 0.06
Nodes (11): ExecutionCostAccountingTests, AutonomousPaperEngineTests, fresh_snapshot(), instrument(), iso_z(), load_engine(), datetime, MosaicMurmursPaperMemoryLoopTest (+3 more)

### Community 8 - "push"
Cohesion: 0.03
Nodes (107): ac(), addTileFeatures(), ah(), Am(), angleTo(), appendLeaves(), at(), bind() (+99 more)

### Community 9 - "get"
Cohesion: 0.10
Nodes (25): kf(), _addCollisionDebugVertex(), addCollisionDebugVertices(), addDebugCollisionBoxes(), cp(), createNewSegment(), destroy(), destroyDebugData() (+17 more)

### Community 10 - "chained-daemon.mjs"
Cohesion: 0.06
Nodes (76): addBucket(), AGENT_POLICY_RISK_CAPABILITIES, bucketPriority(), buildChainedDaemonLoopState(), buildChainedDaemonSelfPentestRun(), buildFeverLureQuarantine(), buildLoopBudget(), buildNegativeSpaceIam() (+68 more)

### Community 11 - "main.js"
Cohesion: 0.12
Nodes (38): activateTab(), activateTabByIndex(), bindGodeyeControls(), bindLoginFlow(), bindOperatorDownloads(), bindTabSystem(), compactFingerprint(), emptyWigleDataset() (+30 more)

### Community 12 - "_checkLoaded"
Cohesion: 0.04
Nodes (81): addControl(), addImage(), addLayer(), addSource(), addSprite(), _applyGlobalStateChanges(), ba(), _checkLoaded() (+73 more)

### Community 13 - "maplibre-gl-worker.mjs"
Cohesion: 0.06
Nodes (52): an(), ee(), H(), hn(), ji(), nl, rn(), te() (+44 more)

### Community 14 - "loadTile"
Cohesion: 0.06
Nodes (44): _afterImageUpdated(), _afterTileLoadWorkerResponse(), clearTextures(), createVertexArray(), destroy(), _diffStyle(), Dr, enableAttributes() (+36 more)

### Community 15 - "flyTo"
Cohesion: 0.10
Nodes (38): _afterEase(), applyUpdatedTransform(), _calcMatrices(), _clearMatrixCaches(), clearNearFarZOverride(), _computeClippingPlane(), Cr(), easeTo() (+30 more)

### Community 16 - "tzeentch-dashboard.mjs"
Cohesion: 0.10
Nodes (54): buildActionableIntelModel(), buildCryptoModel(), buildCryptoProposal(), buildMosaicModel(), buildMurmursModel(), buildPaperBookProposal(), buildPaperBooksModel(), buildPolymarketModel() (+46 more)

### Community 17 - "wigle.mjs"
Cohesion: 0.09
Nodes (51): buildTileGrid(), clamp(), latLonToTileXY(), metersPerPixel(), tileUrl(), wrapTileIndex(), annotateCurrentRecord(), bearingBetween() (+43 more)

### Community 18 - "add"
Cohesion: 0.06
Nodes (50): _calculateTransform(), contextmenu(), convert(), dblclick(), dragEnd(), dragMove(), dragStart(), _f() (+42 more)

### Community 19 - "writeMessage"
Cohesion: 0.05
Nodes (55): bg(), calculateScaledKey(), determineAverageLineWidth(), determineLineBreaks(), Dv(), ev(), getSection(), hasZeroWidthSpaces() (+47 more)

### Community 20 - "l"
Cohesion: 0.15
Nodes (43): cameraForBoxAndBearing(), contains(), getLesserNonNegativeNonNull(), getNorthEast(), getSouthWest(), getViewportMatrix(), ks(), oo() (+35 more)

### Community 21 - "server.mjs"
Cohesion: 0.08
Nodes (41): buildEchoPayload(), clampFiniteNumber(), createRequestHandler(), handleCybermapTile(), handleCybermapViewportPost(), handleObservationBatch(), handleOperatorSignalSnapshotPost(), handlePaperStateRead() (+33 more)

### Community 22 - "index.js"
Cohesion: 0.10
Nodes (49): buildCanonicalPaperBooks(), buildCrypto(), buildDashboardPayload(), buildMosaic(), buildMurmurs(), buildPolymarket(), canonicalLoopMetadata(), cleanHttpUrl() (+41 more)

### Community 23 - "tzeentch.mjs"
Cohesion: 0.11
Nodes (35): classifyEvidenceTags(), createEmptyState(), createEmptyTzeentchPayload(), formatPaperQuantity(), formatPaperUsd(), formatTimestamp(), getTzeentchMarketModel(), persistRecentQueries() (+27 more)

### Community 24 - "Ea"
Cohesion: 0.08
Nodes (44): _calculateNearFarZIfNeeded(), aa(), ao(), ba(), ca(), canonicalID(), da(), distance() (+36 more)

### Community 25 - "mosaic-murmurs-morning-brief-collect.py"
Cohesion: 0.16
Nodes (43): Element, Exception, age_hours(), build_manifest(), child_link(), child_text(), clean_text(), collect_coingecko_markets() (+35 more)

### Community 26 - "xt"
Cohesion: 0.09
Nodes (34): cameraPosition(), Cs(), ec(), fromInvProjectionMatrix(), getCameraFrustum(), isPointOnMapSurface(), placeLayerBucketPart(), rayPlanetIntersection() (+26 more)

### Community 27 - "id"
Cohesion: 0.10
Nodes (21): id(), _convertFromCellCoord(), _convertToCellCoord(), dc(), expandBy(), extend(), _forEachCell(), fromPoints() (+13 more)

### Community 28 - "mosaic_murmurs_paper_engine.py"
Cohesion: 0.12
Nodes (60): _age_hours(), _crash_event(), _decision(), default_ledger(), _eligible_for_strategy(), estimate_round_trip_cost_bps(), _execute_buy(), _execute_sell() (+52 more)

### Community 29 - "Implementation Plan: Godeye Policy-Bound Operator Map"
Cohesion: 0.05
Nodes (39): Architecture and interfaces, Constitution Check, CSP and assets, Failure behavior, Implementation Plan: Godeye Policy-Bound Operator Map, Implementation sequence, Layer registry, Map and workbench (+31 more)

### Community 30 - "update"
Cohesion: 0.04
Nodes (74): _addTerrainIdealTiles(), _addTile(), _areDescendentsComplete(), _cleanUpRasterTiles(), _cleanUpVectorTiles(), _clearSource(), clearSymbolFadeHold(), _clearTileReloadTimer() (+66 more)

### Community 31 - "constructor"
Cohesion: 0.05
Nodes (42): addImages(), backfillBorder(), completeTask(), constructor(), dd(), fd(), fire(), _getByteView() (+34 more)

### Community 32 - "VM API Specification"
Cohesion: 0.04
Nodes (65): fov(), addLineDashDependencies(), Bi(), bo(), _calculate(), calculateGlyphDependencies(), checkSubtype(), co() (+57 more)

### Community 33 - "readVarint"
Cohesion: 0.07
Nodes (39): bbox(), Dm(), Em(), jg(), jv(), kg(), kv(), loadGeometry() (+31 more)

### Community 34 - "parameters"
Cohesion: 0.05
Nodes (37): metadata, value, value, value, contentVersion, value, value, value (+29 more)

### Community 35 - "fa"
Cohesion: 0.11
Nodes (27): aa(), adjustAntiMeridian(), allowWorldCopies(), cameraForBounds(), getCameraPoint(), getCameraQueryGeometry(), getCoveringTilesDetailsProvider(), getEast() (+19 more)

### Community 36 - "uf"
Cohesion: 0.09
Nodes (36): gestureBeginsVertically(), bf(), bp(), dp(), ep(), ff(), fp(), Gf() (+28 more)

### Community 37 - "clone"
Cohesion: 0.09
Nodes (32): addCurrentVertex(), addFeature(), addFeatures(), addHalfVertex(), addLine(), addSymbols(), addToLineVertexArray(), addToSortKeyRanges() (+24 more)

### Community 38 - "main.js"
Cohesion: 0.19
Nodes (29): appendMeta(), createSupplyListItem(), getCurrentClaimName(), handleLogin(), handleSupplyClaim(), init(), initPublicEvents(), loadSupplyClaims() (+21 more)

### Community 39 - "hasData"
Cohesion: 0.14
Nodes (35): disableArFeed(), enableArFeed(), ensureCameraStream(), ensureMotionTracking(), formatAngle(), formatAxis(), getArVideoScale(), getOrientationMode() (+27 more)

### Community 40 - "Azure Resources Specification"
Cohesion: 0.25
Nodes (7): Azure Resources Specification, Composition, GitHub Actions deployment declaration, Network and ingress, Parameters and outputs, Release storage, Runtime proof boundary

### Community 41 - "Static Web App Styling"
Cohesion: 0.06
Nodes (32): Accent Colors, Accessibility Considerations, Base Colors, Breakpoints, Buttons, Chat Interface, Color Palette, Component Styles (+24 more)

### Community 42 - "vision.mjs"
Cohesion: 0.16
Nodes (29): buildArDetectionBoxes(), buildDetectionDetail(), clamp(), cleanString(), confidenceLabel(), createSampleVisionDataset(), deriveDetectionId(), firstDefined() (+21 more)

### Community 43 - "Mosaic & Murmurs Operating Doctrine"
Cohesion: 0.05
Nodes (39): Acceptance Criteria, Actionable Intel Lane, Allocation Policy, Brain Loop Topology, Chained Daemon Self-Pentest Lane, Combined System, Daily Dream Cycle, Dual-Mind Model (+31 more)

### Community 44 - "security-review.test.mjs"
Cohesion: 0.06
Nodes (28): agentApi, agentJs, chainedDaemonJs, cybermapBatchApi, cybermapInstallScript, cybermapViewportApi, deployWorkflow, indexHtml (+20 more)

### Community 45 - "A"
Cohesion: 0.13
Nodes (35): ac(), apply(), clone(), constrainInternal(), Ga(), gs(), handleEaseTo(), handleFlyTo() (+27 more)

### Community 46 - "wardriver-release-store.js"
Cohesion: 0.13
Nodes (23): {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
}, buildRunId(), commit(), createReleaseStore(), isoTimestamp(), notes(), parseConnectionString(), positiveInt() (+15 more)

### Community 47 - "dc"
Cohesion: 0.09
Nodes (23): af(), constantOr(), containsMaxSafeIntegerValues(), copy(), deserialize(), freeBufferAfterUpload(), getFeatures(), getTransition() (+15 more)

### Community 48 - "Mosaic & Murmurs Source Expansion Research"
Cohesion: 0.07
Nodes (26): Additional high-value public sources, AI / software / security, AI / tech / security, Bridge / market signals, Current implemented coverage, Decision, Implementation next steps, Inquiry and transport policy (+18 more)

### Community 49 - "Tasks: [FEATURE NAME]"
Cohesion: 0.07
Nodes (26): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation Strategy, Incremental Delivery, MVP First (User Story 1 Only) (+18 more)

### Community 50 - "getSource"
Cohesion: 0.12
Nodes (19): ai(), _createDelegatedListener(), _flattenAndSortRenderedFeatures(), getData(), ki(), off(), offTemp(), Oi() (+11 more)

### Community 51 - "SKILL.md"
Cohesion: 0.08
Nodes (25): 1. Initialize Analysis Context, 2. Load Artifacts (Progressive Disclosure), 3. Build Semantic Models, 4. Detection Passes (Token-Efficient Analysis), 5. Severity Assignment, 6. Produce Compact Analysis Report, 7. Provide Next Actions, 8. Offer Remediation (+17 more)

### Community 52 - "Mosaic & Murmurs Paper Memory Loop"
Cohesion: 0.08
Nodes (26): Acceptance criteria, Agent ownership, Cadences, Current implementation anchor, Data model sketch, Executive summary, Governance, Implementation plan (+18 more)

### Community 53 - "analyze.md"
Cohesion: 0.08
Nodes (25): 1. Initialize Analysis Context, 2. Load Artifacts (Progressive Disclosure), 3. Build Semantic Models, 4. Detection Passes (Token-Efficient Analysis), 5. Severity Assignment, 6. Produce Compact Analysis Report, 7. Provide Next Actions, 8. Offer Remediation (+17 more)

### Community 54 - "zy"
Cohesion: 0.20
Nodes (23): Bu(), $c(), _d(), Fu(), getBucket(), getBucketParts(), getCircleRadiusCorrection(), getTerrainData() (+15 more)

### Community 56 - "Mosaic & Murmurs Dream Design: Cyber Augmentation Proposal"
Cohesion: 0.08
Nodes (25): Acceptance criteria, Binocular cameras, Current observed facts, Cyber presence expansion, Design doctrine, Directional antennas, Executive summary, GPIO and control model (+17 more)

### Community 57 - "Tasks: Static Web Application Functionality"
Cohesion: 0.08
Nodes (24): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation for User Story 4, Notes, Parallel Opportunities (+16 more)

### Community 58 - "Tasks: Static Web Application Styling"
Cohesion: 0.08
Nodes (24): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation for User Story 4, Notes, Parallel Opportunities (+16 more)

### Community 59 - "Tasks: VM Echo API"
Cohesion: 0.08
Nodes (24): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation for User Story 4, Notes, Parallel Opportunities (+16 more)

### Community 60 - "Tasks: Azure Infrastructure Deployment"
Cohesion: 0.08
Nodes (24): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation for User Story 4, Notes, Parallel Opportunities (+16 more)

### Community 61 - "http.test.mjs"
Cohesion: 0.12
Nodes (16): ContractError, createCybermapApiServer(), NOW, ingestHeaders(), validBatch(), validObservation(), withServer(), canonicalPaperState() (+8 more)

### Community 62 - "j"
Cohesion: 0.08
Nodes (43): allowVariableZoom(), calculateCameraOptionsFromTo(), calculateCenterFromCameraLngLatAlt(), _distanceToCenterFromAltElevationPitch(), ea(), _elevateCameraIfInsideTerrain(), extend(), fa() (+35 more)

### Community 63 - "memory-store.mjs"
Cohesion: 0.14
Nodes (10): forbidden(), hashToken(), IngestError, tokenDigestMatches(), distanceMeters(), finiteOrNull(), MemoryObservationStore, stringOrNull() (+2 more)

### Community 64 - "contracts.mjs"
Cohesion: 0.16
Nodes (22): assertJsonValue(), BATCH_FIELDS, deepFreeze(), isPlainObject(), LOCATION_FIELDS, OBSERVATION_FIELDS, OBSERVATION_KINDS, REDACTION_CLASSES (+14 more)

### Community 65 - "operator-auth.js"
Cohesion: 0.10
Nodes (27): base64UrlDecode(), base64UrlEncode(), buildClearOperatorSessionCookie(), createOperatorToken(), crypto, extractCookieValue(), extractOperatorTokens(), getConfiguredDigest() (+19 more)

### Community 66 - "godeye-map.mjs"
Cohesion: 0.12
Nodes (17): defaultGodeyeLayerState(), getGodeyeLayerSpec(), GODEYE_LAYER_SPECS, GREEN_SOURCE_CLASSES, LAYER_IDS, layerIsActiveAtZoom(), parseGodeyeLayerSearch(), serializeGodeyeLayerSearch() (+9 more)

### Community 67 - "osint-applications.mjs"
Cohesion: 0.19
Nodes (21): buildCryptoLane(), buildPolymarketLane(), buildTzeentchApplications(), clamp(), cleanString(), CURRENCY_TWO_DECIMALS, CURRENCY_ZERO_DECIMALS, DEFAULT_CRYPTO_SYMBOLS (+13 more)

### Community 68 - "Implementation Plan: Static Web Application Functionality"
Cohesion: 0.09
Nodes (21): Complexity Tracking, Constitution Check, Documentation (this feature), Implementation Plan: Static Web Application Functionality, Project Structure, Source Code (repository root), Summary, Technical Context (+13 more)

### Community 69 - "Implementation Plan: Static Web Application Styling"
Cohesion: 0.09
Nodes (21): Complexity Tracking, Constitution Check, Documentation (this feature), Implementation Plan: Static Web Application Styling, Project Structure, Source Code (repository root), Summary, Technical Context (+13 more)

### Community 70 - "Implementation Plan: Azure Infrastructure Deployment"
Cohesion: 0.09
Nodes (21): Complexity Tracking, Constitution Check, Documentation (this feature), Implementation Plan: Azure Infrastructure Deployment, Project Structure, Source Code (repository root), Summary, Technical Context (+13 more)

### Community 71 - "Mosaic & Murmurs Dream Consolidation Proposal"
Cohesion: 0.09
Nodes (22): Acceptance criteria, Bridge lane, Core model, Daily design proposal lanes, Data model sketch, Dream phases, Executive summary, Free association protocol (+14 more)

### Community 72 - "Proposal: Mosaic & Murmurs Morning Brief"
Cohesion: 0.09
Nodes (22): Acceptance criteria, Bridge: paper treasury, Data model sketch, Executive summary, Goals, Governance, Implementation plan, Input lanes (+14 more)

### Community 73 - "Proposal: Mosaic & Murmurs S0 Sensorium"
Cohesion: 0.09
Nodes (22): 1. Default state: dream suspension, 2. RaID sight: episodic physical presence, 3. Greenfeed jack-in: public/authorized wakefulness, 4. Direct observations must feed predictions, Acceptance Criteria, Claim-Validation Loop, Data Model, Excluded from S0 (+14 more)

### Community 74 - "Implementation Plan: VM Echo API"
Cohesion: 0.09
Nodes (20): Complexity Tracking, Constitution Check, Documentation (this feature), Implementation Plan: VM Echo API, Project Structure, Source Code (repository root), Summary, Technical Context (+12 more)

### Community 75 - "postgres-store.mjs"
Cohesion: 0.14
Nodes (16): hashCanonicalJson(), hashPersistedObservation(), finiteOrNull(), GREEN_TILE_SOURCE_CLASSES, insertObservations(), normalizeDatabaseError(), parseDurableReceipt(), parseJsonObject() (+8 more)

### Community 76 - "$"
Cohesion: 0.18
Nodes (25): abortIfPresent(), abortInFlight(), bindTzeentchSurfaceTabs(), initTzeentchDashboard(), loadOverview(), loadTzeentchMarketFeed(), refreshTzeentchDashboard(), renderApplications() (+17 more)

### Community 77 - "wigle-local-bridge.py"
Cohesion: 0.20
Nodes (17): BaseHTTPRequestHandler, Connection, Row, _connect_readonly(), _distance_meters(), _iso_from_ms(), main(), make_handler() (+9 more)

### Community 78 - "Anti-Surveillance Style Research"
Cohesion: 0.10
Nodes (20): 1. OCR-resistant typography, 2. Face contour disruption, 3. Adversarial patches / garments, 4. Reflective / IR accessories, 5. Person re-identification friction, 6. Non-visual tracking hygiene, Anti-Surveillance Style Research, ARG/paper crypto artifacts (+12 more)

### Community 79 - "Proposal: Mosaic & Murmurs Breach Mirror Self-Pentest"
Cohesion: 0.10
Nodes (20): 1. Scope warrant, 2. Asset snapshot, 3. Chained-daemon adversarial hypotheses, 4. Deterministic validators, 5. Optional lab canary probes, Acceptance criteria, Current P0 implementation, Executive summary (+12 more)

### Community 80 - "Blue Swallow Society Constitution"
Cohesion: 0.10
Nodes (20): Additional Security Requirements, API Security, Authentication and Authorization, Blue Swallow Society Constitution, Code Review Security Focus, Core Principles, Data Protection, Dependency Management (+12 more)

### Community 81 - "Blue Swallow Society Constitution"
Cohesion: 0.10
Nodes (20): Additional Security Requirements, API Security, Authentication and Authorization, Blue Swallow Society Constitution, Code Review Security Focus, Core Principles, Data Protection, Dependency Management (+12 more)

### Community 82 - "index.js"
Cohesion: 0.16
Nodes (16): buildBounds(), buildSnapshot(), clampNumber(), fetchBody(), fs, getBodyValue(), getWigleModule(), loadLiveBridge() (+8 more)

### Community 83 - "U"
Cohesion: 0.05
Nodes (42): acquireRTT(), anyTilesAfterTime(), bindRTT(), commit(), destruct(), _finalizeElevation(), getAnisotropicFilterPitch(), getCenterClampedToGround() (+34 more)

### Community 84 - "clone"
Cohesion: 0.23
Nodes (14): al(), da(), di(), _getTerrainCoordsForRegularTile(), ll(), no(), q, fr (+6 more)

### Community 85 - "index.js"
Cohesion: 0.12
Nodes (14): AGENT_PATH, fs, NACRE_MARK_PATH, NACRE_STYLE_PATH, path, PRIVATE_OPERATOR_DIR, { requireOperatorToken }, SHELL_PATH (+6 more)

### Community 86 - "gi"
Cohesion: 0.08
Nodes (27): acquire(), _applyDiffToSource(), _applyResourceTiming(), _dispatchWorkerUpdate(), ei(), fi(), getFeatureState(), _getShouldReloadTileOptions() (+19 more)

### Community 87 - "Wardriver RaID + BSS Backend Repair Plan"
Cohesion: 0.11
Nodes (18): Acceptance criteria, Bridge role decision, BSS Static Web App and Functions, Current implementation review, Implementation checkpoint — 2026-07-11, Phase 0 — Preserve Black ICE gates before feature work, Phase 1 — Freeze the device/backend contract, Phase 2 — Make Wardriver RaID a real local sensor surface (+10 more)

### Community 88 - "common.sh"
Cohesion: 0.12
Nodes (4): get_current_branch(), get_feature_paths(), has_git(), common.sh script

### Community 89 - "Implementation Plan: Wardriver Immutable Release Delivery"
Cohesion: 0.11
Nodes (16): Implementation Plan: Wardriver Immutable Release Delivery, Rollout and rollback, Security decisions, Source layout, Summary, Technical context, Verification plan, Assumptions and exclusions (+8 more)

### Community 90 - "onAdd"
Cohesion: 0.19
Nodes (22): producerScript, REPO_ROOT, finiteNumber(), hasExactIds(), hasOnlyKeys(), hasUniqueStringField(), isPlainObject(), nullableHttpsUrl() (+14 more)

### Community 91 - "toString"
Cohesion: 0.18
Nodes (22): colorModeForRenderPass(), dd(), fd(), Gc(), getDepthModeForSublayer(), getPaintProperty(), getStencilConfigForOverlapAndUpdateStencilID(), hd() (+14 more)

### Community 92 - "Strategy taxonomy"
Cohesion: 0.12
Nodes (16): 1. Time-series momentum / trend following, 2. Cross-sectional momentum, 3. Mean reversion / contrarian drawdown, 4. Pairs / statistical arbitrage, 5. Perpetual funding / cash-and-carry, 6. Event/news/social momentum, 7. On-chain flow / DeFi liquidity, 8. Market making / grid trading (+8 more)

### Community 93 - "Public Official and Political Signal Radar"
Cohesion: 0.12
Nodes (16): Campaign money, Enforcement and ethics, Federal elected officials, Federal executive and agency officials, Guardrails, Implementation backlog, Money, disclosure, and ethics sources, Official registry targets (+8 more)

### Community 94 - "index.js"
Cohesion: 0.23
Nodes (14): { requireOperatorToken }, buildOperatorSessionCookie(), requireOperatorToken(), { buildOperatorSessionCookie, requireOperatorToken }, { createReleaseStore, toOperatorMetadata }, handle(), handleAuthorized(), handler() (+6 more)

### Community 95 - "common.ps1"
Cohesion: 0.23
Nodes (11): Find-FeatureDirByPrefix(), Find-SpecifyRoot(), Get-CurrentBranch(), Get-FeatureDirFromBranchPrefixOrExit(), Get-FeaturePathsEnv(), Get-Python3Command(), Get-RepoRoot(), Get-SpecKitEffectiveBranchName() (+3 more)

### Community 96 - "ui-shell.test.mjs"
Cohesion: 0.12
Nodes (15): indexHtml, mainJs, nacreMarkUrl, nacreStylesUrl, operatorAgentHtml, operatorAgentLoaderUrl, operatorHtml, operatorLoaderJs (+7 more)

### Community 97 - "Kismet Wardriving Sensor Spine Research"
Cohesion: 0.13
Nodes (15): Acceptance criteria, Core architecture, Decision candidate, How this ties into dream-design cyber augmentation, Implementation slice, Kismet Wardriving Sensor Spine Research, Observation payload shape, Observed facts (+7 more)

### Community 98 - "package.json"
Cohesion: 0.13
Nodes (14): h3-js, pg, dependencies, h3-js, pg, engines, node, name (+6 more)

### Community 99 - "createRequestHandler"
Cohesion: 0.09
Nodes (26): Ca(), _computeTileBoundingVolume(), coordinatePoint(), createFramebuffer(), createRenderbuffer(), depthAtPoint(), fromAabb(), getDEMElevation() (+18 more)

### Community 100 - "cameraForBoxAndBearing"
Cohesion: 0.08
Nodes (26): Adversarial Review Repair Guidance, Decision boundary, Decision boundary, Decision record required, Goal, Immediate containment, Non-goals, Promotion gate (+18 more)

### Community 101 - "Cybermap Geospatial Backend Design"
Cohesion: 0.10
Nodes (23): _charUsesLocalIdeographFontFamily(), _createTinySDF(), dispatchRenderCallbacks(), _downloadAndCacheRangePromise(), _drawGlyph(), Fc(), _fontStyle(), _fontWeight() (+15 more)

### Community 102 - "Microsoft Layoff and Hiring Risk Radar"
Cohesion: 0.14
Nodes (13): Budget and hiring risk, Executive read, External signals, Fiscal timing pattern, Guardrails, Headcount baseline from Microsoft 10-K filings, Major Nadella-era layoff and reorg waves, Microsoft Layoff and Hiring Risk Radar (+5 more)

### Community 103 - "godeye-map-shell.test.mjs"
Cohesion: 0.14
Nodes (11): analysis, mapController, operatorMain, operatorShell, registry, root, styles, vendorCss (+3 more)

### Community 104 - "mosaic_murmurs_market_data.py"
Cohesion: 0.12
Nodes (22): _bindFramebuffer(), Bs(), _buildSkirts(), calculateFogMatrix(), clear(), createIndexBuffer(), createVertexBuffer(), getCoordsTexture() (+14 more)

### Community 105 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 106 - "cybermap-schema.test.mjs"
Cohesion: 0.15
Nodes (9): dbReadme, ingestMigration, ingestMigrationLower, installCybermapApi, migration, migrationLower, paperStateMigration, paperStateMigrationLower (+1 more)

### Community 107 - "postgres-store.test.mjs"
Cohesion: 0.17
Nodes (4): check(), credentialRow, FakePool, ScriptedClient

### Community 108 - "index.js"
Cohesion: 0.10
Nodes (21): AzureTablePasscodeRateLimiter, callerKeyForRequest(), createPasscodeRateLimiter(), createTableClient(), crypto, firstForwardedAddress(), getBoundedPositiveInt(), getPasscodeRateLimitConfig() (+13 more)

### Community 109 - "cp"
Cohesion: 0.14
Nodes (17): Ad(), Cd(), Ed(), emplace(), feature(), getPositionIds(), getPositions(), gm() (+9 more)

### Community 110 - "Mosaic & Murmurs Morning Brief Implementation"
Cohesion: 0.18
Nodes (11): Agent research tools, Bridge / market signals, Cron prompt contract, Mosaic / breaking reality, Mosaic & Murmurs Morning Brief Implementation, Murmurs / hype weather, Paper ledger semantics, Persistent artifacts (+3 more)

### Community 111 - "User Scenarios & Testing *(mandatory)*"
Cohesion: 0.17
Nodes (11): Feature Specification: Tzeentch Market Surface, Functional Requirements, Non-Functional Requirements, Requirements *(mandatory)*, Success Criteria, User Scenarios & Testing *(mandatory)*, User Story 1 - Swipeable Intelligence Lanes (Priority: P1), User Story 2 - Public Read-Only Market Browsing (Priority: P1) (+3 more)

### Community 112 - "co"
Cohesion: 0.09
Nodes (33): $a(), add(), addClassName(), co(), dp, fo(), getPerspectiveRatio(), go() (+25 more)

### Community 113 - "placeLayerBucketPart"
Cohesion: 0.20
Nodes (14): ao(), attemptAnchorPlacement(), cl(), fl(), get(), Gu(), Hu(), jo() (+6 more)

### Community 114 - "Core Principles"
Cohesion: 0.18
Nodes (10): Core Principles, Governance, [PRINCIPLE_1_NAME], [PRINCIPLE_2_NAME], [PRINCIPLE_3_NAME], [PRINCIPLE_4_NAME], [PRINCIPLE_5_NAME], [PROJECT_NAME] Constitution (+2 more)

### Community 116 - "tzeentch-browser.test.mjs"
Cohesion: 0.20
Nodes (6): appRoot, execFileAsync, MIME_TYPES, osintPayload, repoRoot, tzeentchPayload

### Community 117 - "tzeentch-route.test.mjs"
Cohesion: 0.20
Nodes (10): authorizationHeader(), canonicalPaperBackendResponse(), { createOperatorToken }, handler, jsonResponse(), mockTzeentchFeedFetch(), PAPER_BOOK_IDS, PAPER_LINES (+2 more)

### Community 118 - "package.json"
Cohesion: 0.17
Nodes (11): dependencies, @azure/data-tables, @azure/storage-blob, description, engines, node, name, private (+3 more)

### Community 119 - "index.js"
Cohesion: 0.36
Nodes (8): backendUrl(), configuredToken(), crypto, fetchBackend(), getHeader(), idempotencyKey(), requestBody(), requireClientToken()

### Community 120 - "operator-downloads-api.test.mjs"
Cohesion: 0.22
Nodes (6): { createOperatorToken }, handler, invoke(), makeContext(), release, require

### Community 121 - "index.js"
Cohesion: 0.28
Nodes (4): forwardHeaders(), getHeader(), REQUIRED_HEADERS, requiredHeader()

### Community 122 - "index.js"
Cohesion: 0.20
Nodes (12): {
  buildViewportPayload,
  hasSensitiveLocationQuery,
  postCybermapJson,
}, { requireOperatorToken }, buildBackendUrl(), buildViewportPayload(), clampNumber(), getBodyValue(), hasSensitiveLocationQuery(), parseNumber() (+4 more)

### Community 123 - "applyVisionDataset"
Cohesion: 0.60
Nodes (6): applyVisionDataset(), bindVisionControls(), handleVisionFileChange(), loadVisionEndpoint(), renderVisionViews(), setVisionStatus()

### Community 124 - "_executeRelevantHandler"
Cohesion: 0.31
Nodes (9): endMove(), _executeRelevantHandler(), _isOneFingerTouch(), _isSameTouchEvent(), isValidEndEvent(), isValidMoveEvent(), isValidStartEvent(), startMove() (+1 more)

### Community 125 - "Material gaps and risks"
Cohesion: 0.20
Nodes (11): calculatePosMatrix(), gd(), getFastPathSimpleProjectionMatrix(), getProjectionData(), getProjectionDataForCustomLayer(), gl(), populateCache(), setBaseState() (+3 more)

### Community 126 - "Mosaic & Murmurs Autonomous Paper Engine"
Cohesion: 0.25
Nodes (8): Accounting, sync, and status, Capital contract, Deterministic decision model, Eight strategy archetypes, Market data, Mosaic & Murmurs Autonomous Paper Engine, Risk and terminal policy, Three aggression lines

### Community 127 - "Static Web App Functionality"
Cohesion: 0.22
Nodes (9): API Integration, Authentication, Operator Console, Operator Tabs, Overview, Root Face, Security Considerations, Static Web App Functionality (+1 more)

### Community 128 - "create-new-feature.sh"
Cohesion: 0.25
Nodes (3): _extract_highest_number(), get_highest_from_branches(), create-new-feature.sh script

### Community 129 - "Implementation Plan: [FEATURE]"
Cohesion: 0.22
Nodes (8): Complexity Tracking, Constitution Check, Documentation (this feature), Implementation Plan: [FEATURE], Project Structure, Source Code (repository root), Summary, Technical Context

### Community 130 - "cybermap-viewport-api.test.mjs"
Cohesion: 0.33
Nodes (7): { createOperatorToken }, invokeRoute(), makeContext(), makeOperatorHeaders(), require, restoreEnv(), TEST_OPERATOR_DIGEST

### Community 131 - "wigle-api.test.mjs"
Cohesion: 0.28
Nodes (7): { createOperatorToken }, invokeRoute(), makeContext(), makeOperatorHeaders(), require, TEST_OPERATOR_DIGEST, wigleRoute

### Community 132 - "activateTabByIndex"
Cohesion: 0.16
Nodes (18): bl(), getPixelScale(), initDebugOverlayCanvas(), patternsLoaded(), qc(), sd(), Cl(), transitioned() (+10 more)

### Community 133 - "SKILL.md"
Cohesion: 0.25
Nodes (7): Anti-Examples: What NOT To Do, Checklist Purpose: "Unit Tests for English", Example Checklist Types & Sample Items, Execution Steps, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 134 - "SKILL.md"
Cohesion: 0.25
Nodes (7): Key rules, Outline, Phase 0: Outline & Research, Phase 1: Design & Contracts, Phases, Pre-Execution Checks, User Input

### Community 135 - "SKILL.md"
Cohesion: 0.25
Nodes (7): For AI Generation, Outline, Pre-Execution Checks, Quick Guidelines, Section Requirements, Success Criteria Guidelines, User Input

### Community 136 - "SKILL.md"
Cohesion: 0.25
Nodes (7): Checklist Format (REQUIRED), Outline, Phase Structure, Pre-Execution Checks, Task Generation Rules, Task Organization, User Input

### Community 137 - "Azure Credentials Setup (OIDC, no secrets in GitHub)"
Cohesion: 0.33
Nodes (5): 1. Create the service principal, 2. Add the federated credential, 3. GitHub secrets to set, Azure Credentials Setup (OIDC, no secrets in GitHub), Generating `VM_SSH_PUBLIC_KEY`

### Community 138 - "Product Surfaces"
Cohesion: 0.27
Nodes (14): clampFiniteNumber(), finiteOrNull(), isPlainObject(), labelForKind(), parseFiniteNumber(), parseTimestampMs(), parseViewportBody(), parseViewportValues() (+6 more)

### Community 139 - "Nacre-Moiré operator design system"
Cohesion: 0.25
Nodes (7): Aesthetic authority, Assets and implementation, Copy grammar, Design tokens, Identity, Nacre-Moiré operator design system, Surface grammar

### Community 140 - "create-new-feature.ps1"
Cohesion: 0.46
Nodes (7): ConvertTo-CleanBranchName(), Get-BranchName(), Get-HighestNumberFromBranches(), Get-HighestNumberFromNames(), Get-HighestNumberFromRemoteRefs(), Get-HighestNumberFromSpecs(), Get-NextBranchNumber()

### Community 141 - "checklist.md"
Cohesion: 0.25
Nodes (7): Anti-Examples: What NOT To Do, Checklist Purpose: "Unit Tests for English", Example Checklist Types & Sample Items, Execution Steps, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 142 - "plan.md"
Cohesion: 0.25
Nodes (7): Key rules, Outline, Phase 0: Outline & Research, Phase 1: Design & Contracts, Phases, Pre-Execution Checks, User Input

### Community 143 - "specify.md"
Cohesion: 0.25
Nodes (7): For AI Generation, Outline, Pre-Execution Checks, Quick Guidelines, Section Requirements, Success Criteria Guidelines, User Input

### Community 144 - "tasks.md"
Cohesion: 0.25
Nodes (7): Checklist Format (REQUIRED), Outline, Phase Structure, Pre-Execution Checks, Task Generation Rules, Task Organization, User Input

### Community 145 - "cybermap-tiles-api.test.mjs"
Cohesion: 0.36
Nodes (6): { createOperatorToken }, invokeRoute(), makeOperatorHeaders(), require, restoreEnv(), TEST_OPERATOR_DIGEST

### Community 147 - "main.mjs"
Cohesion: 0.29
Nodes (5): pool, port, server, shutdown(), store

### Community 149 - "url"
Cohesion: 0.14
Nodes (13): Assumptions, Edge Cases, Feature Specification: Adversarial Review Repairs, Functional Requirements, Key Entities, Requirements *(mandatory)*, Success Criteria *(mandatory)*, User Scenarios & Testing *(mandatory)* (+5 more)

### Community 150 - "Safe options"
Cohesion: 0.29
Nodes (6): 1) Local/open models on the VM, 2) Azure OpenAI (pay-as-you-go), 3) Azure AI Foundry Models (serverless, pay-as-you-go), AI / LM options while staying inside Azure credits, Safe options, What to avoid early

### Community 151 - "Blue Swallow Society System Implementation Delta"
Cohesion: 0.12
Nodes (17): 2026-07-28 local verification receipt, Adversarial findings, Blue Swallow Society System Implementation Delta, Evidence boundary, Executive verdict, Next honest milestone, P0 — mutable VM deployment artifact, P1 — operator asset names remain public (+9 more)

### Community 152 - "Personal Site Starter on Azure Static Web Apps + VM Echo Backend"
Cohesion: 0.25
Nodes (8): Architecture, Blue Swallow Society, Current source capabilities, Deployment declaration, Documentation map, Repository layout, Runtime boundaries, Verification

### Community 153 - "passcode-api.test.mjs"
Cohesion: 0.36
Nodes (7): { createOperatorToken, verifyOperatorRequest }, createTestRateLimiter(), handler, invoke(), makeContext(), require, withEnv()

### Community 154 - "agent.js"
Cohesion: 0.27
Nodes (10): bootOperatorShell(), promptEl, runAgent(), runBtn, activateOperatorSession(), clearOperatorSession(), hasActiveOperatorSession(), isFuture() (+2 more)

### Community 155 - "deriveGodeyeSessionAnalysis"
Cohesion: 0.60
Nodes (3): clearGodeyeSessionAnalysis(), deriveGodeyeSessionAnalysis(), validRecord()

### Community 156 - "Architecture decisions"
Cohesion: 0.17
Nodes (11): Architecture decisions, Boundary model, Constraints and non-goals, Current source topology, Cybermap writes and reads, Documentation authority, Implemented data paths, Material gaps from source review (+3 more)

### Community 157 - "Tzeentch Paper API Status"
Cohesion: 0.10
Nodes (15): Node runtime policy, Contract, Current source behavior, Failure behavior, Tzeentch Paper API Status, Verification, Implemented HTTP contract, Infrastructure declared in source (+7 more)

### Community 158 - "local-server.js"
Cohesion: 0.33
Nodes (5): APP_DIR, fs, http, path, server

### Community 159 - "Tasks: Wardriver Immutable Release Delivery"
Cohesion: 0.33
Nodes (5): Phase 1 — Release store and protected BSS contract, Phase 2 — Azure deployment and release promotion, Phase 3 — Device freshness signal, Phase 4 — verification and operational cutover, Tasks: Wardriver Immutable Release Delivery

### Community 160 - "paper-state-proxy.test.mjs"
Cohesion: 0.07
Nodes (61): key(), annotateCurrentRecord(), bearingBetween(), buildArCandidateBoxes(), buildCurrentWigleState(), buildWigleMapState(), categorizeSignal(), cleanString() (+53 more)

### Community 161 - ".test_query_current_state_returns_recent_unique_observations_ordered_by_signal"
Cohesion: 0.53
Nodes (3): load_bridge_module(), Path, WigleLocalBridgeTests

### Community 162 - "SKILL.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 163 - "SKILL.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 164 - "SKILL.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 165 - "Recommended delivery sequence"
Cohesion: 0.24
Nodes (11): applyWigleDataset(), buildWigleRequestPayload(), refreshLiveWigleFeed(), setLiveWigleStatus(), setText(), setWigleStatus(), startWigleLivePolling(), stopWigleLivePolling() (+3 more)

### Community 166 - "VM echo wiring"
Cohesion: 0.33
Nodes (5): Current route, Deployment integrity note, Network and process state declared in IaC, Scope, VM echo compatibility wiring

### Community 167 - "install-cybermap-api.sh"
Cohesion: 0.60
Nodes (4): DEBIAN_FRONTEND, migration_applied(), run_migration(), install-cybermap-api.sh script

### Community 168 - "Deployment sequence"
Cohesion: 0.22
Nodes (9): Current boundary, Cybermap Geospatial Backend, Godeye policy model, Implemented persistence shape, Implemented source contracts, Infrastructure declared by source, Location handling: precise boundary, Not implemented in this repository (+1 more)

### Community 169 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 170 - "clarify.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 171 - "constitution.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 172 - "taskstoissues.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 173 - "Test Design: Wardriver Immutable Release Delivery"
Cohesion: 0.40
Nodes (4): TDD sequence, Test Design: Wardriver Immutable Release Delivery, Test matrix, Traceability

### Community 174 - "invokeRoute"
Cohesion: 0.22
Nodes (7): agent, loader, operatorMain, passcodeApi, publicMain, root, sessionModule

### Community 175 - "runtime-versions.test.mjs"
Cohesion: 0.50
Nodes (4): read(), readJson(), root, workflowPaths

### Community 176 - "wardriver-release-delivery-config.test.mjs"
Cohesion: 0.40
Nodes (4): main, moduleUrl, root, workflow

### Community 179 - "getPoint"
Cohesion: 0.25
Nodes (6): deployWorkflow, installer, mainBicep, root, vmBicep, whatIfWorkflow

### Community 180 - "SKILL.md"
Cohesion: 0.50
Nodes (3): Outline, Pre-Execution Checks, User Input

### Community 181 - "Wardriver review"
Cohesion: 0.25
Nodes (7): BSS Cybermap API, IaC installation path, Implemented routes, Ingest contract, Local PostgreSQL/PostGIS run, Local test, Paper state

### Community 182 - "Audit boundaries and provenance"
Cohesion: 0.29
Nodes (6): Affected structure, Constitution check, Implementation Plan: Adversarial Review Repairs, Implementation sequence, Rollback and migration, Technical context

### Community 183 - "Mosaic & Murmurs proposal delta"
Cohesion: 0.33
Nodes (5): Phase 1 — Artifact and transport foundations, Phase 2 — Session and shared throttling, Phase 3 — Wardriver/VM projection and legacy separation, Phase 4 — Evidence and documentation, Tasks: Adversarial Review Repairs

### Community 184 - "Verification results"
Cohesion: 0.50
Nodes (3): Apply locally, Cybermap database migrations, Migration contract

### Community 185 - "Test Design: Adversarial Review Repairs"
Cohesion: 0.33
Nodes (5): Commands, Fixture authority, Required negative cases, Test Design: Adversarial Review Repairs, Traceability

### Community 186 - "implement.md"
Cohesion: 0.50
Nodes (3): Outline, Pre-Execution Checks, User Input

### Community 187 - "0001_cybermap_core.sql"
Cohesion: 0.50
Nodes (3): observations_append_only_delete, observations_append_only_update, schema_migrations

### Community 192 - "_queryCellCircle"
Cohesion: 0.50
Nodes (5): _circleAndRectCollide(), _circlesCollide(), _queryCell(), _queryCellCircle(), Ya()

### Community 210 - "toString"
Cohesion: 0.40
Nodes (5): _getMesh(), _getMeshKey(), isPatternMissing(), kr(), toString()

## Knowledge Gaps
- **1139 isolated node(s):** `check-prerequisites.sh script`, `common.sh script`, `create-new-feature.sh script`, `setup-plan.sh script`, `setup-tasks.sh script` (+1134 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `error()` connect `hasData` to `VM API Specification`, `maplibre-gl-shared.mjs`, `index.js`, `Recommended delivery sequence`, `main.js`, `push`, `main.js`, `index.js`, `$`, `postgres-store.mjs`, `server.mjs`, `applyVisionDataset`, `http.test.mjs`, `index.js`, `constructor`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `key()` connect `paper-state-proxy.test.mjs` to `contracts.mjs`, `operator-auth.js`, `maplibre-gl-shared.mjs`, `index.js`, `cybermap-viewport-api.test.mjs`, `vision.mjs`, `Product Surfaces`, `index.js`, `tzeentch-dashboard.mjs`, `wigle.mjs`, `cybermap-tiles-api.test.mjs`, `server.mjs`, `onAdd`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `createRequestHandler()` connect `server.mjs` to `index.js`, `http.test.mjs`, `wardriver-release-store.js`, `hasData`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `constructor()` (e.g. with `bp` and `b()`) actually correct?**
  _`constructor()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 42 inferred relationships involving `l()` (e.g. with `bd()` and `cameraForBoxAndBearing()`) actually correct?**
  _`l()` has 42 INFERRED edges - model-reasoned connections that need verification._
- **What connects `check-prerequisites.sh script`, `common.sh script`, `create-new-feature.sh script` to the rest of the system?**
  _1139 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `maplibre-gl.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.008135022675206882 - nodes in this community are weakly interconnected._