# Implementation Status: Godeye Global Map and Source Integration

**Status:** T021 local evidence closeout
**Date:** 2026-07-22
**Authority:** `/home/ph3/repos/blue-swallow-society/specs/008-godeye-global-map-source-integration` (read-only); all seven recorded SHA-256 values matched the accepted execution contract.

## Verified implementation state

- The authenticated operator client reads only `POST /api/cybermap/global-viewport`; it sends same-origin, no-store requests and renders returned aggregate cells, source health, attribution, freshness, caveats, and intelligence gaps. See `app/operator/godeye-global.mjs`.
- The VM requires the backend-read token before `POST /api/v1/cybermap/global-viewport`, validates the request and response contract, and calls the bounded store `queryGlobalViewport`. See `vm/cybermap-api/src/server.mjs` and `vm/cybermap-api/src/{memory-store,postgres-store}.mjs`.
- Global-source eligibility requires an enabled global layer, a non-null terms review timestamp, `allowed_preload=true`, and a permitted source class. The PostgreSQL query applies the equivalent predicates.
- `runGreenfeedWorker` remains dependency-injected and has no scheduler, provider configuration, or browser/API read-path integration. It records `disabled` before fetch when terms are unreviewed or the source is disabled.

## Verified test and graph evidence

- Parent receipt `t_a78ca7a0` (T019) records an executed disposable-PostGIS TST-008 receipt: Node `v24.18.0`, `1` pass / `0` fail / `0` skipped; migration `0004` SHA-256 `88426f14ba6f29f30db493cb72613e143088009efc980c6e2d6d9966912d5d3d`; temporary database and staging removed.
- The same receipt records the repository Node suite at `154` pass / `0` fail / `0` skipped. This closeout does not reinterpret a no-environment migration skip or fixture-only adapter test as operational proof.
- `graphify update .` completed with local AST extraction and reported no code-graph topology change. The required Global-path query traversed `467` nodes and resolved the GlobalViewport contract, VM route/store query, Greenfeed worker/materializer, operator renderer, and shell test.

## Provider enablement boundary

USGS, GDACS, and NASA EONET adapters are currently declared `enabled: false`, `allowed_preload: false`, and `terms_reviewed_at: null`. No provider credentials, scheduler, or live source were added or enabled in this lane.

T020 is not completed by this status file. If no explicit per-provider terms/attribution approval exists, T020 remains blocked. Even when a separate approval record exists, server-side configuration and a TST-009 receipt remain required before a source can be called enabled. Fixture normalization/worker evidence is not live-source enablement evidence.
