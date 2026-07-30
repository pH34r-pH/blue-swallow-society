---
title: RaID model lifecycle control plane
status: accepted
date: 2026-07-29
design: /home/ph3/repos/blackbox/blackbox/Designs/Wardriver RaID Camera Training Ingestion/2026-07-29 - Automated Model Training, Catalog, and Field Feedback Loop Proposal.md
---

# RaID Model Lifecycle Control Plane

## Scope

Implement Society's server-side control plane for immutable, reviewed RaID model releases. The plane stores release provenance, catalog eligibility, artifact bytes, model-scoped field feedback, and capture-volume training-job claims. It extends the existing Wardriver mTLS boundary; it does not add cloud inference, public download URLs, automatic activation, automatic promotion, or raw-frame upload.

## User stories

### US1 — Discover an approved field model (P1)

Given an enrolled Wardriver device presents a valid Caddy mTLS assertion and has `models:read`, when it requests the RaID field catalog, then it receives at most five newest releases that are published, approved, non-revoked, and compatible with its declared app/runtime contract, plus a bounded durable revocation-ID list. It receives no unapproved candidate, revoked release, or artifact URL.

**Independent test:** an HTTP contract seeds approved, incompatible, revoked, and unapproved releases and proves only the compatible approved releases are returned in descending publication order.

### US2 — Retrieve immutable signed bytes (P1)

Given a catalog release is eligible and the same mTLS device has `models:read`, when it requests its artifact, then Society returns the exact content-addressed bytes with the release manifest and SHA-256 headers. Given the release is revoked, unknown, incompatible, or lacks verified artifact bytes, Society returns no model bytes.

**Independent test:** an HTTP contract compares the returned bytes and digest, then proves revoked and incompatible requests are rejected.

### US3 — Submit model-scoped feedback exactly once (P1)

Given an enrolled device has `models:feedback:write`, when it sends a valid idempotent good/bad report for a release it received, then Society stores a minimal receipt bound to the model release, exact artifact digest, device, app/runtime metadata, and bounded reason. A replay returns the original receipt; changed content under the same idempotency key fails closed.

**Independent test:** a store and HTTP test verify create/replay/conflict and rejection of a feedback report with a mismatched digest or absent release eligibility.

### US4 — Queue a trainable snapshot without auto-publishing (P2)

Given reviewed, deduplicated training examples since the last consumed dataset snapshot satisfy a versioned batch policy, when the lifecycle worker claims work, then it atomically creates one immutable dataset snapshot and one queued training job. A job records policy revision, replay corpus, predecessor release, and input provenance. Training completion cannot create a published release.

**Independent test:** a lifecycle-store contract proves one claim for eligible material, zero duplicate claims under contention, and no catalog visibility for queued/trained candidates.

## Edge cases

- A request with an absent/invalid Caddy-to-API assertion, disabled/expired credential, missing scope, malformed query, duplicate header, or non-loopback upstream must receive the existing generic forbidden/error surface and no artifact bytes.
- Catalog permits only `?channel=field`; device identity and compatibility values never enter query parameters. Catalog and artifact requests are mTLS `GET` reads with no body and exact singleton compatibility headers for app version, runtime ID/version, and decoder profile.
- A currently selected but older release may remain available to its client cache; it must be excluded from new catalog responses after revocation. The authenticated catalog includes a bounded `revoked_release_ids` list so a client can deactivate an exact cached release without treating ordinary catalog truncation as revocation.
- Positive feedback and absence of negative feedback are not ground truth. Free text and capture references cannot become annotations or training weights without human review.
- A raw frame, precise location, RF observation, certificate fingerprint, token, or storage credential is never stored in a model feedback record.
- A failed/expired/changed signature is a release-integrity failure; the release is not catalog-eligible even if its artifact hash matches.

## Functional requirements

- **FR-001:** Add a mTLS-only `GET /api/v1/raid/models/catalog?channel=field` route that requires `models:read`, allows no other query field or request body, accepts app/runtime compatibility only through exact singleton `X-Blue-Swallow-RaID-*` headers, and returns no more than 100 durable `revoked_release_ids` alongside eligible releases.
- **FR-002:** Add an mTLS-only `GET /api/v1/raid/models/releases/{release_id}/artifact` route that requires `models:read`, allows no query/body, accepts the same bounded compatibility headers, and returns only an eligible release's bytes, exact manifest JSON, SHA-256, and immutable release identifier. It must use `Cache-Control: private, no-store` and never redirect to a public/stable artifact URL.
- **FR-003:** Add an mTLS-only `POST /api/v1/raid/models/releases/{release_id}/feedback` route that requires `models:feedback:write`, validates a bounded JSON request, and preserves idempotency using `(source, device, feedback_id)`.
- **FR-004:** A release is catalog-eligible only when its state is `published`, its approval/signature/artifact receipt fields are present and internally consistent, it is not revoked, and its app/runtime compatibility interval includes the requesting client.
- **FR-005:** The response limit is five release entries. Ordering is immutable `published_at` descending with release ID as a deterministic tie-breaker. Bundled fallbacks and client-selected cache state are Android concerns and are not rows in this catalog.
- **FR-006:** Persist immutable records for dataset snapshots, training jobs, model releases, artifact receipts, and feedback. A training job may only claim reviewed/deduplicated eligible material newer than its last consumed snapshot. A claimed, trained, or failed job is never a release publication action.
- **FR-007:** Persist only the feedback fields needed for review: event/idempotency identity, release/artifact identity, device/source scope, good/bad value, bounded reason codes/note, app/runtime profile, optional already-authorized capture reference, timestamps, and review state. Do not persist raw images or location through this route.
- **FR-008:** Model routes must use the existing trusted Caddy proxy assertion plus `authenticateMtls`, fail closed if either is unavailable, and preserve generic public authorization errors.
- **FR-009:** Existing browser/SWA routes and the two existing mTLS routes retain their current behavior. The Caddy allowlist changes only to admit the three exact RaID model paths.
- **FR-010:** The server must have production PostgreSQL persistence and a test-only memory implementation with equivalent public behavior. The API readiness check must report model-lifecycle migration readiness.

## Key entities

- **Model release:** immutable ID/version, signed canonical manifest, artifact bytes/digest/size, tensor/decoder contract, compatibility interval, dataset/train/evaluation provenance, channel, predecessor, publication and revocation facts.
- **Model feedback:** append-only user report tied to one release ID and artifact SHA-256; review state is separate from the original report.
- **Dataset snapshot:** immutable list/hash of eligible reviewed examples, replay corpus IDs, taxonomy revision, rights receipts, split policy, and input cutoff.
- **Training job:** leased immutable snapshot execution record. Its terminal state is not a publication state.
- **Training policy:** versioned threshold rules for reviewed volume, class coverage, dedupe, hard negatives, and cooldown.

## Non-goals

- TensorFlow architecture/weight creation, training-data rights approval, actual raw-capture transfer, annotation UI, automatic approval, automatic signing, automatic catalog publication, Android activation, model benchmarking claims, cloud inference, or public artifact hosting.

## Success criteria

- Node unit and HTTP tests prove FR-001 through FR-010, including authorization, compatibility filtering, byte/digest integrity, feedback replay/conflict, and one-job claim behavior.
- The PostgreSQL migration is append-only for feedback/release evidence, registered in readiness and the VM installer, and has no secrets.
- Caddy configuration admits only the exact documented model endpoints on the mTLS listener.
- The full VM API and repository-root test suites pass, `git diff --check` passes, and Graphify's local code graph refresh succeeds.
