# Tzeentch Paper API Status

**Status:** Historical local-test record — superseded by current source and the current test suite
**Date:** 2026-07-11
**Scope:** `api/tzeentch` paper-book payload and live handler smoke test

> **Historical local-test record — superseded:** This captures a 2026-07-11 direct handler result. It is not current deployment evidence, operating configuration, or a credential source.
>
> **Test-only boundary:** The smoke command below uses hermetic `TEST-ONLY` fixtures and no app settings. Run it only in an isolated local test context; never deploy these values or use them as production configuration.

## Answer

At capture time, the Tzeentch paper API handler returned HTTP `200`, `ok: true`, `publicOnly: true`, `paperOnly: true`, and three legacy warm-memory paper books in a direct local function smoke test. This smoke output predates the canonical five `$1,000 paper` book doctrine.

The live smoke test produced:

```json
{
  "status": 200,
  "ok": true,
  "publicOnly": true,
  "sourceFamilies": ["Hacker News", "Reddit", "CoinGecko", "Polymarket Gamma"],
  "paperOnly": true,
  "paperBookCount": 3,
  "paperSummary": "3 paper books running in parallel against public feeds."
}
```

Legacy per-book first-iteration smoke output:

| Book | Equity | Cash | Positions | Pending orders | Total PnL | Return | Iteration |
|---|---:|---:|---:|---:|---:|---:|---:|
| `murmur-momentum` | 10000 | 9000 | 1 | 1 | 0 | 0% | 1 |
| `contrarian-reversion` | 10000 | 9000 | 1 | 1 | 0 | 0% | 1 |
| `prediction-arb` | 10000 | 9000 | 1 | 1 | 0 | 0% | 1 |

## Warning observed

The API works, but Reddit's public JSON endpoint returned HTTP 403 from this runtime:

```text
https://www.reddit.com/r/all/hot.json?limit=25 failed: HTTP 403
Reddit hot feed unavailable.
```

That means the paper API is functioning, but one source family is degraded. Do not treat the Reddit lane as live until it is replaced with an allowed credentialed API adapter or an alternate source.

## Verification commands

Unit tests:

```bash
node --test tests/tzeentch-api.test.mjs tests/tzeentch-route.test.mjs tests/tzeentch-dashboard.test.mjs
```

Hermetic local handler smoke (test context only):

The route test supplies in-process `TEST-ONLY` feed and paper-state fixtures. It validates the handler without a live backend, production app settings, or copied credentials.

```bash
node --test --test-name-pattern='bearer-token protected read-only payload' tests/tzeentch-route.test.mjs
```

## Semantics

- The API is read-only from the frontend perspective and returns `publicOnly: true`.
- Paper books are paper-only and never execute real exchange, brokerage, wallet, or prediction-market orders.
- Persistence is controlled by `BLUE_SWALLOW_PAPER_LEDGER_PATH` in local/function runtime.
- Local `local-server.js` does not mount `/api/tzeentch`; direct handler tests or Azure Functions/SWA runtime are the right verification path.
