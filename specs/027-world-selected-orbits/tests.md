# Validation

Test source identity, timestamps, units, invalid elements and propagation failure; SGP4 published reference vectors and an independent Earth rotation cross-check; exact epoch horizon/stale boundaries using a fake clock. Test no read-path fetch and no disabled acquisition.

Durable PostGIS tests use disposable local schemas: simultaneous worker claims, reconstruction after successful acquisition/failure/incomplete attempt, two-hour gate, reset failure-ID race, audit trail and unchanged personal tables. Unit acquisition tests use explicit historical fixtures and fake clock; no public GET.

Browser tests exercise real private assets, lazy Cesium transfer, actual nonzero ellipsoid altitude, ground/orbit layer independence, keyboard/reduced motion/mobile, no external requests, and teardown/failure/list fallback. Measure loaded asset bytes and software-WebGL timings without phone performance claims. Run regressions and exact CI before merge. No production migrations or collection.
