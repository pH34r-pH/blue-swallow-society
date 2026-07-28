# Test Design: Adversarial Review Repairs

## Traceability

| Requirement | Test location | Red condition | Green evidence |
|---|---|---|---|
| FR-001–003 | `tests/adversarial-repair-config.test.mjs` | Mutable ref/default or absent digest verification | Workflow passes full SHA URL/digest; installer verifies before tar/migration |
| FR-004–005 | `tests/cybermap-viewport-api.test.mjs`, `vm/cybermap-api/test/http.test.mjs` | Function emits upstream GET/query or VM accepts GET/query | Body-only HTTPS POST is accepted; VM GET/query route is rejected |
| FR-006–007 | `tests/operator-session-boundary.test.mjs`, `tests/operator-token-revocation.test.mjs`, `tests/passcode-api.test.mjs`, `tests/security-review.test.mjs` | Persistent bearer strings/storage or old token version accepted | Module-private session/5-minute expiry/version rejection |
| FR-008–010 | `tests/passcode-rate-limit.test.mjs`, `tests/passcode-api.test.mjs`, `tests/adversarial-repair-config.test.mjs` | Per-process Map, no atomic store, no dedicated table | Shared fake demonstrates contention/expiry/reset; IaC wiring exists |
| FR-011–013 | `vm/cybermap-api/test/http.test.mjs`, `tests/operator-signals-api.test.mjs`, `tests/adversarial-repair-config.test.mjs` | No canonical projection or raw identity leaks | Ingested batch creates redaction-safe projection consumed by browser adapter |
| FR-014–015 | `tests/wigle-api.test.mjs`, `tests/backend-boundary.test.mjs`, `tests/adversarial-repair-config.test.mjs` | API imports `app/operator` or browser uses raw legacy parser as core | API-only adapter and isolated seams pass static/behavior tests |

## Fixture authority

- `vm/cybermap-api/test/helpers.mjs` remains the Node realization of `bss.observation_batch.v1`.
- `../blue-swallow-wardriver/.../BssVmObservationBatchTest.java` is the Android producer conformance reference; this repository does not import Android Java.
- Tests use fake/controlled Azure Table limiter instances; no Azure secret or live storage is required.

## Commands

```bash
node --test tests/adversarial-repair-config.test.mjs tests/cybermap-viewport-api.test.mjs tests/passcode-api.test.mjs tests/passcode-rate-limit.test.mjs tests/operator-signals-api.test.mjs tests/wigle-api.test.mjs tests/security-review.test.mjs
(cd api && npm test --if-present)
(cd vm/cybermap-api && npm test)
node --test tests/*.test.mjs
PYTHONPATH=scripts python3 -m unittest discover -s tests -p '*_test.py'
git diff --check
graphify update .
```

## Required negative cases

1. Bad archive digest aborts before `tar`, migration, service switch, or restart.
2. An edge viewport request records no `lat`, `lon`, radius, time, or limit in the VM URL.
3. A token with a valid signature but an earlier version is rejected.
4. A limiter conflict retries boundedly; a limiter outage returns 503; the public root remains a static route.
5. A `hash_only` batch produces a projection with no raw or HMAC SSID/BSSID fields.
6. `/api/wigle` cannot import or resolve any `app/operator` path.
