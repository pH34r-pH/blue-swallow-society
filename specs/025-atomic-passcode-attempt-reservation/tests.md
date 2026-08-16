# Test Design: Atomic Passcode Attempt Reservation

| Requirement | RED condition | GREEN evidence | Test |
|---|---|---|---|
| FR-001–002 | Twelve reservations share stale empty reads and all admit | exactly five admitted; the rest are limited after conflict retries | `tests/passcode-rate-limit.test.mjs` |
| FR-003 | Handler checks before a post-verification failure record | 12 invalid handler calls yield 5×401 and 7×429 | `tests/passcode-api.test.mjs` |
| FR-004 | Wildcard reset deletes a newer competing record | stale success reset conflicts harmlessly; current reset clears | `tests/passcode-rate-limit.test.mjs` |
| FR-005 | Retry exhaustion causes excess 503 under the deterministic burst | bounded retry behavior reaches 429 ceiling outcomes | `tests/passcode-rate-limit.test.mjs` |
