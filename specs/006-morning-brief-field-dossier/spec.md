# 006 — Morning Brief Field Dossier

## Status
Approved for implementation — 2026-07-21.

## Problem
The 2026-07-21 morning brief generated a text run but no deterministic render package, had no Discord attachments to dispatch, and used a canonical paper ledger that was older than the operational freshness bound. The site has no authenticated archive surface.

## Scope
One immutable, validated run package drives two independent outputs:

1. Discord Field Dossier attachments in batches of no more than ten PNGs.
2. Operator-only persisted brief history on the live BSS surface.

## Invariants

- A run is `withheld` unless a successful wake receipt, canonical paper-state SHA-256, and a paper snapshot age of at most three hours are present.
- Invalid market marks are rejected by the adapter before they mutate the ledger. Prediction probabilities are finite values in `[0, 1]`.
- A package has a deterministic `package_sha256`, ordered 1200x1500 PNG pages, HTML pages, a source index, and a render manifest covering all seven required lanes.
- Discord and archive writes use exactly that package hash and persist receipts. Nothing is dispatched when validation, render, or archive persistence fails.
- Archive writes are append-only within the seven-day retention window: an existing retained run ID may replay only when its package hash matches; a changed package is a conflict. A successful archive transaction deletes artifact rows and run records whose `archived_at` is seven days old or older.
- The operator surface presents verified rendered PNG pages in a horizontally scrollable, scroll-snap carousel; a dropdown selects any retained run. Text metadata and source files remain secondary provenance, not a substitute render.
- Public routes expose neither brief content nor artifact metadata. All archive/UI/API responses require the existing operator-token boundary and use `private, no-store`.
- No raw runtime path, credential, prompt, or backend URL is present in a rendered page, receipt, archive response, or operator UI.

## Required lanes

- `MOSAIC / FACT LANE`
- `MURMURS / PERCEPTION LANE`
- `BRIDGE / DELTA LANE`
- `SOURCE QUARANTINE`
- `PAPER ACTIONS / LEDGER`
- `PAPER BOOKS / LEDGER`
- `SOURCE MANIFEST / CAVEATS`

## Interfaces

### Local run package

`bss.morning_brief.package.v1` contains `run_id`, generated and canonical timestamps, `canonical_state_hash`, `package_sha256`, public-safe summary, render manifest, source index, ordered artifacts, and immutable receipt slots. Artifact bytes are represented as base64 only during the private upload request.

### Backend API

Private VM paths, token-gated by `X-Blue-Swallow-Morning-Brief-Token`:

- `POST /api/v1/morning-briefs`
- `GET /api/v1/morning-briefs?limit=N`
- `GET /api/v1/morning-briefs/:run_id`
- `GET /api/v1/morning-briefs/:run_id/artifacts/:artifact_id`

SWA provides the operator-token gateway at `/api/morning-brief` and never exposes the VM token.

### Operator UI

`/operator/morning-brief.html` follows the existing operator shell token/session pattern, provides latest, history, detail, and privately fetched HTML/PNG artifacts, and does not fall back to a public root.

## Acceptance

- Unit tests prove invalid marks do not survive adapter normalization and stale/failed wake state produces a withheld receipt with zero artifacts/dispatches.
- Renderer tests prove full seven-lane coverage, ordered unique 1200x1500 pages, deterministic hashes, and redaction of local paths.
- Dispatcher tests prove batches of ≤10, hash-bound receipt creation, replay safety, and no send on withheld state.
- VM, SWA proxy, and operator UI tests prove authorization, no-store headers, append-only conflicts, artifact hash verification, and public-route denial.
- A fresh real run performs wake → collect → validate → render → archive → Discord receipt, then the authenticated live UI presents the same package hash.
