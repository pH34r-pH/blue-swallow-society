# Mosaic & Murmurs Autonomous Paper Engine

Status: implemented contract target
Scope: autonomous **paper-only** simulation; no brokerage, wallet, exchange, account-bound write, or real-money adapter

## Capital contract

Each canonical book begins with `$2,000` paper equity:

- `$1,000` initial bank allocation;
- `$1,000` additional contribution, which must be converted to fresh-mark paper positions on the first eligible tick;
- post-seed target: exactly `$1,000` gross paper exposure and `$1,000` cash.

The contribution is idempotent. Migrating a schema-v2 `$1,000` flat book applies it once; replaying the same or later tick never contributes it again.

## Canonical books and seed baskets

| Book | Initial paper allocation |
|---|---|
| `prediction_markets` | `$500` YES + `$500` NO in the same highest-liquidity eligible binary market. This is a market-neutral starting benchmark, not a directional claim. |
| `crypto` | Equal-weight BTC, ETH, and SOL. |
| `equity_watch` | Equal-weight SPY, QQQ, and MSFT. |
| `local_event_watch` | Equal-weight MSFT, AMZN, COST, SBUX, and BA as a transparent Seattle/Redmond/PNW economic proxy basket. |
| `ai_cyber_watch` | Equal-weight HACK, CIBR, and AIQ. |

No synthetic price is allowed. A book seeds only when every required mark is valid and fresh. A source outage blocks that book rather than fabricating a fill.

## Market data

- Crypto: CoinGecko public market API.
- Prediction markets: Polymarket Gamma public API.
- Equities/ETFs: Cboe delayed-quote API.
- Every instrument record carries `retrieved_at`, market `as_of`, source URL, mark, previous close or probability, and strategy tags.
- Crypto and prediction marks expire after two hours.
- Equity/ETF trade marks expire after 96 hours so a Friday close remains usable through a weekend; retrieval itself must still be current.

## Deterministic decision model

The engine is a pure transition:

```text
(previous ledger, normalized market snapshot, run idempotency key, timestamp)
  -> (next ledger, action decisions, append-only ledger events)
```

After initial allocation, each book computes target notionals:

- prediction markets: hold the neutral YES/NO seed unless an explicit evidence-derived `signal_score` crosses the directional threshold; then rebalance toward the supported side;
- crypto/equity/local/AI-cyber baskets: rank fresh instruments by normalized momentum. Positive instruments receive target exposure; non-positive instruments are reduced or exited;
- the engine trades only a material target delta and records `WATCH` when the delta is below the threshold.

No LLM text directly executes a fill. LLM output may supply evidence or a bounded signal input, but deterministic policy owns pricing, risk, sizing, and accounting.

## Risk policy

Machine-enforced before every autonomous fill:

- `paper_only == true` and no real-execution adapter exists;
- fresh instrument mark and source provenance required;
- exactly one contribution/seed migration per book;
- maximum target gross exposure: 50% of current book equity;
- maximum single-instrument exposure: 25% of current book equity;
- maximum one-order notional: `$500`;
- minimum material order: `$25`;
- no leverage, shorting, or negative cash;
- one-hour buy/rebalance cooldown per book; risk-reducing sells remain allowed;
- 10% drawdown stop and 5% daily-loss stop block buys but permit exits;
- deterministic idempotency keys suppress replayed decisions and fills;
- stale or incomplete marks produce `AVOID`/blocked decisions, never a buy;
- human review is not required for policy-passing paper fills, but every decision remains operator-auditable.

## Accounting and records

Canonical persisted data is snake_case.

Each fill records:

- decision, order, and event IDs;
- run/idempotency key;
- book and instrument identity;
- action, quantity, mark, notional, and source reference;
- risk-policy checks and pass/fail result;
- pre/post cash, position quantity, and book equity;
- `paper_only: true`, `autonomous_execution: true`, and `human_review_required: false` for accepted fills.

Books persist cash, positions, realized and unrealized P/L, equity, high-water mark, current drawdown, maximum drawdown, prior close snapshot, last trade time, and processed idempotency keys.

The ledger snapshot is a materialized projection. Action decisions and ledger events remain append-only audit records.

## Ownership boundary

The local scheduled Python engine is the sole decision/risk/execution owner. Browser GET requests must not create fills. The Tzeentch UI is a read adapter over the latest materialized state. A VM/Postgres synchronization boundary may durably store ticks, decisions, and events, but it must not contain a second strategy engine.
