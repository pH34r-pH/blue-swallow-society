# Public Official and Political Signal Radar

**Status:** Initial research note
**Date:** 2026-07-11
**Scope:** Federal and Washington State public officials, public ethics/trading/campaign/procurement signals
**Use:** Mosaic & Murmurs public-source monitoring and paper-only thesis generation

## Operating stance

This workflow watches public officials and public records. It must not use private information, leaked material, intimidation, impersonation, credentialed scraping, or coordinated market manipulation. It can generate **paper-only** hypotheses about public narratives and market-implied belief.

The goal is not "which party is bad." The goal is a source-backed evidence ledger that tracks official actions, disclosures, money flows, contracts, enforcement events, and public narratives with timestamped provenance.

## Official registry targets

### Federal elected officials

Core roster:

- Congress members via GovTrack API: <https://www.govtrack.us/api/v2/role?current=true&limit=600>
- Congress member pages and bills via Congress.gov: <https://www.congress.gov/>
- Community-maintained congressional metadata: <https://github.com/unitedstates/congress-legislators>
- Biographical Directory: <https://bioguide.congress.gov/>

Fields to normalize:

- `official_id`, `source_ids`, `name`, `party`, `state`, `district`, `chamber`, `current_role`, `term_start`, `term_end`, `official_url`, `social_handles`, `committee_assignments`.

### Federal executive and agency officials

Source classes:

- White House administration pages and cabinet releases: <https://www.whitehouse.gov/administration/>
- Federal Register agency/action data: <https://www.federalregister.gov/developers/documentation/api/v1>
- Office of Government Ethics public financial disclosure: <https://www.oge.gov/>
- Senate nominations and confirmations via Congress.gov: <https://www.congress.gov/nomination>

Fields:

- `agency`, `office`, `nomination_status`, `confirmation_date`, `ethics_agreement_url`, `financial_disclosure_url` where public.

### Washington State officials

Core state registry:

- Washington Legislature members: <https://leg.wa.gov/legislators/>
- Washington Legislature bill and committee materials: <https://app.leg.wa.gov/billinfo/>
- Governor / executive cabinet: <https://governor.wa.gov/office-governor/executive-cabinet>
- Washington Secretary of State elections/candidate materials: <https://www.sos.wa.gov/elections>
- Washington Public Disclosure Commission: <https://www.pdc.wa.gov/political-disclosure-reporting-data>
- Washington public data portal: <https://data.wa.gov/>

Fields:

- `official_id`, `name`, `party`, `district`, `office`, `chamber`, `committee_assignments`, `campaign_committee_ids`, `pdc_candidate_id`, `official_url`.

## Money, disclosure, and ethics sources

### Personal financial/trading disclosures

- House Clerk financial disclosures: <https://disclosures-clerk.house.gov/FinancialDisclosure>
- Senate eFD search: <https://efdsearch.senate.gov/search/>
- OGE disclosures for executive branch officials: <https://www.oge.gov/>
- Third-party normalized views, with verification required before use:
  - Quiver Quant Congress Trading: <https://www.quiverquant.com/congresstrading/>
  - Capitol Trades: <https://www.capitoltrades.com/>
  - Unusual Whales politics data: <https://unusualwhales.com/politics>

Normalization rule: third-party trading dashboards are **pointers**, not primary evidence. Any `PAPER BUY`/`PAPER SELL` thesis must link the primary disclosure or be downgraded to `WATCH`.

### Campaign money

- FEC campaign finance data and bulk downloads: <https://www.fec.gov/data/browse-data/?tab=bulk-data>
- FEC API docs: <https://api.open.fec.gov/developers/>
- Washington PDC reporting data: <https://www.pdc.wa.gov/political-disclosure-reporting-data>

### Procurement, grants, and contracts

- USAspending API: <https://api.usaspending.gov/>
- SAM.gov entity/contract notices: <https://sam.gov/>
- Federal procurement data resources: <https://www.fpds.gov/>
- Washington procurement / DES contracts: <https://des.wa.gov/services/contracting-purchasing>
- Washington data portal: <https://data.wa.gov/>

### Enforcement and ethics

- DOJ press releases: <https://www.justice.gov/news>
- SEC press releases: <https://www.sec.gov/newsroom/press-releases>
- House Ethics Committee: <https://ethics.house.gov/>
- Senate Ethics Committee: <https://www.ethics.senate.gov/>
- Office of Congressional Ethics: <https://oce.house.gov/>
- Washington Executive Ethics Board: <https://ethics.wa.gov/>
- Washington Attorney General news: <https://www.atg.wa.gov/news>
- Washington PDC enforcement: <https://www.pdc.wa.gov/rules-enforcement/enforcement>

## Paper-only signal model

A political-market signal should be a structured event, not vibes.

```json
{
  "event_id": "source-date-official-topic",
  "official": "Name / office",
  "source_url": "primary URL",
  "source_class": "disclosure | bill | vote | contract | enforcement | speech | social | third_party_pointer",
  "timestamp_public": "ISO-8601",
  "instrument_refs": ["ticker_or_market_slug"],
  "directional_claim": "bullish | bearish | volatility | no_edge | unknown",
  "confidence": "low | medium | high",
  "latency_days": 0,
  "reason": "why the public event may matter",
  "counter_evidence": "why it may not matter",
  "action": "WATCH | PAPER_BUY | PAPER_SELL | AVOID",
  "execution_mode": "autonomous",
  "risk_policy_ref": "bss.paper.risk.v1",
  "idempotency_key": "[deterministic action key]"
}
```

### Signal classes to monitor

| Signal | Why it matters | Required evidence | Default action |
|---|---|---|---|
| Official trade disclosure | Reveals reported official financial exposure after statutory delay. | Primary House/Senate/OGE filing. | WATCH until event/news correlation exists. |
| Bill introduction/co-sponsor surge | Indicates policy direction before floor action. | Congress.gov or WA bill page. | WATCH; market only if affected sector/instrument is liquid. |
| Committee hearing | Can move pharma, defense, tech, crypto, AI, energy, privacy. | Committee calendar / hearing notice. | WATCH volatility. |
| Procurement award | Direct revenue implication. | USAspending/SAM/WA contract record. | PAPER candidate only if issuer/instrument mapping is clean. |
| Enforcement action | Can move targets and peers. | DOJ/SEC/AG/PDC source. | PAPER candidate if public, specific, and not stale. |
| Campaign donation spike | Indicates influence network, not necessarily tradeable. | FEC/PDC filings. | WATCH only unless joined by official action. |
| Public statement/social post | Narrative movement; high manipulation/noise risk. | Official account / archived public post. | WATCH; require confirmation for trade thesis. |

## Pump-and-dump / corruption pattern detector

Use this as a hypothesis filter, not an accusation generator.

Potential pattern:

1. Official or close committee member has disclosed exposure or donations tied to sector/company.
2. Official action or public statement plausibly benefits the same sector/company.
3. Public market or prediction market moves after the public event.
4. Narrative amplification appears on social/trend surfaces.
5. Follow-up disclosure, enforcement, or investigative reporting confirms or falsifies the linkage.

Minimum evidence before a paper thesis:

- At least one primary government source.
- At least one independent market/trend source.
- Instrument mapping that does not require hidden assumptions.
- Timestamp order: public event before market move, or disclosure after event clearly tagged as late/stale.
- Explicit counter-evidence.

## Guardrails

- No private addresses, family member doxxing, employer harassment, leaked documents, or non-public info.
- Do not call a person corrupt unless an enforcement body, court record, or reliable investigation supports that claim; use "alleged," "disclosed," "reported," or "potential conflict" precisely.
- No real-money trade calls. This BSS lane is `paper_only`, autonomously executed by Mosaic and Murmurs, and bounded by machine-enforced risk/idempotency policy.
- Do not scrape sources against terms; prefer APIs, RSS, bulk downloads, and official pages.
- Track all timestamps; disclosure lag is central to interpretation.

## Implementation backlog

1. Build `officials` registry table from GovTrack/current Congress, Congress.gov, Washington Legislature, Governor/cabinet, SOS, and PDC.
2. Build `official_events` append-only ledger with source URL, timestamp, hash, actor, action class, and instrument refs.
3. Add a `political_signal_watch` paper book with default `WATCH` actions only.
4. Add daily brief lane:
   - new disclosures,
   - new enforcement actions,
   - high-volume official-adjacent prediction markets,
   - new WA/federal bills affecting AI, crypto, privacy, defense, cloud, energy, housing.
5. Add validation job that downgrades stale/third-party-only signals to `WATCH` or `AVOID`.
