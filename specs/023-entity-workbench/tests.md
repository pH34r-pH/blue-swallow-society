# Validation

- Strict bounded input; reject client actor/time and unknown fields; fail closed without verifier.
- Real isolated PostGIS migration and store: CRUD, search/filter/sort/pagination, personal-only
  evidence, unknown confidence, exact replay/conflict, stale edits and concurrent requests.
- Split → merge → undo and chained compensation; old IDs resolve, intervening edits block undo.
- Refresh retains operator overrides and requests review; assertion/hypothesis ledgers and raw
  observations reject update/delete; raw observation hashes remain unchanged.
- Run node runtime, root source tests, API npm test, companion browser and remote required CI.
- No live corpus, deployment or production migration; record missing integration honestly.

Canonical signed-token adapter and optional HTTP dispatch tests reject wrong scope/owner,
forged actor/principal headers, read proofs, malformed/oversized bodies and unsupported methods.

Incremental editing tests use signed synthetic ID/API tokens: approved scope requests, PKCE,
state/nonce/owner checks, exact origin, cancellation, missing grant, provider error, expiry,
logout and tampering. Chromium proves read-only/Enable editing/cancel/success and disabled
correction controls through the private shell. Live Microsoft consent is not exercised.
