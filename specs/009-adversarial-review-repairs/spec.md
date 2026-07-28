# Feature Specification: Adversarial Review Repairs

**Feature Branch**: `009-adversarial-review-repairs`
**Created**: 2026-07-28
**Status**: Accepted — implementation authorized by Tyler
**Input**: Implement every repair in `docs/adversarial-review-repair-guidance.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Deploy one verifiable VM service artifact (P1)

A deployer can identify exactly which Cybermap source archive reached the VM, verify its SHA-256 before extraction, and refuse a mutable or mismatched artifact.

**Independent Test**: Static deployment tests inspect Bicep, workflow, and installer contracts for a commit-addressed archive, a required 64-hex digest, and pre-extraction verification.

**Acceptance Scenarios**:
1. **Given** a GitHub deployment commit, **when** CI deploys infrastructure, **then** it passes the full commit archive URL and its computed SHA-256 into Bicep.
2. **Given** an installer digest mismatch, **when** the VM extension runs, **then** it exits before extracting files, applying migrations, or replacing the service.
3. **Given** a rollback deployment, **when** the selected commit and digest are supplied, **then** the installer deploys that exact verified archive.

### User Story 2 — Contain location and operator credentials (P1)

An operator can request current signals without coordinates entering Function→VM URLs and without a bearer token persisting in browser storage.

**Independent Test**: Edge/VM HTTP tests assert POST JSON forwarding without sensitive query parameters. Browser/security tests assert no operator-token use of `sessionStorage` or `localStorage`.

**Acceptance Scenarios**:
1. **Given** a valid viewport body, **when** the Function calls the VM, **then** it uses authenticated `POST /api/v1/cybermap/viewport` with a JSON body and no search parameters.
2. **Given** a valid passcode, **when** the client unlocks the console, **then** its five-minute session exists only in the operator-session module memory.
3. **Given** the configured token version changes, **when** an earlier token is presented, **then** the Function rejects it.

### User Story 3 — Enforce passcode throttling across Function instances (P1)

Repeated failures from one normalized caller identity are limited by durable shared state, while the public cover remains available.

**Independent Test**: Unit tests exercise a deterministic shared limiter fake for collision, expiry, reset, and outage behavior. IaC/workflow tests verify the dedicated Table storage wiring.

**Acceptance Scenarios**:
1. **Given** two Function instances sharing one limiter, **when** a caller exceeds the configured window, **then** both instances return 429 before passcode verification.
2. **Given** limiter configuration or storage is unavailable, **when** a passcode is submitted, **then** the passcode route returns 503 and the root public surface remains static and usable.
3. **Given** a successful authenticated passcode entry, **when** the limiter reset succeeds, **then** its caller failure record is cleared.

### User Story 4 — Use the Wardriver/VM observation authority (P1)

An authenticated operator receives a bounded, provenance-bearing VM signal projection derived from canonical Wardriver batches, not browser-owned WiGLE parsing.

**Independent Test**: VM HTTP tests ingest a `bss.observation_batch.v1` fixture and read an operator-signal projection. Static tests prove no API import from `app/operator/**`.

**Acceptance Scenarios**:
1. **Given** a valid Wardriver-compatible batch, **when** the VM accepts it, **then** the signal projection identifies `bss.operator_signal_snapshot.v1` and gives source/redaction/provenance fields.
2. **Given** a `hash_only` observation, **when** the projection is read, **then** it contains no SSID, BSSID, or HMAC identifier.
3. **Given** an existing legacy WiGLE source, **when** `/api/wigle` is used during migration, **then** it remains an API-owned compatibility adapter and returns explicit legacy provenance.

### User Story 5 — Keep seams reviewable (P2)

A maintainer can change session handling, upstream proxying, legacy WiGLE parsing, or VM viewport projection behind isolated contracts.

**Independent Test**: Focused unit/static tests import the extracted seams and verify the old large route modules delegate to them.

### Edge Cases

- The commit archive URL is supplied with a non-commit ref or a malformed digest.
- A stale direct VM client uses the retired viewport GET/query route and receives a non-success response; it must migrate to POST.
- A passcode limiter operation conflicts under concurrent writers or times out.
- A bearer token expires while a Godeye request is in flight.
- A stored `hash_only` observation has no plaintext radio identifiers.
- The legacy WiGLE source is not configured.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The VM artifact URL MUST identify a full 40-character Git commit, and the installer MUST require a matching SHA-256 digest.
- **FR-002**: The installer MUST verify the archive digest before extraction, migration, symlink switch, or service restart.
- **FR-003**: CI and manual IaC what-if MUST provide the immutable artifact URL and digest explicitly.
- **FR-004**: The Function→VM viewport call MUST use HTTPS POST with an `application/json` body. It MUST NOT place latitude, longitude, radius, limit, age, or time in a URL.
- **FR-005**: The VM MUST accept the authenticated POST viewport body and reject the retired GET/query route.
- **FR-006**: Browser code MUST NOT persist operator bearer material in `sessionStorage`, `localStorage`, IndexedDB, Cache Storage, a URL, or the DOM.
- **FR-007**: Operator tokens MUST expire after at most five minutes by default and MUST carry a configured token-version claim checked at every Function boundary.
- **FR-008**: Passcode throttling MUST use a dedicated shared durable store with atomic conditional updates and bounded retries. Process-local Maps MUST NOT be authoritative state.
- **FR-009**: The passcode route MUST fail closed with 503 if the limiter cannot be used; the public cover MUST not depend on that route succeeding.
- **FR-010**: The limiter storage account and table MUST be dedicated to rate-limiting state; its connection string MUST be masked in workflow output and set only as an SWA app setting.
- **FR-011**: The VM MUST provide a token-gated `bss.operator_signal_snapshot.v1` POST projection derived from canonical observations.
- **FR-012**: The signal projection MUST omit SSID, BSSID, and HMAC radio identifiers when the source observation is `hash_only`.
- **FR-013**: The browser MUST use the operator-signal projection for Godeye/AR signal rendering.
- **FR-014**: API code MUST NOT import from `app/operator/**`. Legacy WiGLE parsing belongs to an API-owned compatibility seam with explicit `legacy_wigle` provenance.
- **FR-015**: Session, Cybermap proxy, legacy WiGLE adapter, and VM viewport/projection logic MUST have isolated modules and focused contract tests.

### Key Entities

- **ImmutableCybermapArtifact**: full commit archive URL plus SHA-256 digest.
- **OperatorSession**: module-private five-minute bearer and expiry, signed with an emergency token-version claim.
- **PasscodeRateLimitRecord**: one normalized caller key/window record with count, expiry, and ETag-constrained updates.
- **OperatorSignalSnapshot**: `bss.operator_signal_snapshot.v1` projection derived from canonical `bss.observation_batch.v1` observations.
- **LegacyWigleSnapshot**: explicitly provenance-labeled compatibility data, not canonical BSS state.

## Success Criteria *(mandatory)*

- **SC-001**: Focused artifact, viewport, auth/rate-limiter, WiGLE, browser-shell, and VM HTTP suites pass.
- **SC-002**: Root Node, Python, and VM suites pass with documented commands.
- **SC-003**: Static tests prove no Function→browser module import, no persistent operator bearer storage, and no Function→VM sensitive-location URL construction.
- **SC-004**: `graphify update .` completes after source changes and the generated graph is current for the working tree.

## Assumptions

- Azure deployments remain unexecuted in this repair. Their Bicep/workflow behavior is declared, not live proof.
- The Azure Table storage connection string is provisioned by the deployment workflow and never committed.
- VM query-form viewport clients must migrate to POST before deployment; the VM route does not retain a query compatibility bypass.
