# World operational map — Society #91

An exact-owner operator may inspect public context in a separate World surface without granting location permission or accessing personal observations. Public feeds are never entity evidence. This package supersedes the older Global specification only for the new World surface; DeFlock aggregate-only privacy rules remain in force.

- WA, PNW (WA/OR/ID), US (geographic overview, including AK/HI), and global presets; independently opt-in layers, searchable/sortable paginated list, selected details, keyboard controls and map-independent fallback.
- Every record carries source, source URL, attribution, event time, provider update time (nullable), fetch time, coverage and uncertainty. Missing timestamps remain unknown. Observed, reported, predicted, and historical are distinct semantics; no 'live' claims.
- Source state distinguishes disabled, unavailable, empty, fresh, stale, expired and failure with retained stale context. Acquisition is separate from read requests, bounded in bytes/time/items and coalesced. No automatic retry loops.
- Reuse USGS normalization. NWS active alerts retain validity windows and no fabricated point when geometry is missing. EONET/GDACS normalization remains reusable but activation awaits source-specific qualification. DeFlock remains on its existing aggregate-only pipeline; no raw point reuse.
- Reuse vendored MapLibre 6 globe for ground context and a local public-domain Natural Earth basemap. No new renderer, proprietary tiles, accounts or keys. Satellites remain disabled until epoch-bound propagation and actual altitude/reference-frame rendering are verified together.
- Aviation, maritime, WSDOT and news remain explicitly pending; no fake live integrations. Production fixtures are forbidden.
- Mount World through the existing private asset sealer, owner shell and common API server after entity edit-scope integration. Preserve Travels, entity editing and auth behavior. Acquisition stays explicitly disabled unless the host enables it; no deployment or database writes.
