# Mosaic & Murmurs Source Expansion Research

**Status:** Initial research note with P1 collector expansion
**Date:** 2026-07-11
**Scope:** Public-source news, social, trend, security, crypto, and local WA/Seattle/Bellevue/Redmond coverage
**Implementation:** [`scripts/mosaic-murmurs-morning-brief-collect.py`](../scripts/mosaic-murmurs-morning-brief-collect.py)

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
