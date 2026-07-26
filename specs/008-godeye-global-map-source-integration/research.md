# Research: World Monitor Source Breadth and BSS Selection

## Provenance and boundary

- Candidate reference: [`koala73/worldmonitor`](https://github.com/koala73/worldmonitor), inspected at `2051db452bb6d1d92c052a0d25a72b012af19e6e` on 2026-07-22.
- Evidence: `docs/data-sources.mdx`, `docs/architecture.mdx`, `src/config/map-layer-definitions.ts`, `src/components/DeckGLMap.ts`, and the repository `LICENSE`.
- World Monitor's dashboard is AGPL-3.0-only. This package adopts no dashboard source, provider adapter, visual asset, or source-data entitlement from it. It records BSS's independent source-selection decision.

## What World Monitor demonstrates

World Monitor documents a broad multi-domain feed fleet and, more importantly, a practical source-health pattern: one server-side aggregation path, per-source cache state, bounded timeouts, and visible intelligence gaps. Its documented source coverage includes:

| Domain | Representative World Monitor providers | BSS reading |
|---|---|---|
| Disasters/environment | USGS, GDACS, NASA EONET, NASA FIRMS, Open-Meteo, JMA, Hong Kong Observatory | Strong fit for green, aggregate, global context. Start with event feeds, not weather raster/forecast sprawl. |
| Conflict/geopolitics | ACLED, UCDP, GDELT, IMF PortWatch | Useful analytical context but requires provider-specific terms, event-location precision policy, and clear distinction between reports and observed ground truth. |
| Cyber/infrastructure | Feodo Tracker, URLhaus, C2Intel, AlienVault OTX, AbuseIPDB, ransomware feeds, Cloudflare Radar, submarine cable map, CelesTrak | Separate public threat indicators from owned/local observations. Do not present IP reputation or infrastructure metadata as a local target map. |
| Aviation/maritime | Wingbits, OpenSky, AIS, FAA ASWS, ICAO NOTAM, AviationStack | Valuable only behind a provider-specific authorized scope, retention, attribution, and live-track policy. Not a default global layer. |
| News/RSS | official, wire, established, specialized, aggregator, and state-affiliated feeds with reliability/bias labels | Use in Mosaic/Murmurs evidence processing; do not project article volume as factual map state by default. |
| Markets/economics | EIA, AGSI+, ECB, Eurostat, FRED, World Bank, BIS, BLS, USAspending, UN Comtrade, CoinGecko | Good for analytical dashboards; outside the first Godeye map slice. |
| Prediction markets | Polymarket with tag/ranking/fallback logic | Perception/market signal only. Not factual map evidence, not a global layer, and not a reason to bypass provider controls. |
| Humanitarian/demographic | UNHCR, WorldPop, HAPI, climate and giving sources | Later research lane. High care is required for population/vulnerability representation. |

World Monitor tracks roughly 35 operational source health signals and catalogues 65+ sources/features. That breadth is a source-selection lesson, not a P0 BSS backlog.

## BSS source-selection rule

A BSS global source is selected only when it provides a clear operator question, an allowed source class, reviewable terms, deterministic normalization, a finite cache/freshness policy, and a provenance-preserving aggregate output.

```text
provider endpoint is public
≠ provider permits storage/display
≠ BSS may globally preload
≠ BSS may describe it as direct observation
```

The initial product question is deliberately narrow: **What globally available, publicly attributable events materially change the context around a BSS field observation without exposing people or presenting public reports as direct local sight?**

## BSS source portfolio

### P0 — accepted implementation selection: DeFlock/OSM public ALPR reports

The accepted implementation source is `deflock-osm-alpr-reports`, classed `green_public` with evidence status `public_reported`. It is a DeFlock-published GeoJSON endpoint whose checked-in worker code derives US ALPR features from OpenStreetMap/Overpass tags. It is not a Flock Safety feed, a verified camera inventory, a live sighting service, or a routing source.

| Field | Bounded decision |
|---|---|
| Provider endpoint | `https://data.dontgetflocked.com/cameras.geojson.gz`; observed 2026-07-23: unauthenticated HTTPS `200`, `application/geo+json`, ETag `"633fc36b464717ca1b2eb3e0472e510d"`, ~30.4 MB. |
| Upstream evidence | DeFlock worker source queries OpenStreetMap/Overpass for `man_made=surveillance` and `surveillance:type=ALPR`; the DeFlock repository is MIT-licensed software. The repository license does not independently grant camera-data rights. |
| Terms and attribution | OpenStreetMap data is ODbL. The source card and UI must credit OpenStreetMap contributors, state that data is available under ODbL, identify DeFlock as the delivery/normalization reference, and retain the reviewed terms URL. Whether BSS's derived database triggers any share-alike obligation remains a production enablement review item. |
| Acquisition | One worker-only GET to the fixed HTTPS host, at most daily, 45 s deadline, 35 MiB compressed-object budget, and 256 MiB decompressed-output ceiling. No browser fetch, provider proxy, route request, account login, anti-bot bypass, or query parameter. |
| Normalized product | H3 resolutions 2/4/5 aggregate count cells, source-health receipt, and source timestamps/ETag only. Exact points, OSM IDs, directions, brands, operators, references, and raw feature properties are discarded before persistence. |
| Retention | Raw HTTP response and parsed point features are process-local only and discarded on success or failure. PostgreSQL stores cell aggregates and append-only fetch-run metadata. |
| Enablement | BSS operator direction on 2026-07-26 authorizes this bounded DeFlock worker and map deployment. The catalog records attribution and enablement; it is not held behind a terms-review runtime gate. Disposable-PostGIS evidence remains a preferred verification path when a protected ephemeral URL is available. |

### Deferred P1 — candidate green public event context

These adapters remain disabled candidates. They require their own terms cards and tests; this decision does not approve their implementation or enablement.

| Source | BSS layer ID | Class | Role | Normalized output | Global handling |
|---|---|---|---|---|---|
| USGS Earthquake Hazards | `usgs-earthquakes` | `green_public` | Global seismic event context | `greenfeed_snapshot` event point, magnitude/category, event time, source timestamp | H3 cell counts and newest event only; no user/device correlation. |
| GDACS | `gdacs-alerts` | `green_public` | UN-coordinated disaster alert context | event point/footprint summary, alert level, event time | H3 aggregate plus alert-level caveat. |
| NASA EONET | `nasa-eonet-events` | `green_public` | Categorized natural-event context | event/category/geometry summary, source time | H3 aggregate, source category, delayed/coverage caveat. |

Why these three: they are public event-oriented sources already documented by World Monitor; they offer a strong global context layer with no need to infer identities, tracks, or exposure. They exercise point, polygon, source freshness, and provenance paths without expanding BSS into a global surveillance product.

### P1 — candidates after P0 operational proof

| Source family | Representative World Monitor sources | Proposed BSS class | Gate and reason |
|---|---|---|---|
| Public cyber indicators | Feodo, URLhaus, C2Intel, AlienVault OTX, ransomware trackers | `green_public` only after source-by-source review | Aggregate by H3/country only. No actor attribution, victim list, raw IOC redistribution beyond provider terms, or exposure claims. |
| Authorized reputation/traffic | AbuseIPDB, Cloudflare Radar | `green_authorized` | Credentials/terms required. Show coarse anomaly metadata only; no client key and no browser-direct request. |
| Public orbital/infrastructure | CelesTrak, approved cable datasets | `green_public` or `green_authorized` after data license review | Static or low-rate aggregate context. Cable geometry and orbital data are not a reason to infer local activity. |
| Conflict/event context | ACLED, UCDP, GDELT, IMF PortWatch | `green_authorized` or reviewed `green_public` | Regional aggregate only. Attach report/bias/coverage caveats; no operational targeting or individual-level rendering. |
| Curated official/wire alerts | official sources, Reuters/AP/BBC-like feeds | `green_public` after editorial and terms review | Feed becomes Mosaic evidence first. A map layer requires a normalized geographic event and an explicit BSS interpretation rule. |

### P2 — explicitly deferred

| Family | Reason for deferment |
|---|---|
| Live aviation: Wingbits, OpenSky, FAA ASWS, ICAO, AviationStack | Exact tracks, API terms, refresh cost, and retention/redisplay policy require a separate operator and provider decision. |
| Live maritime/AIS | Same concerns as aviation, with added vessel/route sensitivity. No P0 global track display. |
| Prediction markets/Polymarket | Market price is perception/forecast data, not fact. Keep it in Tzeentch with terms-compliant retrieval; do not display it as map evidence. |
| Finance, economic, trade, procurement, demographics | Valuable to Mosaic/Tzeentch or analytical panels, but not necessary to establish a trustworthy Godeye cell model. |
| Weather rasters, broad news volume, social streams | High cost/noise and weak map semantics for this first slice. |

### Never selected by this delta

- Grey/orange/red exposure feeds, search-engine exposure indexes, credential dumps, doxxing datasets, vulnerability exploitation feeds, or unapproved scans.
- Provider scraping that bypasses rate limits, anti-bot controls, or account access boundaries.
- Private camera, personal-device, face, plate, residence, or raw-location datasets.
- World Monitor's documented simulated or fallback demo behavior. BSS production sources return real evidence, explicit empty states, or errors only.

## Source adapter acceptance card

Before enabling any source, the implementation must add a reviewed card with these fields:

```text
source key / layer ID:
provider and endpoint:
terms URL and review date:
BSS source class and authorized scope reference:
operator question:
input authentication and allowed host:
rate limit / worker schedule / timeout / backoff:
normalized event schema and deterministic external key:
spatial precision / aggregation resolution:
retention and raw-payload policy:
attribution text and caveats:
health classification and freshness thresholds:
fixture provenance and test cases:
```

The DeFlock operator direction is recorded in the catalog and requires no credential. Other providers must be approved before credentials are configured; their adapters remain disabled by default and use non-secret fixtures in `vm/cybermap-api/test/fixtures/` for contract tests.

## Design conclusions carried into the spec

1. Take World Monitor's server-side source-health and aggregation pattern; do not take its dashboard code or full feed scope.
2. Treat provider source health as map data. A missing layer is a visible intelligence gap, not an empty aesthetic space.
3. Keep public event context, owned field observations, and authorized enrichments visibly separate in every API response and cell.
4. Start with three natural-event sources. Prove provenance, aggregation, empty/error states, and privacy before adding cyber or track layers.
5. Make source selection an explicit human review gate. A new provider is not an environment variable or a frontend toggle.
