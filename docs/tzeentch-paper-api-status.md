# Tzeentch Paper API Status

**Source baseline:** `6124e64f8cc4970657a6c060713f97c4f1eb4abd`, reviewed 2026-07-28.

## Current source behavior

`api/tzeentch` is an authenticated operator read adapter over public-source feed data and the canonical paper-state backend. It no longer represents a three-book warm-memory ledger.

The canonical model is exactly **24 paper-only books**:

```text
3 aggression lines × 8 strategy IDs = 24 independent books
$1,000 bank capital + $1,000 initial investment capital per book
$2,000 initial paper equity per book
```

The local deterministic Python engine owns decisions, risk policy, sizing, accounting, and state construction. The VM paper-state endpoint stores a validated `bss.paper_state.v3` snapshot. Tzeentch fetches that snapshot only from a configured HTTPS backend using `X-Blue-Swallow-Paper-State-Token`.

## Failure behavior

If the backend URL/token is absent, non-HTTPS, unavailable, stale, malformed, or fails canonical validation, Tzeentch returns an unavailable canonical-paper state:

- no ledger books;
- no synthetic positions, fills, or market marks;
- a warning explaining that canonical state is unavailable; and
- no fallback to demo data.

This is intentional. A source-tree test or handler invocation does not prove that public feeds, the VM backend, or an operator dashboard is live.

## Contract

A canonical state must include:

- `paper_only: true` and `autonomous_execution: true`;
- ledger schema `4` with exactly three line IDs and eight strategy IDs;
- exactly 24 unique book IDs in ledger and summary arrays;
- valid timestamps, idempotency keys, governance, action/event bounds, and cost accounting for v3; and
- no real-money adapter or account-bound execution path.

The reader accepts `bss.paper_state.v2` during the rolling migration, but producers emit `bss.paper_state.v3`.

## Verification

```bash
node --test tests/tzeentch-route.test.mjs \
  tests/tzeentch-dashboard.test.mjs \
  tests/tzeentch-browser.test.mjs \
  tests/paper-state-contract.test.mjs \
  tests/paper-state-proxy.test.mjs

PYTHONPATH=scripts python3 -m unittest discover -s tests -p '*_test.py'
```

See [Mosaic & Murmurs Autonomous Paper Engine](./mosaic-and-murmurs-autonomous-paper-engine.md) for the deterministic 3×8 contract and [VM Cybermap API](./vm-api.md) for persistence transport/authentication.
