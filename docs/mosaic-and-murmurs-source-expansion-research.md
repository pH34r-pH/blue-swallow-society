# Mosaic & Murmurs Source Expansion Research

**Status:** P1 collector plus Obscura-backed Hermes web research
**Date:** 2026-07-11; research transport revised 2026-07-13
**Scope:** Public-source news, social, trend, security, crypto, and local WA/Seattle/Bellevue/Redmond coverage
**Implementation:** [`scripts/mosaic-murmurs-morning-brief-collect.py`](../scripts/mosaic-murmurs-morning-brief-collect.py) plus Hermes cron job `d2f6bc9e8c5f`

## Current implemented coverage

The morning brief collector now scans 32 public, non-credentialed source definitions. Runtime smoke test after expansion returned zero source errors.

### Mosaic / breaking reality

Implemented:

- Google News US top stories
- Google News WA/Seattle/Bellevue/Redmond query
- Google News AI/cyber/markets query
- Seattle Times local feed
- Seattle Mayor Blog
- Washington State Standard
- GeekWire
- NPR News
- CISA cybersecurity advisories
- SEC press releases
- Federal Reserve press releases
- NWS active WA alerts
- Krebs on Security
- Schneier on Security
- The Record
- GitHub Blog
- OpenAI Blog

### Murmurs / hype weather

Implemented:

- Google Trends US RSS
- Hacker News front page via Algolia
- Hacker News Microsoft search via Algolia
- Hacker News AI search via Algolia
- Hacker News cybersecurity search via Algolia
- Hacker News crypto search via Algolia
- Lobsters RSS
- Slashdot RSS
- Product Hunt feed
- Mastodon public hashtag RSS for `ai`, `cybersecurity`, and `crypto`

### Bridge / market signals

Implemented:

- Polymarket Gamma active markets ranked by 24h volume
- CoinGecko trending coins
- CoinGecko BTC/ETH/SOL market snapshots

## Source caveats from live tests

- Reddit public JSON returned HTTP 403 from this runtime. Treat Reddit as a credentialed/API adapter, not a no-auth scheduled scrape.
- Bluesky public search returned HTTP 403 from this runtime. Use official authenticated API/app-password path if added.
- GDELT returned HTTP 429 during one probe. It is useful but needs throttling/backoff.
- BleepingComputer, SecurityWeek, MSRC blog feed, and some Microsoft pages rejected no-auth requests or served unexpected content from this runtime. Revisit with allowed APIs or alternate feeds.
- Mastodon hashtag feeds may return zero items for a tag at collection time; that is not necessarily an error.

## Reddit expansion plan

If we add a credentialed Reddit adapter, prioritize subreddits by lane and risk.

### Local / WA / Seattle

- `r/Seattle`
- `r/SeattleWA`
- `r/Washington`
- `r/BellevueWA`
- `r/Redmond`
- `r/Microsoft`
- `r/Azure`

### AI / software / security

- `r/LocalLLaMA`
- `r/MachineLearning`
- `r/artificial`
- `r/OpenAI`
- `r/singularity`
- `r/programming`
- `r/netsec`
- `r/cybersecurity`
- `r/privacy`
- `r/selfhosted`

### Markets / crypto / macro

- `r/CryptoCurrency`
- `r/Bitcoin`
- `r/ethereum`
- `r/solana`
- `r/defi`
- `r/wallstreetbets`
- `r/stocks`
- `r/investing`
- `r/options`
- `r/economy`

### Politics / narrative velocity

- `r/politics`
- `r/moderatepolitics`
- `r/PoliticalDiscussion`
- `r/Conservative`
- `r/neoliberal`
- `r/Ask_Politics`

Guardrail: subreddit signals are narrative/weather, not truth. Do not make paper actions from Reddit alone.

## Additional high-value public sources

### US/federal politics and government

- Federal Register API: <https://www.federalregister.gov/developers/documentation/api/v1>
- Congress.gov API/docs: <https://api.congress.gov/>
- GovTrack current Congress API: <https://www.govtrack.us/api/v2/role?current=true&limit=600>
- DOJ news: <https://www.justice.gov/news>
- FTC news: <https://www.ftc.gov/news-events/news>
- CFPB news: <https://www.consumerfinance.gov/about-us/newsroom/>
- White House briefing room feed/pages: <https://www.whitehouse.gov/briefing-room/>

### Washington State / local

- Washington Legislature bill info: <https://app.leg.wa.gov/billinfo/>
- Washington PDC: <https://www.pdc.wa.gov/political-disclosure-reporting-data>
- Washington Attorney General news: <https://www.atg.wa.gov/news>
- King County news: <https://kingcounty.gov/en/dept/executive/governance-leadership/king-county-executive/news>
- Bellevue news: <https://bellevuewa.gov/city-news>
- Redmond news: <https://www.redmond.gov/CivicAlerts.aspx>
- Puget Sound Business Journal, if accessible through a licensed path.

### AI / tech / security

- Anthropic News page if RSS/API becomes available: <https://www.anthropic.com/news>
- Google DeepMind blog: <https://deepmind.google/discover/blog/>
- Meta AI blog: <https://ai.meta.com/blog/>
- Microsoft Security Response Center API: <https://api.msrc.microsoft.com/cvrf/v3.0/updates>
- GitHub Security Advisories: <https://github.com/advisories>
- NVD API: <https://nvd.nist.gov/developers/vulnerabilities>
- Cloudflare blog: <https://blog.cloudflare.com/rss/>
- Trail of Bits blog: <https://blog.trailofbits.com/feed/>

### Viral/trend/social

- Product Hunt: <https://www.producthunt.com/feed>
- HN Algolia: <https://hn.algolia.com/api>
- Lobsters: <https://lobste.rs/rss>
- Slashdot: <https://rss.slashdot.org/Slashdot/slashdotMain>
- Mastodon tag RSS, per-instance and per-tag.
- Bluesky API, authenticated/app-password path only.
- YouTube Data API for channel/trending signals, credentialed path only.
- TikTok/X/Instagram only through allowed APIs or licensed data providers.

### Market / crypto / prediction

- CoinGecko: <https://www.coingecko.com/en/api>
- DeFiLlama: <https://defillama.com/docs/api>
- Coinbase Exchange API: <https://docs.cdp.coinbase.com/exchange/docs/welcome>
- Kraken API: <https://docs.kraken.com/api/>
- Binance public market data, if jurisdiction/terms allow.
- Polymarket Gamma API, read-only public market metadata.

## Schema additions to capture

Add these optional fields to source items when available:

- `platforms`: social platforms or feed families.
- `geo_scope`: `seattle`, `king_county`, `washington_state`, `us`, `global`.
- `actor_refs`: officials, companies, agencies, protocols, tickers.
- `instrument_refs`: stocks, crypto symbols, Polymarket slugs, ETF/proxy instruments.
- `engagement`: points, score, comments, reposts, likes, volume, trend rank.
- `first_seen_at`, `last_seen_at`, `retrieved_at`.
- `source_reliability`: `official`, `primary`, `reported`, `aggregator`, `forum`, `market`.
- `actionability`: `none`, `watch`, `paper_candidate`, `avoid`.

## Source scoring

| Score | Meaning | Example |
|---:|---|---|
| 5 | Primary official fact | SEC, CISA, NWS, WA PDC, Congress.gov |
| 4 | Primary institutional publication | Microsoft blog, GitHub blog, OpenAI blog |
| 3 | Professional reporting | Seattle Times, GeekWire, Washington State Standard, NPR |
| 2 | Aggregator or market-implied pointer | Google News, Polymarket, CoinGecko trending |
| 1 | Public forum/social weather | HN, Reddit, Mastodon, Product Hunt |

Brief rule: paper actions need at least one score-3+ source, unless the action is explicitly about social velocity and remains `WATCH`.

## Implementation next steps

1. Add source definitions to a JSON/YAML config so code changes are not required for every feed.
2. Add per-source rate limits and backoff.
3. Add dedupe by canonical URL and title similarity.
4. Add a small source-health report to each morning brief.
5. Add optional credentialed adapters for Reddit, Bluesky, YouTube, and X only if API credentials and terms are acceptable.

## Obscura-backed autonomous web research — active decision

Decision date: `2026-07-13`

### Decision

Wigolo is rejected as a Blue Swallow dependency and has been decommissioned from this host. No Wigolo package, executable, service, container, or Hermes MCP server was installed; the audit clone, runtime/model cache, smoke-test state, and targeted npm metadata were removed. The rejected audit remains source-pinned to `KnockOutEZ/wigolo` commit `752bddbe55067941d42baa562ed43472eea36c0f` so the decision is reproducible without carrying the runtime.

For the capability Blue Swallow actually needs, use the existing Hermes research stack:

```text
fixed public-source collector
        +
Hermes web search/extraction for discovery
        +
Hermes browser tool -> Obscura for rendered public pages
        +
BSS evidence/provenance and Mosaic/Murmurs projections
```

Obscura is the browser/acquisition layer, not a search engine, truth engine, citation database, or evidence store. Hermes skills provide research procedure; Blue Swallow owns source policy, provenance, confidence, and durable evidence.

### Runtime wiring

The scheduled Hermes job `mosaic-murmurs-morning-brief` (`d2f6bc9e8c5f`) now has:

- toolsets: `web`, `browser`, `file`, `terminal`, `skills`;
- skills: `bss-mosaic-murmurs-research-radar`, `intelligence-briefing`, `privacy-preserving-osint`;
- workdir: `/home/ph3/repos/blue-swallow-society`;
- browser provider: Hermes plugin `browser-obscura` using Obscura `0.1.9` on Linux ARM64.

The collector packet remains the deterministic baseline. The agent may independently investigate high-salience gaps, contradictory claims, and candidate sources with web search and Obscura-backed browsing before writing the brief.

The Obscura MCP server is deliberately **not** registered with Hermes. Its raw tool surface includes page evaluation, form filling, cookie access, and storage-state import/export. Registering it would inject that broader surface globally. The existing Hermes browser provider gives the required rendered-page access while retaining Hermes URL policy and per-job toolset control.

### Inquiry and transport policy

- Public HTTP(S), read-only research only.
- Keep Obscura's private-network block enabled. Never use `--allow-private-network` or `OBSCURA_ALLOW_PRIVATE_NETWORK=1` for agent research.
- No localhost, RFC1918, link-local, metadata endpoints, internal DNS, local files, authenticated profiles, cookie extraction, storage-state reuse, form submission, uploads, downloads, arbitrary page evaluation, purchases, posts, comments, or messages.
- Do not bypass robots, source terms, paywalls, CAPTCHAs, or access controls.
- Record a URL and retrieval timestamp for every material web claim. Label inaccessible, stale, contradictory, or unresolved evidence explicitly.
- Treat snippets as discovery pointers. Mosaic claims require fetched primary/official or reputable reported evidence; Murmurs may retain public narrative signals without converting repetition into truth.
- Newly discovered recurring sources remain candidates. Use the lifecycle `discovered -> quarantined -> policy checked -> sampled -> scored -> active|blocked`; the agent does not auto-enroll them.
- Keep generated prose separate from canonical paper fills and deterministic ledger state.

### Projection contract

**Mosaic**

- asks what observation would reduce uncertainty most;
- searches for primary/official evidence and counter-evidence;
- retains contradictions and provenance;
- never converts search rank, citation presence, or repetition into truth confidence.

**Murmurs**

- searches adjacent public communities, formats, and narratives;
- records stance, repetition, novelty, velocity, audience, and manipulation risk;
- may preserve low-authority signals as perception evidence;
- cannot promote popularity into Mosaic without independent evidence.

Shared retrieved bytes are acceptable. Shared conclusions and shared confidence are not.

### Verification

Verified on `2026-07-13`:

- `obscura --version` returned `0.1.9`;
- a loopback-only Obscura CDP smoke endpoint returned Chrome protocol `1.3` and a `127.0.0.1` WebSocket URL;
- a fresh Hermes process resolved `ObscuraBrowserProvider` with `configured: true`;
- fresh-process `browser_navigate` and `browser_snapshot` loaded `https://example.com/` and returned `Example Domain`;
- the morning-brief cron job lists the three research skills and five constrained toolsets above;
- Hermes has no MCP servers configured, so no Wigolo or raw Obscura MCP surface is globally injected.
