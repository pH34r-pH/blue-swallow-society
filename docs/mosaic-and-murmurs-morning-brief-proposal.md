# Proposal: Mosaic & Murmurs Morning Brief

**Status:** Implemented P1 local scheduled brief
**Date:** 2026-07-11
**Scope:** Blue Swallow Society / Tzeentch / Mosaic & Murmurs / paper treasury
**Related doctrine:** [`docs/mosaic-and-murmurs-operating-doctrine.md`](./mosaic-and-murmurs-operating-doctrine.md)
**Related implementation:** [`Morning Brief Implementation`](./mosaic-and-murmurs-morning-brief-implementation.md)
**Related proposals:** [`Dream Consolidation`](./mosaic-and-murmurs-dream-consolidation-proposal.md), [`S0 Sensorium`](./mosaic-and-murmurs-s0-sensorium-proposal.md), [`Paper Memory Loop`](./mosaic-and-murmurs-paper-memory-loop.md)

## Executive summary

The **daily morning brief** is the wake output for Mosaic & Murmurs: a scheduled operator update that turns the overnight intake/dream cycle into one readable signal packet before the live day starts.

It blends three lanes:

1. **Mosaic / breaking reality:** high-salience breaking news and material facts, with priority for the United States and Washington State.
2. **Murmurs / hype weather:** rising viral trends, meme velocity, platform jumps, and hype waves that may not be true but are starting to move attention.
3. **Bridge / paper treasury:** paper positions, new paper buy/sell proposals, and per-book up/down performance.

The brief should end with a hard **paper book footer**: every open paper book, current exposure, new paper orders, daily PnL, cumulative PnL, and drawdown. No real-money execution is implied or permitted.

## Goals

1. Deliver a daily morning update with enough context to decide what deserves attention first.
2. Prioritize breaking or materially updated stories relevant to the US, Washington State, Seattle/Bellevue/Redmond, and the operator's known work/life context.
3. Surface rising public-perception waves before they fully become mainstream news.
4. Connect news/trend deltas to paper-only market theses without laundering hype into fact.
5. Report per-book paper performance: up/down direction, absolute delta, percentage delta, open risk, and drawdown.
6. Emit and autonomously apply paper `buy`, `sell`, `avoid`, or `watch` decisions only with evidence, counter-evidence, expiry, idempotency, and machine-enforced risk-policy state.
7. Keep provenance, confidence, source class, and retrieval time visible enough for audit.

## Non-goals

- No autonomous real trades, bets, purchases, transfers, or account-bound writes.
- No personalized financial advice; this is paper-only research and calibration.
- No private-message scraping, credentialed feed harvesting, or bypass of API/source terms.
- No panic feed: the morning brief is ranked, bounded, and caveated rather than an infinite doom scroll.
- No claim that virality equals truth.
- No persistent storage of unnecessary PII from news/social sources.

## Schedule and delivery

Default schedule:

```text
06:30 America/Los_Angeles daily
  -> collect since previous successful brief
  -> merge overnight dream/consolidation output
  -> rank breaking news + hype waves
  -> compute paper book footer
  -> deliver operator-facing brief
  -> persist machine-readable run manifest
```

The exact delivery channel is configurable: local markdown, Discord/home channel, email, dashboard card, or all of those after review.

## Input lanes

### Mosaic: breaking reality

Preferred source classes:

- official US and Washington State sources: governor, legislature, agencies, emergency management, courts/elections where relevant
- Seattle/Bellevue/Redmond/King County public sources when locally material
- reputable national/international news wires and public RSS feeds
- market/event primary sources: filings, official releases, on-chain data, Polymarket/Gamma market metadata, CoinGecko/market data where allowed
- Cybermap/RaID/Greenfeed/direct-observation summaries when a local event has a geospatial footprint

Mosaic ranks for materiality, proximity, novelty, source quality, and outcome relevance.

### Murmurs: viral and hype weather

Preferred source classes:

- public trend endpoints and RSS feeds where terms allow
- public social/search trend surfaces where API or manual retrieval is permitted
- Hacker News / Reddit / YouTube / TikTok / X / Bluesky style public signals where allowed by source terms
- meme/image/video trend summaries when legally accessible
- prediction-market chatter and crypto discourse only as public-perception evidence, not truth evidence

Murmurs ranks for velocity, acceleration, source diversity, platform jump, emotional charge, remix/meme mutation, and likely manipulation.

### Bridge: paper treasury

Required inputs:

- paper ledger state from local DB/JSON/Postgres table
- open paper positions by book
- closed/resolved paper positions and realized paper PnL
- current paper marks/prices from allowed market-data adapters
- proposed order candidates from the delta bridge
- risk limits, cooldowns, autonomous execution status, and idempotency state

## Morning brief shape

```text
MOSAIC & MURMURS MORNING BRIEF — YYYY-MM-DD HH:MM PT
As-of: <timestamp> | Window: <start> -> <end> | Sources scanned: <n>

1. Breaking reality — Mosaic
   - WA/US/Global priority items with source, confidence, and why it matters.

2. Hype weather — Murmurs
   - rising viral waves, meme mutations, platform jumps, and manipulation caveats.

3. Perceptual deltas — Bridge
   - where truth, public belief, and market-implied belief are separating.

4. New paper actions
   - PAPER BUY / PAPER SELL / WATCH / AVOID candidates with evidence and expiry.

5. Paper book footer
   - per-book open exposure, daily PnL, cumulative PnL, drawdown, and status.
```

The operator-facing version should be compact. The manifest can be verbose.

## Paper book footer

Every brief ends with a per-book table:

| Book | Open positions | Gross paper exposure | Daily PnL | Cumulative PnL | Drawdown | New actions | Status |
|---|---:|---:|---:|---:|---:|---|---|
| `prediction_markets` | 0 | `$0 paper` | `$0 / 0.0%` | `$0 / 0.0%` | `0.0%` | `none` | `flat` |
| `crypto` | 0 | `$0 paper` | `$0 / 0.0%` | `$0 / 0.0%` | `0.0%` | `none` | `flat` |
| `equity_watch` | 0 | `$0 paper` | `$0 / 0.0%` | `$0 / 0.0%` | `0.0%` | `watch only` | `no execution` |
| `local_event_watch` | 0 | `$0 paper` | `$0 / 0.0%` | `$0 / 0.0%` | `0.0%` | `watch only` | `no execution` |
| `ai_cyber_watch` | 0 | `$0 paper` | `$0 / 0.0%` | `$0 / 0.0%` | `0.0%` | `watch only` | `flat` |

Book names are configurable. The brief must still report **each configured book** even if the book is flat.

### New paper action card

```text
PAPER BUY — prediction_markets — <instrument_ref>
Paper size: <units or paper dollars>
Entry condition: <condition>
Exit/expiry: <condition/date>
Mosaic thesis: <evidence-bound claim>
Murmurs signal: <perception/hype movement>
Bridge delta: <truth/perception/market gap>
Counter-evidence: <why this could be wrong>
Execution: autonomous; risk_policy: passed; idempotency: <key>
```

Use `PAPER SELL` for exits/reductions, `WATCH` for no-entry monitoring, and `AVOID` for hype that outruns truth.

## Data model sketch

```ts
type MorningBriefRun = {
  id: string;
  runDate: string;
  timezone: 'America/Los_Angeles';
  window: { start: string; end: string };
  generatedAt: string;
  deliveryTargets: string[];
  sourceCounts: Record<string, number>;
  status: 'draft' | 'delivered' | 'failed' | 'review_required';
};

type BriefNewsItem = {
  id: string;
  scope: 'washington_state' | 'us' | 'global' | 'operator_context';
  title: string;
  summary: string;
  whyItMatters: string;
  sourceRefs: string[];
  confidence: 'low' | 'medium' | 'high';
  materialityScore: number;
  caveats: string[];
};

type HypeWave = {
  id: string;
  title: string;
  platforms: string[];
  entities: string[];
  velocityScore: number;
  accelerationScore: number;
  sourceDiversityScore: number;
  manipulationRisk: 'low' | 'medium' | 'high';
  truthStatus: 'unknown' | 'unsupported' | 'partly_supported' | 'supported' | 'contradicted';
  relatedMarkets: string[];
  caveats: string[];
};

type PaperBookSummary = {
  book_id: 'prediction_markets' | 'crypto' | 'equity_watch' | 'local_event_watch' | 'ai_cyber_watch';
  display_name: string;
  starting_balance: 1000;
  open_position_count: number;
  gross_paper_exposure: number;
  daily_pnl: number;
  daily_pnl_pct: number;
  cumulative_pnl: number;
  cumulative_pnl_pct: number;
  drawdown_pct: number;
  stale_open_marks: number;
  status: 'flat' | 'up' | 'down' | 'mixed' | 'stale' | 'review_required';
};

type PaperActionCandidate = {
  candidate_id: string;
  action: 'PAPER_BUY' | 'PAPER_SELL' | 'WATCH' | 'AVOID';
  book_id: string;
  instrument_type: 'prediction_market' | 'crypto' | 'equity_watch' | 'local_event_watch' | 'other_paper_only';
  instrument_ref: string;
  paper_size: number;
  thesis: string;
  evidence_refs: string[];
  counter_evidence_refs: string[];
  entry_condition?: string;
  exit_condition?: string;
  expires_at: string;
  confidence: 'low' | 'medium' | 'high';
  autonomous_execution: true;
  risk_policy_passed: true;
  idempotency_key: string;
  paper_only: true;
};
```

## Ranking policy

Breaking-news rank:

```text
priority = recency
         + materiality
         + WA/US/operator proximity boost
         + source reliability
         + market/event coupling
         + direct-observation relevance
         - duplicate/low-confidence penalty
```

Hype-wave rank:

```text
hype = velocity
     + acceleration
     + cross-platform spread
     + meme mutation
     + prediction-market/asset coupling
     - manipulation/bot suspicion penalty
```

Bridge rank prefers deltas where Mosaic confidence, Murmurs velocity, and market lag create a falsifiable paper thesis. If the crowd moves faster than evidence, the preferred action is often `avoid` or `paper_sell`, not chase.

## Governance

- Every action is autonomous and paper-only, with machine-enforced capital, exposure, drawdown, cooldown, stale-data, and idempotency controls; no per-action human review gate exists.
- The brief must distinguish `reported fact`, `official statement`, `unverified claim`, `viral narrative`, and `market-implied belief`.
- US/WA relevance is a ranking boost, not a filter; global events can lead if materially important.
- Social/trend sources are public-perception inputs; they do not promote to Mosaic fact memory without evidence.
- Delivery must include a source manifest and generated-at timestamp.
- If market data is stale or unavailable, the paper footer reports `stale` and suppresses new paper orders for affected books.
- Any future real-money cutover requires a separate spec and explicit user-mediated approval path.

## Implementation plan

### P0 — Manual morning markdown

- Create a reusable morning brief template.
- Pull paper book state from a local JSON/markdown ledger if no DB exists yet.
- Manually paste/source-link news and hype items into the manifest.
- Compute per-book paper PnL with a small script and include stale-data markers.

### P1 — Scheduled local brief

- Run daily through Hermes cron or a BSS scheduler at the configured morning time.
- Read source summaries produced by the dream cycle, Tzeentch, Cybermap, and paper ledger.
- Deliver one compact operator brief plus one machine-readable manifest.
- Preserve source counts, skipped sources, and retrieval errors.

### P2 — Integrated adapters

- Add source adapters for selected US/WA official feeds, public news feeds, public trend signals, Polymarket/Gamma, CoinGecko, and any licensed market data.
- Normalize items into `BriefNewsItem`, `HypeWave`, `PaperBookSummary`, and `PaperActionCandidate` records.
- Add tests that stale market marks suppress new paper orders.
- Add dashboard cards for morning brief history and per-book performance.

### P3 — Calibration and feedback

- Score each morning brief after the day closes: missed stories, false hype, paper thesis outcome, source reliability changes.
- Feed results into Mosaic calibration and Murmurs source behavior notes.
- Let repeated misses create source/backlog proposals rather than silent threshold drift.

## Acceptance criteria

- A brief is produced once per configured morning window.
- The brief includes breaking news with explicit US/WA relevance ranking.
- The brief includes rising viral trends/hype waves as perception states, not facts.
- The brief includes perceptual deltas that connect news/trends to markets only when source evidence supports the link.
- The brief ends with a per-book paper footer showing up/down direction and magnitude.
- New paper buy/sell decisions include book, instrument, paper size, evidence, counter-evidence, entry/exit logic, expiry, risk-policy result, and idempotency key.
- Stale or missing market data prevents new paper orders for affected books and marks affected PnL as stale.
- No real-money, account-bound, social-posting, or physical actions execute from the brief.

## Open questions

1. What is the default delivery target: Discord home channel, local vault note, email, dashboard, or all?
2. What exact source seed list should P0 use for Washington State and Seattle-area alerts?
3. Which market-data adapters and mark-price rules should each canonical five-book lane trust at launch?
4. Should weekends use the same format or a lighter weekend watch mode?
5. What PnL basis should paper books use when market data is closed, delayed, or stale?
