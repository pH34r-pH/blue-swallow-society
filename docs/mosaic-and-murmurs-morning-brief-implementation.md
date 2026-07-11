# Mosaic & Murmurs Morning Brief Implementation

**Status:** Implemented P1 local scheduled brief
**Implemented:** 2026-07-11
**Proposal:** [`mosaic-and-murmurs-morning-brief-proposal.md`](./mosaic-and-murmurs-morning-brief-proposal.md)

## Runtime shape

The morning brief now runs as a Hermes cron job named `mosaic-murmurs-morning-brief` (`d2f6bc9e8c5f`) on the local scheduler:

```text
30 6 * * * America/Los_Angeles local scheduler time
  -> run scripts/mosaic-murmurs-morning-brief-collect.py
  -> inject the collector JSON into the cron agent prompt
  -> optionally include the latest daily dream-cycle output as context
  -> deliver the operator-facing brief to the origin Discord chat
```

The collector is dependency-free Python and can be run manually:

```bash
python3 scripts/mosaic-murmurs-morning-brief-collect.py
python3 scripts/mosaic-murmurs-morning-brief-collect.py --full
```

## Persistent artifacts

- Collector script: [`scripts/mosaic-murmurs-morning-brief-collect.py`](../scripts/mosaic-murmurs-morning-brief-collect.py)
- Paper ledger seed: [`config/mosaic-murmurs-paper-ledger.json`](../config/mosaic-murmurs-paper-ledger.json)
- Runtime manifests: `~/.hermes/mosaic-murmurs/morning-brief/runs/morning-brief-YYYY-MM-DD.json`
- Runtime state: `~/.hermes/mosaic-murmurs/morning-brief/state.json`

The repo tracks the empty paper-ledger seed only. Daily manifests are runtime artifacts outside the repo.

## Source lanes

### Mosaic / breaking reality

The collector currently polls public, non-credentialed sources:

- Google News US top stories
- Google News WA/Seattle/Bellevue/Redmond query
- Google News AI/cyber/markets query
- Seattle Times local feed
- Seattle Mayor blog
- Washington State Standard
- GeekWire
- NPR News
- CISA advisories
- SEC press releases
- Federal Reserve press releases
- NWS active WA alerts
- Krebs on Security
- Schneier on Security
- The Record
- GitHub Blog
- OpenAI Blog

### Murmurs / hype weather

The collector currently polls public trend and forum surfaces:

- Google Trends US RSS
- Hacker News front page via Algolia
- Hacker News Microsoft, AI, cybersecurity, and crypto searches via Algolia
- Lobsters RSS
- Slashdot RSS
- Product Hunt feed
- Mastodon hashtag RSS for `ai`, `cybersecurity`, and `crypto`

Reddit JSON endpoints were intentionally omitted from the scheduled source list after returning HTTP 403 from this runtime; add them back only through an allowed API path or credentialed adapter. Bluesky search also returned HTTP 403 from this runtime during research; add through an authenticated/app-password adapter if needed.

### Bridge / market signals

The collector currently polls read-only public market endpoints:

- Polymarket Gamma active markets ranked by 24h volume
- CoinGecko trending coins
- CoinGecko BTC/ETH/SOL market snapshots

## Paper ledger semantics

The launch ledger has four flat books:

- `prediction_markets`
- `crypto`
- `equity_watch`
- `local_event_watch`

Open positions can be added manually to `config/mosaic-murmurs-paper-ledger.json`. A position without a current `mark_price` marks its book `stale`; stale books suppress new buy/sell candidates in the operator-facing brief. The job is paper-only and never writes to exchange, wallet, brokerage, social, or prediction-market accounts.

Minimal position shape:

```json
{
  "instrument_ref": "example-market-or-asset",
  "side": "yes",
  "quantity": 100,
  "entry_price": 0.42,
  "previous_mark_price": 0.44,
  "mark_price": 0.46,
  "paper_notional": 42.0,
  "opened_at": "2026-07-11T00:00:00Z"
}
```

## Cron prompt contract

The cron agent must:

1. Use only the collector packet and injected dream-cycle context as evidence unless it explicitly performs additional source retrieval.
2. Emit sections: Mosaic breaking reality, Murmurs hype weather, Bridge perceptual deltas, New paper actions, Paper book footer, Source manifest.
3. Label facts, official statements, viral narratives, market-implied belief, and unknown/stale data separately.
4. Keep all actions paper-only and `human_review_required`.
5. Suppress buy/sell actions when the affected book or market data is stale.
6. Include the manifest path and generated-at timestamp.

## Verification

```bash
python3 scripts/mosaic-murmurs-morning-brief-collect.py --news-limit 3 --hype-limit 3 --market-limit 3
python3 -m unittest tests.morning_brief_collect_test
```
