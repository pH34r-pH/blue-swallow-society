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
  -> research material gaps with Hermes web search and the Obscura-backed browser
  -> keep Mosaic evidence and Murmurs perception as separate projections
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

## Agent research tools

The morning-brief job (`d2f6bc9e8c5f`) is configured with:

- toolsets: `web`, `browser`, `file`, `terminal`, `skills`;
- skills: `bss-mosaic-murmurs-research-radar`, `intelligence-briefing`, `privacy-preserving-osint`;
- browser provider: Hermes `browser-obscura` plugin backed by Obscura `0.1.9` on Linux ARM64.

The fixed collector remains the reproducible baseline. The cron agent may independently search for counter-evidence, investigate high-salience gaps, and propose new public sources. Rendered pages go through the Hermes browser abstraction and therefore the configured Obscura provider.

The raw Obscura MCP server is not registered. Its full surface includes page evaluation, form, cookie, and storage-state tools that are unnecessary for the read-only research lane and would be injected more broadly than this one job.

Research policy is public HTTP(S) and read-only: no private-network override, localhost/private/metadata targets, authentication, profile or cookie reuse, forms, uploads, downloads, arbitrary page evaluation, access-control bypass, or account-bound actions. Every material web claim requires a URL and retrieval timestamp. Newly discovered recurring sources remain quarantined candidates until policy and source-health checks promote them.

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

The launch ledger is the 24-book Cartesian product of three aggression lines (`standard`, `aggressive`, `hyper_aggressive`) and eight strategies (`prediction_markets`, `crypto`, `equity_watch`, `local_event_watch`, `ai_cyber_watch`, `cross_asset_momentum`, `contrarian_reversion`, `volatility_barbell`). Every book starts independently with `$1,000` invested and `$1,000` banked.

Open positions are owned by the scheduled paper engine and materialized in `~/.hermes/mosaic-murmurs/paper-memory-loop/paper-ledger.json`; `config/mosaic-murmurs-paper-ledger.json` is the clean schema-v4 seed. A position without a current `mark_price` marks its book `stale`. Mosaic and Murmurs execute paper actions autonomously after machine-enforced paper-only, freshness, profile sizing, no-leverage, no-negative-cash, and idempotency checks pass. There is no defensive drawdown/daily-loss cash-out. A zero-balance book stops and requires a postmortem. The job never writes to exchange, wallet, brokerage, social, or prediction-market accounts.

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
2. Use independent web research to test high-salience claims, contradictions, and source gaps; do not merely restate the packet.
3. Emit sections: Mosaic breaking reality, Murmurs hype weather, Bridge perceptual deltas, New source candidates, New paper actions, Paper book footer, Source manifest.
4. Label facts, official statements, viral narratives, market-implied belief, and unknown/stale data separately.
5. Treat generated prose as analysis, not a persisted paper fill; the deterministic ledger remains canonical.
6. Keep all actions paper-only and autonomously executable only after machine-enforced freshness, profile sizing, no-leverage, no-negative-cash, and idempotency checks pass.
7. Suppress buy/sell actions when the affected book or market data is stale.
8. Include the manifest path, generated-at timestamp, and URLs/timestamps for additional web research.

## Verification

```bash
python3 scripts/mosaic-murmurs-morning-brief-collect.py --news-limit 3 --hype-limit 3 --market-limit 3
python3 -m unittest tests.morning_brief_collect_test
```
