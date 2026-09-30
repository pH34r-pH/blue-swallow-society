# World selected orbital predictions — Society #91

Implemented scope: **ISS, NORAD 25544 only**, via fixed JSON GP query. Ground reports remain regional; orbital coverage is global and separately opt-in. The cached list and manual UTC simulation work without WebGL. Positions are labelled predicted / propagated, never live or observed telemetry. Element age greater than 24 hours is stale; simulation outside ±72 hours from element epoch hides the position while preserving source metadata. Epoch milliseconds are used by JavaScript propagation; original source epoch text is retained. Accuracy degrades with extrapolation and manoeuvres.

World uses lazy Cesium 1.145.0; Cybermap retains MapLibre. No third engine, ion token, proprietary tiles, imagery provider, account or API key. Ellipsoid terrain and the existing local public-domain Natural Earth land geometry provide orientation. Earth orientation/geometry worker files are pinned Cesium software assets, privately served from a fixed manifest. Cesium's default ion credit is replaced by a plain CesiumJS Apache credit; no ion service is used.

## Durable provider boundary

The existing Postgres pool serves an isolated public `world_orbit_source` singleton and `world_orbit_resets` audit table. There are no foreign keys, queries or inputs involving RF observations/entities. New migration 0008 is **staged, not applied to production**; it is absent from the existing automatic local-proof migration list. Tests apply it only in disposable local schemas.

Before network, an atomic committed UPDATE uses database time to enforce at least two hours since the previous attempt and sets an `acquisition_incomplete` stop latch. Concurrent workers cannot claim the same source; restart/crash never expires the latch. Success clears it only for the matching attempt ID after bounded validation. Non-200 (including redirects), transport, oversized or malformed data retains the stop latch. Failed persistence also leaves the incomplete attempt latched. No fallback source or automatic retry can bypass it. These controls implement [CelesTrak's policy](https://celestrak.org/usage-policy.php); the query and omitted OMM defaults follow its [format documentation](https://celestrak.org/NORAD/documentation/gp-data-formats.php).

Postgres time is the shared authority; callers cannot supply an acquisition clock. Store/migration failure prevents network. All workers using this GP query behind an outbound IP must use this same gate. No current public GP request was made during implementation/testing.

## Owner-reviewed reset

An explicit local maintenance action validates the canonical exact-owner API principal. `status` requires Owner.Read; `reset` requires proposed **World.Manage**, the exact current failed attempt ID and a 10–1,000 character review reason. It records the validated actor, failure/status, original attempt time, cached hash and review reason. Reset cannot shorten the two-hour gate and supersedes the old attempt token so a late worker cannot change the reviewed state. Owner.Read and Entities.Write alone cannot reset.

Maintenance entry: `node vm/cybermap-api/src/world-orbit-maintenance-cli.mjs status`, or `reset <failed-attempt-UUID> '<review reason>'`. It uses the existing DATABASE_URL and a separately supplied BSS_OWNER_MAINTENANCE_ACCESS_TOKEN; never print/commit the token. The CLI is not called by startup or browser reads. There is no new Web consent flow. World.Manage is source-only and **unprovisioned**; its grant/consent and any use against production remain separately approved human steps.

## Disabled activation

Default configuration performs no orbital DB read, timer or outbound call. BSS_WORLD_ORBITS_ENABLED=true allows reading the migrated public cache; the additional BSS_WORLD_ORBIT_ACQUISITION_ENABLED=true explicitly enables the host worker. Neither setting was enabled here. Migration, scoped maintenance consent, host configuration and deployment require separate approval; no infrastructure or datastore was provisioned.

## Coordinates, assets and limits

satellite.js 7.1.0 initializes SGP4 from source-bound OMM; it supplies TEME kilometres and geodetic list altitude. Cesium converts TEME metres to pseudo-fixed using the same simulation Julian date. The UT1=UTC approximation is displayed; this is not precision ITRF or terrain clearance. Normal Earth depth testing occludes far-side markers. Invalid/decayed propagation yields no position. See [satellite.js](https://github.com/shashwatak/satellite-js) and the [pinned Cesium transform implementation](https://github.com/CesiumGS/cesium/blob/1.145/packages/engine/Source/Core/Transforms.js).

Acquisition: one record, 64 KiB streamed body, 12-second deadline, fixed source URL, manual redirect handling, no credentials/private inputs, minimum two-hour durable gate. Rendering: one orbital marker, existing 1,000 ground geometry / 20,000 vertex cap, bounded pixel ratio, manual simulation, no orbit animation. The complete list survives missing private assets, WebGL loss and failed context reads. Failing reads mark retained elements stale.

Nested Cesium modules/assets are owner-cookie-gated under `/api/operator-renderer-assets/cesium/{*asset}` and a pinned exact manifest, with traversal/query/unknown paths denied. Initial engine fetch carries operator headers; ordinary same-origin worker fetches use the existing owner session cookie. No asset enters public/cover assets. The existing sealer loads only the small propagation/UI graph; the Cesium engine is fetched on Show globe.

Licensing/provenance and rebuild recipe: [WORLD-ORBIT-ASSETS.md](../api/_private/operator/assets/WORLD-ORBIT-ASSETS.md). The earlier evaluation document is historical; its implementation gates are now addressed by this slice. Aviation/maritime/paid-source qualification is outside this checkpoint.
