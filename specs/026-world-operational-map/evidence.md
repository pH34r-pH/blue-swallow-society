# World first-slice evidence — 2026-09-30

Implemented in isolated modules; shared mounting/production acquisition remain pending per [integration handoff](../../docs/world-operational-map-integration.md). No deployment or database write occurred. Synthetic fixtures are defined only in tests and visibly labelled synthetic in browser screenshots.

- Node runtime: v24.19.0.
- Initial full regressions: 252 root tests passed; VM 222 passed / 5 named infrastructure skips; four Chromium suites passed (companion, owner-login, Travels, World). Final World tests additionally cover the geometry budget; final exact CI results belong to PR #98's head checks.
- Focused final World contracts/service tests: 10 passed.
- Real Chromium, 390×844 viewport and reduced motion: keyboard source toggle/selection, opt-in controls, timestamp unknowns, stale/empty/read-failure states, 4,000 synthetic records capped at 50 DOM rows, lazy local-only globe, actual `globe` projection, WebGL context-loss fallback, no page errors or horizontal overflow.
- Final isolated desktop-runner sample: 4,000-record reload to visible page 123 ms; local globe ready 414 ms; 30 requestAnimationFrame intervals median 16.7 ms; JS heap before/after 9,644,191 / 12,814,716 bytes. This is headless Chromium with software WebGL, not a phone measurement, GPU-memory measurement or map FPS benchmark.
- Added World browser assets: 161,523 raw bytes / 59,552 gzip bytes. Existing lazy MapLibre assets: 1,131,232 raw bytes / 289,478 gzip bytes. Gzip is measured offline per asset, not a claim that the hosting route compresses responses. Basemap is 138,160 bytes with pinned hash and public-domain provenance in WORLD-BASEMAP.md.
- Explicit render ceilings: 50 visible list rows, 1,000 map geometries, 20,000 map vertices. Acquisition ceilings: 8 MiB streamed/decompressed response per source, 4,000 items per source, 2,000 vertices per alert, 12-second deadline, minimum five-minute acquisitions and bounded cooldown. Read wrapper has no source-refresh operation.
- One authorized bounded real GET per enabled source at 09:50 UTC: USGS 233 accepted / 0 rejected, fetched 09:50:10.095Z, provider update 09:49:47Z; NWS 222 accepted / 1 rejected, fetched 09:50:10.841Z, provider update 09:48:17Z. Rejections remain visible; no completeness claim or retry followed. No real provider records were committed or used as fixtures.
- Refactored World files have zero local ESLint structural findings under CI rules and zero Lizard warnings; scoped jscpd adds no World clone blocks. Final hosted quality-ratchet result is required before merge.
- `graphify update .` is unavailable because Graphify is not installed in this execution environment. No private semantic corpus was routed to a cloud substitute.

Current feature limitations: process-local snapshot loss on restart; single acquisition host needed per outbound IP; parent mounts route/view/assets after shared entity work. EONET/GDACS/DeFlock World transport, aviation/maritime/WSDOT/news and satellites remain explicitly pending. All private personal data and entity stores remain outside World.
