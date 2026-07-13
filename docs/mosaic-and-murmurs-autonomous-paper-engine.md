# Mosaic & Murmurs Autonomous Paper Engine

Status: implemented 3×8 contract
Scope: autonomous **paper-only** simulation; no brokerage, wallet, exchange, account-bound write, or real-money adapter

## Capital contract

Each of the 24 independent books begins with exactly `$2,000` paper equity:

- `$1,000` initial investment capital, converted into fresh-mark seed positions on the first eligible tick;
- `$1,000` bank capital;
- no cross-book cash, positions, P/L, high-water mark, or crash state.

The first allocation is idempotent. The next eligible tick moves each line toward its aggression target. A schema-v2/v3 legacy five-book ledger is archived for audit and replaced by a clean 24-book matrix; legacy losses are not inherited by the new books.

## Three aggression lines

| Line | Target gross exposure | Target positions | Single-position cap | Material-order threshold | Intent |
|---|---:|---:|---:|---:|---|
| `standard` | 80% of equity | 3 | 40% | `$40` | aggressive baseline with a modest reserve |
| `aggressive` | 95% of equity | 2 | 65% | `$20` | concentrated rotation with little idle cash |
| `hyper_aggressive` | 100% of equity | 1 | 100% | `$5` | all-in concentration on the strategy's selected mark |

All lines seed with the same `$1,000` exposure / `$1,000` bank starting point. Aggression changes concentration, deployed capital, and turnover after seed; it does not create leverage or negative cash.

## Eight strategy archetypes

| Strategy | Initial `$1,000` seed | Selection rule after seed |
|---|---|---|
| `prediction_markets` | `$500` YES + `$500` NO in the highest-liquidity eligible binary market | one favored outcome per market, ranked by explicit signal then momentum/liquidity |
| `crypto` | equal-weight BTC, ETH, SOL | strongest liquid crypto momentum |
| `equity_watch` | equal-weight SPY, QQQ, MSFT | strongest index/large-cap momentum |
| `local_event_watch` | equal-weight MSFT, AMZN, COST, SBUX, BA | strongest PNW economic-proxy momentum |
| `ai_cyber_watch` | equal-weight HACK, CIBR, AIQ | strongest AI/cyber thematic momentum |
| `cross_asset_momentum` | equal-weight BTC, QQQ, AIQ | strongest marks across crypto and equity risk assets |
| `contrarian_reversion` | equal-weight ETH, AMZN, CIBR | weakest liquid cross-asset marks, deliberately testing mean reversion |
| `volatility_barbell` | equal-weight SPY, SOL, AIQ | alternating strongest and weakest high-beta marks |

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

After initial allocation, each book ranks every fresh instrument eligible for its strategy and computes target notionals from its aggression profile. Momentum strategies remain allocated even when every signal is negative: they choose the least-bad eligible marks rather than liquidating defensively. Contrarian and barbell strategies use their own deterministic ordering. Sells execute before buys in the same rebalance so rotation does not create a temporary cash-out bias.

No LLM text directly executes a fill. LLM output may supply evidence or a bounded signal input, but deterministic policy owns pricing, selection, sizing, and accounting.

## Risk and terminal policy

Machine-enforced before every autonomous fill:

- `paper_only == true`; no real-execution adapter exists;
- fresh instrument mark and source provenance required;
- exactly one `$1,000` seed allocation per book;
- profile-specific gross exposure, concentration, order maximum, and materiality threshold;
- no leverage, shorting, cross-book transfers, or negative cash;
- deterministic idempotency keys suppress replayed decisions and fills;
- stale or incomplete marks produce blocked decisions, never fabricated buys;
- no drawdown stop, daily-loss stop, or negative-momentum cash-out rule;
- policy-passing paper fills require no human review.

The full `$2,000` balance is the book's loss budget. When marked equity reaches `$0.01` or less after initial allocation, the book enters terminal `crashed` state, emits `book_crashed` plus `POSTMORTEM_REQUIRED`, and stops trading. Restart requires a human postmortem that distinguishes bad luck from a bad strategy; ordinary trades remain autonomous.

## Accounting, sync, and status

Canonical persisted data is snake_case. Ledger schema is `4`; synchronized cost-aware paper-state schema is `bss.paper_state.v3`. The VM accepts legacy `bss.paper_state.v2` snapshots during the rolling upgrade, but new producers emit only v3.

Each book persists line and strategy identity, aggression profile, cash, positions, realized/unrealized P/L, equity, high-water mark, drawdown, prior-close snapshot, crash state, last trade time, and processed idempotency keys. Legacy five-book state is retained under `archived_books`.

Each fill records decision/order/event IDs, idempotency key, book and instrument identity, action, quantity, mark, notional, provenance, risk checks, pre/post accounting, and paper-only governance. The synchronized state includes bounded `recent_paper_trades` so dashboards and graphic renderers can show durable activity rather than only the current tick.

The local scheduled Python engine is the sole decision/risk/execution owner. Browser GET requests never create fills. The VM API validates the complete 3×8 matrix and stores the latest canonical state. Tzeentch and morning-brief collectors are read adapters over that state.
