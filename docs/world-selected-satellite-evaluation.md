# Selected satellite increment — historical evaluation

The subsequent implementation is documented in [world-selected-orbits.md](world-selected-orbits.md). This evaluation records the earlier feasibility evidence; acquisition/production activation remains disabled.

World ground context uses the existing MapLibre 6.0.0 globe. Its current standard point/polygon contract has no satellite altitude or time/reference-frame input. Reusing that path would draw surface locations. A custom GL path would introduce substantial coordinate/rendering work. Recommend replacing only World's renderer with a lazy CesiumJS renderer when this increment is implemented; retain Cybermap's MapLibre. That makes two engines total. Do not load both World renderers, or introduce another engine.

## Smallest genuine scope

One explicitly selected, allowlisted NORAD object; JSON GP/OMM, not a fleet/catalog download. OMM accepts larger catalog numbers and CelesTrak documents omitted JSON defaults EARTH/TEME/UTC/SGP4. Reject mismatched IDs, incompatible explicit frames/theory, invalid elements and unknown epoch. Bind source URL, fetch receipt, epoch and payload hash to each snapshot. See [CelesTrak formats](https://celestrak.org/NORAD/documentation/gp-data-formats.php).

The backend needs a durable acquisition receipt and non-200 stop latch before the first real request. Persist an attempt before outbound GET, enforce at least two hours across restarts, reject redirects, and stop automatically after any non-200 until a human investigates. Coordinate all instances behind the same outbound IP; browser reads never query CelesTrak. A process-local cooldown alone is insufficient. These constraints follow the [CelesTrak usage policy](https://celestrak.org/usage-policy.php). No production storage or acquisition was provisioned during this evaluation.

Use satellite.js's OMM SGP4 path, reject failed/decayed results, and restrict simulation time to a documented bounded epoch horizon. Display **predicted / propagated**, element epoch and age, simulation UTC, fetch UTC, source and model. Avoid claiming live telemetry. The library's [primary documentation](https://github.com/shashwatak/satellite-js) covers OMM initialization and failure results.

Convert SGP4 TEME kilometres to metres, then Cesium `computeTemeToPseudoFixedMatrix` at the same Julian date. Show actual ellipsoid altitude, including horizon occlusion. Label this pseudo-fixed transform's UT1=UTC approximation; do not call it precision ITRF. Use Cesium's existing transforms rather than custom globe math. See the [pinned Cesium transform source](https://github.com/CesiumGS/cesium/blob/1.145/packages/engine/Source/Core/Transforms.js).

World Cesium should use an ellipsoid, local Natural Earth orientation geometry, no default base layer, no geocoder, no ion token, and explicit render requests. Preserve the accessible list and failure fallback. No satellite fixture may enter runtime paths.

## Offline feasibility evidence — 2026-09-30

Inspected official npm archives in a temporary directory only: Cesium 1.145.0 (Apache-2.0) and satellite.js 7.1.0 (MIT). No repository runtime dependency or renderer was added.

Historical OMM example from satellite.js's packaged README: NORAD 28492, epoch 2025-03-26T05:19:34.116960Z. Propagation at that epoch and Cesium conversion produced ellipsoid altitude 564,425.876 m. Cross-check against satellite.js's GMST rotation differed by 0.002656 m. This compares two implementations on one historical example; it is neither orbit-truth validation nor a positional-accuracy claim. No GP download occurred and the result was never rendered as current data.

Measured archive components, raw bytes / offline gzip bytes:

| Component | Raw | Gzip |
| --- | ---: | ---: |
| Cesium minified ES module index.js | 4,754,311 | 1,317,850 |
| Cesium Workers (110 files) | 1,108,423 | 385,788 |
| Cesium Assets (205 files) | 4,379,545 | 3,090,417 |
| Cesium Widgets (67 files) | 515,059 | 428,597 |

These are component totals, **not initial transfer measurements**. The archive also contains duplicate module formats and optional assets. A private browser prototype must measure which workers/assets are actually needed before adoption. Satellite.js's 21 pure JS distribution files total 111,768 bytes, excluding types/WASM. No phone performance estimate is available.

## Remaining implementation gates

1. Durable, fail-closed cache/receipt/latch with restart, concurrency, non-200, redirect and body-bound tests. No automated public request until this passes.
2. Private Cesium asset packaging: the current owner sealer uses a flat fixed manifest, while Cesium resolves nested worker/asset paths. Add a fixed owner-gated manifest and verify no external defaults/requests. Do not weaken owner routing or simply expose renderer internals publicly.
3. Independent known SGP4 reference vectors, epoch validity/failure tests, and a browser assertion that the object has nonzero ellipsoid altitude and correct time-bound transformation. The offline cross-check above does not replace these.
4. Mobile/keyboard/reduced-motion/list fallback, teardown, measured loaded bytes/heap/render budgets and exact CI before merge. Keep ground context behavior intact while switching World's renderer.

No paid service, account, API key or user preference blocks this scope. The outstanding work is implementation and validation. Aviation/maritime/licensing-blocked sources remain separate and disabled.
