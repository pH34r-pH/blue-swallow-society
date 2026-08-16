# Test Design: VM Echo Route Retirement

| Requirement | RED condition | GREEN evidence | Test |
|---|---|---|---|
| FR-001 | `GET /echo` returns legacy 200 payload | `GET /echo` returns intentional 404 JSON | `vm/cybermap-api/test/http.test.mjs` |
| FR-002–FR-003 | Public Caddy block proxies every path | Named public allowlist forwards documented paths and unmatched paths hit `respond "not_found" 404` | `tests/vm-echo-route-retirement.test.mjs` |
| FR-004 | Route removal changes health/readiness behavior | Existing health/readiness test remains green | `vm/cybermap-api/test/http.test.mjs` |

## RED/GREEN Sequence

1. Replace the legacy VM echo success assertion with the 404 contract and add the public-Caddy static contract test.
2. Run both focused tests. They must fail because the server still has `/echo` and Caddy still proxies every path.
3. Remove the server route and add the Caddy allowlist/default deny.
4. Re-run focused tests and the affected VM suite.
