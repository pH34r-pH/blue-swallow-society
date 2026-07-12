# Crypto Paper-Trading Strategy Research

**Status:** Initial research note
**Date:** 2026-07-11
**Scope:** Crypto strategy taxonomy, data requirements, and paper-trading guardrails for Mosaic & Murmurs
**Use:** Replace vibe-based calls with explicit hypotheses, falsification, and risk controls

## Executive read

The current BSS crypto lane should not make directional calls from a single snapshot of CoinGecko trend rank or 24h price change. A usable system needs:

1. **Strategy class** — what edge is being tested.
2. **Signal definition** — exact inputs and lookback.
3. **Execution model** — entry, exit, size, fees, slippage, latency.
4. **Benchmark** — BTC, ETH, cash, equal-weight majors, or no-trade.
5. **Falsification** — when the thesis is wrong.
6. **Paper ledger** — all actions paper-only until backtest and forward-paper performance are known.

## Research anchors

Academic and technical starting points:

- `2003.11352` — *Cryptocurrency Trading: A Comprehensive Survey*: <https://arxiv.org/abs/2003.11352>
- `1904.00890` — *Momentum and liquidity in cryptocurrencies*: <https://arxiv.org/abs/1904.00890>
- `1903.06033` — *Altcoin-Bitcoin Arbitrage*: <https://arxiv.org/abs/1903.06033>
- `2212.06888` — *Fundamentals of Perpetual Futures*: <https://arxiv.org/abs/2212.06888>
- `2112.07386` — *On The Quality Of Cryptocurrency Markets: Centralized Versus Decentralized Exchanges*: <https://arxiv.org/abs/2112.07386>
- `2506.11921` — *Dynamic Grid Trading Strategy: From Zero Expectation to Market Outperformance*: <https://arxiv.org/abs/2506.11921>

Public market-data docs:

- CoinGecko API: <https://www.coingecko.com/en/api>
- Coinbase Exchange API: <https://docs.cdp.coinbase.com/exchange/docs/welcome>
- Kraken API: <https://docs.kraken.com/api/>
- DeFiLlama API: <https://defillama.com/docs/api>
- CCXT unified exchange library: <https://docs.ccxt.com/>

## Strategy taxonomy

### 1. Time-series momentum / trend following

Thesis: assets that have moved up over a lookback continue moving up over a shorter holding period.

Signals:

- `return_24h`, `return_7d`, `return_30d`
- moving-average crossovers
- breakout above recent high
- volume confirmation

Use when:

- broad risk-on market,
- persistent social/market volume,
- trend confirmed on multiple timeframes.

Failure modes:

- late entries after social spike,
- whipsaw in mean-reverting regimes,
- high fees/slippage on small caps.

Paper gate:

- require trend > threshold and liquidity > threshold;
- exit on trailing stop or failed breakout;
- compare to BTC/ETH benchmark.

### 2. Cross-sectional momentum

Thesis: rotate into strongest liquid assets relative to the universe.

Signals:

- rank by 7d/30d return, volume, and liquidity,
- exclude microcaps and low-liquidity tokens,
- rebalance daily/weekly.

Failure modes:

- survivorship bias,
- chasing manipulated low-float tokens,
- concentration risk.

Paper gate:

- top-N liquid assets only;
- cap per-position notional;
- include delisted/stale-asset handling in backtest.

### 3. Mean reversion / contrarian drawdown

Thesis: liquid majors revert after statistically large drawdowns or spikes.

Signals:

- z-score of returns,
- RSI-like overbought/oversold,
- deviation from moving average,
- funding/positioning extremes.

Failure modes:

- catching falling knives,
- structural news regime changes,
- liquidation cascades.

Paper gate:

- majors only at first;
- hard stop;
- no averaging down unless predefined.

### 4. Pairs / statistical arbitrage

Thesis: historically related assets diverge and later converge.

Candidate pairs:

- BTC/ETH beta spread,
- L1 baskets,
- exchange tokens,
- liquid staking tokens vs underlying,
- wrapped assets vs native asset.

Failure modes:

- correlation breaks,
- borrow/funding costs,
- exchange-specific liquidity and custody risk.

Paper gate:

- require rolling correlation/cointegration evidence;
- define hedge ratio;
- include both legs, fees, and funding.

### 5. Perpetual funding / cash-and-carry

Thesis: capture funding/basis between spot and perpetual/futures markets.

Signals:

- perp funding rate,
- futures basis,
- open interest,
- borrow/collateral cost.

Failure modes:

- liquidation risk,
- exchange/custody failure,
- basis blowout,
- funding flips.

Paper gate:

- no live leverage;
- mark-to-market collateral requirements;
- model funding payments and liquidation threshold.

### 6. Event/news/social momentum

Thesis: public narrative shocks create short-lived attention and liquidity waves.

Signals:

- Google Trends, HN/Reddit/Mastodon/Product Hunt velocity,
- official announcements,
- exchange listings,
- ETF/regulatory decisions,
- protocol incidents.

Failure modes:

- news already priced,
- fake announcements,
- pump-and-dump/liquidity traps,
- no executable edge after API latency.

Paper gate:

- use `WATCH` unless paired with market confirmation;
- require primary source for listing/regulatory/security claims;
- never act on one social source alone.

### 7. On-chain flow / DeFi liquidity

Thesis: on-chain flows precede price/volatility.

Signals:

- TVL change,
- exchange inflows/outflows,
- stablecoin supply/flows,
- bridge flows,
- DEX volume,
- liquidation levels.

Failure modes:

- entity-label uncertainty,
- wash trading,
- delayed data,
- costly/paid data dependencies.

Paper gate:

- start with DeFiLlama TVL/volume only;
- mark confidence low until labels are verified.

### 8. Market making / grid trading

Thesis: harvest spread/range movement in bounded regimes.

Signals:

- realized volatility,
- spread/depth,
- range stability,
- order-book imbalance.

Failure modes:

- inventory blowout during trends,
- fees exceed spread,
- adverse selection,
- unavailable low-latency execution.

Paper gate:

- paper only with realistic fill assumptions;
- model maker/taker fees;
- cap inventory.

## Minimum viable crypto paper book

Each paper strategy should persist:

```json
{
  "strategy_id": "crypto-time-series-momentum-v0",
  "universe": ["BTC", "ETH", "SOL"],
  "signal_inputs": ["return_24h", "return_7d", "volume_24h", "trend_rank"],
  "entry_rule": "return_7d > 5% and volume_24h > threshold and source_score >= 3",
  "exit_rule": "trailing_stop_5pct OR signal_rank_drop OR max_hold_7d",
  "position_size": "paper_notional <= 10% book equity",
  "fees_bps": 20,
  "slippage_bps": 20,
  "benchmark": "BTC buy-and-hold",
  "execution_mode": "autonomous",
  "risk_policy_ref": "bss.paper.risk.v1",
  "idempotency_key": "[deterministic action key]"
}
```

## Backtest and forward-test workflow

1. **Freeze the hypothesis** before looking at outcomes.
2. Pull OHLCV and metadata into immutable date-partitioned files.
3. Include fees, slippage, stale candles, and delisted assets.
4. Split by time: train/design period, validation period, untouched test period.
5. Compare to simple benchmarks: cash, BTC, ETH, equal-weight BTC/ETH/SOL.
6. Report CAGR, Sharpe/Sortino, max drawdown, win rate, turnover, exposure, and worst trade.
7. Forward-paper trade for at least 30-90 days before considering anything live.
8. Promote only if it survives slippage, drawdown, and no-trade benchmark comparison.

## BSS guardrails

- No real-money execution from Mosaic & Murmurs.
- No leverage in paper strategy v0 unless specifically testing funding/basis mechanics.
- No small-cap token paper buys without liquidity and manipulation checks.
- Every `PAPER BUY` / `PAPER SELL` must have exit criteria.
- Missing data means `stale`, not "assume unchanged."
- Social-only signals can produce `WATCH`, not buy/sell.
- Strategy performance must be measured per-book, not cherry-picked from individual wins.

## Implementation backlog

1. Add configurable crypto strategy definitions under `config/crypto-paper-strategies.json`.
2. Add historical OHLCV cache and deterministic backtest harness.
3. Track benchmark equity curves per book.
4. Add fees/slippage parameters to the paper ledger.
5. Add source-score thresholds before paper actions.
6. Add drawdown kill switch: stop new paper entries after max drawdown breach.
