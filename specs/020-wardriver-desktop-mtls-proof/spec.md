---
title: Wardriver desktop mTLS local proof
status: accepted
created: 2026-08-09
implements: "[[Designs/Wardriver Desktop mTLS Local Proof/proposal]]"
---

# Wardriver Desktop mTLS Local Proof

## Purpose

Wardriver development needs a durable desktop-sourced mTLS identity and a repeatable local acceptance lane that exercises the Android encrypted outbox through Caddy, the real Cybermap API, and fresh PostGIS before a bounded Azure deployment smoke test.

## Definitions

- **desktop development credential**: the separately named, exportable PKCS#12 client certificate `wardriver-mtls-desktop-dev-2026` in Key Vault `bsswdmtls3f85618`. It is a desktop-sourced development identity, not the primary Wardriver certificate, a server certificate, or a CA private key.
- **local proof stack**: disposable Docker containers for PostGIS, Cybermap API, Caddy mTLS ingress, and a loopback-bound TCP byte relay. The relay forwards opaque TLS bytes only; it cannot terminate TLS or set API proxy headers. Caddy and the API share an internal proof network namespace so the backend observes the Caddy upstream as loopback. Only the relay may also attach to a separate edge bridge for host-port publication. Each accepted run starts with an empty database and ends with explicit teardown.
- **local-lab build**: a Wardriver debug build that can use only `https://bss.localhost:18080` and a debug-only local CA trust anchor. It uses the application-id suffix `.localproof` so it cannot overwrite normal Wardriver app state. Its custom URI scheme, exported control-broadcast actions, and signature permission derive from its final application ID, so it cannot claim the primary installation's external identifiers. A release build cannot use any local-lab value.
- **live smoke**: one controlled authenticated upload against the deployed Azure mTLS listener after local acceptance passes. It is deployment evidence, not the clean-baseline acceptance fixture.

## User scenarios

### US1 — Establish a durable desktop identity (P1)

An operator creates, exports, and imports a separate development client identity without exposing its private material to the repository, APK, or logs.

**Acceptance scenario:** Given Key Vault access and an emulator, when the operator retrieves the exportable desktop PFX into a protected local credential directory and imports it into Android KeyChain, then Wardriver selects the KeyChain alias while its app storage contains only the alias and the `wardriver-desktop-dev-2026` device identity.

### US2 — Prove the full local transaction (P1)

An operator runs the local proof stack and submits one controlled encrypted-outbox batch from the emulator.

**Acceptance scenario:** Given a fresh local PostGIS volume, an enrolled desktop certificate, and a debug local-lab build, when Wardriver uploads a controlled batch and retries the same idempotency key, then Caddy verifies mTLS, the API resolves the desktop credential, PostGIS stores one durable batch/observation set, the first response contains a valid receipt, the exact local outbox record releases only after that receipt, and retry returns an idempotent replay without duplicate rows.

### US3 — Detect Azure integration drift (P2)

An operator validates the same desktop identity against the deployed listener after the local proof has passed.

**Acceptance scenario:** Given a CI-deployed Azure public trust bundle and a matching enabled source/device credential, when the bounded host-side verifier sends one controlled batch to the exact deployed mTLS listener, then the backend returns a durable receipt and an exact replay receipt. This Azure smoke does not claim an Android-to-Azure outbox transition. The run records no raw RF payload or private key.

## Requirements

- **FR-001**: Key Vault MUST contain a separately named desktop development client certificate with RSA-3072, `clientAuth` EKU, exportable PKCS#12 material, explicit `credential_source=desktop` and `environment=development` tags, and an expiry/rotation record. The certificate MUST NOT replace or modify the primary client identity.
- **FR-002**: Private key material, PFX bytes, PFX passwords, database URLs, tokens, and raw observations MUST NOT enter Git, Android resources, BuildConfig, CI logs, test fixtures, vault notes, or generated reports.
- **FR-003**: The desktop certificate fingerprint MUST bind to exactly one enabled, distinct `wardriver-desktop-dev-2026` device credential and source identity with only `observations:write` and `cybermap:read`; its credential metadata and source policy MUST exactly identify owned desktop local-proof provenance. The local API MUST reject multiple matching mTLS credentials and recheck the exact named source key/class, source provenance, credential metadata, and scope set in its write transaction. A stale or substituted source/credential row (including extra scopes, disabled state, expiry, changed source class, or changed provenance) MUST fail the local proof rather than be silently reused. The local proof supports the fixed desktop PFX name `wardriver-mtls-desktop-dev-2026.pfx` only; it MUST be a passwordless PKCS#12 containing exactly one client certificate/private-key identity, and bootstrap plus both runtime readers MUST verify that its public leaf matches the fixed single desktop public PEM before use. The trusted direct-access boundary is only the operator's current Windows account. A Windows administrator or `SYSTEM` process may take ownership outside that boundary; the design makes no hostile-host-administrator claim. Bootstrap and runtime readers MUST require an explicit new `local-proof.env` directly under that root's `local-mtls-lab/` subdirectory, reject detected symlink and Windows reparse-point traversal (including Windows reparse attributes) plus resolved paths outside that boundary, and harden/verify direct Windows ACLs for the PFX, local-proof directory, and generated environment file before reporting success. Hostile same-user check/use races remain outside this accepted local-proof boundary.
- **FR-004**: The local proof stack MUST use PostGIS, the real Cybermap API, and Caddy `require_and_verify` client authentication. A loopback-bound TCP relay MAY publish host `:18080` only when it forwards opaque bytes to Caddy, injects no headers, and terminates no TLS. PostGIS/API/Caddy MUST remain on an internal proof network; only the relay may also attach to a distinct edge bridge for host-port publication. Caddy MUST inject the proxy marker and certificate fingerprint only on its internal loopback upstream request.
- **FR-005**: A local-lab Wardriver build MUST be debug-only, use exactly `https://bss.localhost:18080`, use application-id suffix `.localproof`, and include the checked-in debug local CA only when `-PbssLocalMtlsLab=true` selects that origin. Its manifest URI scheme, exported `END`/`SCAN`/`PAUSE` actions, and `MAPS_RECEIVE` plus `CONTROL` signature permissions MUST derive from `${applicationId}`; the exported control receivers MUST require `CONTROL`; runtime control-action constants MUST derive from `BuildConfig.APPLICATION_ID`. An ordinary debug build and every release artifact MUST retain the deployed Azure origin and MUST NOT contain the local CA, local endpoint, or local-lab application-id suffix. Certificate transparency MUST remain enabled for all non-lab origins.
- **FR-006**: The local proof MUST start from an empty PostGIS state, apply all required migrations, and seed only the owned desktop development source/credential. The deliberate proof entrypoint MUST remove its Docker volume before startup; independently, the verifier MUST fail before any test batch unless count-only evidence shows exactly one `wardriver-desktop-dev-2026` source, one matching desktop device credential, zero `sync_batches`, and zero `observations`. A successful proof MAY retain its disposable local containers and named volume for bounded operator inspection; the next deliberate proof resets that state, and `run-local-proof.sh down --volumes --remove-orphans` remains the explicit teardown command. No persistent Azure test database is created by this local fixture.
- **FR-007**: The local proof MUST demonstrate valid durable receipt parsing, receipt-bound encrypted-outbox release, retry/idempotency, and database row counts. The local host verifier MUST cap each JSON response at 64 KiB before parsing, load its credential values only from the exact protected `local-proof.env`, reject caller-supplied P12/CA environment values, and verify the fixed PFX/direct ACL/path/leaf match before a TLS request. For the v1 proof batch, it MUST reject a receipt with a missing or extra field, validate every durable field (`schema_version`, `server_batch_id`, `idempotency_key`, `status`, `accepted_count`, `rejected_count`, `duplicate_count`, `validation_errors`, and `server_clock`), and require canonical equality of the full first and replay receipts. Android v2 receipt acceptance MUST use a closed top-level and progress-field schema, reject duplicate JSON object-member names before Gson conversion, persist an encrypted canonical-receipt binding before local progress or terminal outbox transition, and reject a later replay whose full receipt semantics change. It MUST assert count-only preflight `1/1/0/0` and post-replay `1/1/1/1` desktop-source/desktop-credential/`sync_batches`/`observations` evidence. Transport ambiguity, invalid/missing receipt, certificate mismatch, device mismatch, or receipt-binding mismatch MUST retain the outbox item.
- **FR-008**: The Azure Caddy trust input MUST be a public PEM bundle containing the existing primary trust entry and the desktop development public certificate. No PFX/private key is allowed in the bundle. The live smoke runs only after the local proof is green, uses the same fixed protected passwordless desktop PFX and matching public leaf, targets only `https://blue-swallow-vm-ob74vubvzwd7u.westus2.cloudapp.azure.com:8443/`, bypasses proxy configuration for its no-client rejection probe, and MUST reject a JSON response larger than 64 KiB before parsing it. For its v1 proof batch, it MUST apply the same strict receipt field contract and canonical full-receipt replay equality as FR-007.
- **FR-009**: Every Android `KeyChain.choosePrivateKeyAlias` callback MUST return to the Android main thread before it saves an alias, starts upload/portal work, displays a Toast, or touches MapLibre/UI state.
- **FR-010**: An Android reference-data refresh MUST download each remote artifact into a temporary candidate, verify its reviewed SHA-256 pin before replacement, and atomically replace the tracked build input only after verification. Normal debug and release builds MUST NOT invoke a reference-data network refresh.

## Success criteria

- **SC-001**: A full local emulator-to-PostGIS mTLS proof has real Caddy, API, database, Android, and receipt evidence; no mocked transport substitutes for the accepted path.
- **SC-002**: Repeating the exact batch creates no second `sync_batches` or observation record and returns the original receipt semantics.
- **SC-003**: `assembleDebug` contains neither the local host nor the local CA; `assembleDebug -PbssLocalMtlsLab=true` is the only permitted local endpoint/trust route; `assembleRelease` contains neither the local host nor the local CA.
- **SC-004**: The final host-side Azure smoke returns a server-issued durable receipt and exact replay using the desktop certificate without changing the primary identity or retaining a new long-lived test database.

## Edge cases

- The Key Vault certificate is not exportable or the caller lacks secret-read permission: preserve no partial PFX; report the exact authorized handoff required.
- The desktop certificate auto-renews or rotates: its changed public leaf/fingerprint must not reach Caddy or the credential row until an explicit public-bundle/metadata deployment passes review.
- A debug build is invoked without the local-lab property: it retains the Azure mTLS origin and does not trust the local CA.
- Docker is unavailable, unhealthy, or the database migrations are incomplete: do not label the proof complete or fall back to an in-memory store.
- The local server certificate does not match `bss.localhost` or Android rejects its chain: fail closed; do not disable release TLS verification or use a hosts-file/SNI bypass.
