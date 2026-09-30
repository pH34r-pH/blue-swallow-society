# Validation

`node --test tests/vision-freshness.test.mjs tests/vision-renderer-expiry.test.mjs tests/vision.test.mjs tests/operator-data-controllers.test.mjs`

Deterministic clock tests cover empty/live replacement, repeated loads, TTL boundary, stale timestamps, missing/invalid/future capture time, frame capture time, mixed ages, historical merges, wrong configuration, absent/invalid geometry and measured small/clipped boxes. A dormant renderer test executes its function with a minimal DOM/timer seam and proves expiry clears overlays without a new sensor event. This is not browser/camera field acceptance.

Run the root CI command and VM regression suite before PR publication. Exact-head hosted CI gates merge. Run graphify if installed and record any unavailable tool.
