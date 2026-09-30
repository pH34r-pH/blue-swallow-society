# Selected orbital public context — Society #91

The exact owner can opt into one selected public orbital object (ISS, NORAD 25544), separate from regional ground reports and private RF/entity evidence. No catalog-wide acquisition or observed/live telemetry claim.

- Source-bound JSON GP elements retain UTC epoch, fetch receipt/hash, model SGP4 and TEME frame. Missing/incompatible identity/epoch/frame is rejected. Element age >24h is stale; positions beyond +/-72h from epoch are hidden, with cached metadata retained.
- A shared Postgres singleton acquisition receipt must commit before any outbound call. Database time governs a minimum two-hour gate. Concurrent workers, crashes and restarts cannot bypass it. Every non-200, redirect, transport/parser failure stops acquisition until explicit owner review/reset; no fallback provider or silent retry.
- A reset must identify the exact current failed attempt and include a review reason. It is audited and cannot shorten the two-hour gate. Use a verified exact-owner maintenance action with proposed World.Manage scope; Owner.Read cannot mutate provider control. Scope provisioning remains unapplied.
- Browser propagates cached elements locally. List details show epoch/age, simulation UTC, actual ellipsoid altitude, predicted/propagated status and uncertainty. Orbit coverage is global, independent of ground region presets; no invented surface projection.
- Replace only World's renderer with lazy privately served Cesium; retain MapLibre Cybermap. No ion, paid imagery, new datastore/queue or external default requests. Accessible list, reduced motion, teardown and failure fallback remain.
- Acquisition and migration are disabled/unapplied until separately approved deployment. No public GP requests for tests; historical/reference fixtures remain test-only.
