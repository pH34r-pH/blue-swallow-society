# Tzeentch Paper API Status

**Status:** Working with source warnings
**Date:** 2026-07-11
**Scope:** `api/tzeentch` paper-book payload and live handler smoke test

## Answer

Yes: the Tzeentch paper API handler is working in a direct local function smoke test. It returned HTTP `200`, `ok: true`, `publicOnly: true`, `paperOnly: true`, and three legacy warm-memory paper books. This smoke output predates the canonical five `$1,000 paper` book doctrine.

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

Direct local handler smoke test:

```bash
BLUE_SWALLOW_PASSCODE_SHA256=$(printf 'paper-api-test-passcode' | sha256sum | cut -d' ' -f1) \
BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY='paper-api-smoke-token-signing-key-32-bytes-minimum' \
BLUE_SWALLOW_OPERATOR_ID=paper-api-smoke \
BLUE_SWALLOW_OPERATOR_TOKEN_TTL_MS=60000 \
BLUE_SWALLOW_PAPER_LEDGER_PATH=/tmp/bss-paper-api-smoke-ledger.json \
node -e "const handler=require('./api/tzeentch/index.js'); const { createOperatorToken }=require('./api/_lib/operator-auth.js'); (async()=>{ const {token}=createOperatorToken({operatorId:'paper-api-smoke'}); const ctx={log:{error:(m)=>console.error('LOGERR',m)}}; await handler(ctx,{headers:new Headers({authorization:'Bearer '+token})}); console.log(JSON.stringify(ctx.res.body.paperBooks,null,2)); })().catch(e=>{console.error(e.stack||e);process.exit(1);});"
```

## Semantics

- The API is read-only from the frontend perspective and returns `publicOnly: true`.
- Paper books are paper-only and never execute real exchange, brokerage, wallet, or prediction-market orders.
- Persistence is controlled by `BLUE_SWALLOW_PAPER_LEDGER_PATH` in local/function runtime.
- Local `local-server.js` does not mount `/api/tzeentch`; direct handler tests or Azure Functions/SWA runtime are the right verification path.
