# Validation

Node tests: provider timestamp and malformed payload semantics; NWS null geometry/validity; body/item limits; coalesced cache refresh; failure cooldown/stale expiration; no read-path fetch; disabled provider never queried; exact-owner route denial; preset filtering, source filtering and pagination bounds.

Chromium tests use explicitly synthetic fixture records from test code only: mobile layout, keyboard selection, reduced motion, empty/error/stale states, 4,000-item bounded list, lazy local globe and WebGL failure fallback. Measure asset bytes and browser render timings in this environment; do not extrapolate to phone performance.

Run focused tests then root CI command and VM npm test; browser tests explicitly. CI gates apply to the exact PR head. Missing disposable PostGIS infrastructure is reported as a skip, not migration evidence. Run graphify locally if available. Never deploy for validation.
