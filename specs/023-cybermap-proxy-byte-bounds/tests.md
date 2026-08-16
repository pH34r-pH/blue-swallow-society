# Test Design: Cybermap Proxy Byte Bounds

| Requirement | RED condition | GREEN evidence | Test |
|---|---|---|---|
| FR-001–002 | 1 MiB+1 batch/global/normalized viewport request forwards to mocked fetch | 413 and zero fetch calls | `tests/cybermap-proxy-bounds.test.mjs` |
| FR-003 | declared oversized JSON/MVT/canonical-paper-state body is not cancelled, a cancellation rejection replaces the local boundary error, an unannounced stream is fully buffered, an operator-signals/paper-state route misses its response bound, or an unstreamed fallback calls `text()`/`arrayBuffer()` | 502 after declared-body cancellation; cancellation failure preserves `cybermap_response_too_large`; streams stop at the bound; direct routes cover declared and streamed bodies; unstreamed fallback fails before buffering | `tests/cybermap-proxy-bounds.test.mjs`, `tests/tzeentch-route.test.mjs` |
| FR-004 | rejected or malformed successful upstream body is returned | bounded local 502 never includes upstream text | `tests/cybermap-proxy-bounds.test.mjs` |
| FR-005 | normal proxy suites regress | current request/response assertions remain green | existing focused Cybermap tests |

## RED/GREEN Sequence

1. Add over-limit request, declared-response cancellation, cancellation-failure, unstreamed-fallback refusal, malformed-success, canonical-paper-state, direct-route, and stream tests.
2. Run them against the unrestricted routes; record forwarding/full-buffer or error-escape failure.
3. Add the shared guard and wire every listed route.
4. Re-run focused bounds and compatibility suites.
