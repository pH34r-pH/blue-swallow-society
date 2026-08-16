# Test Design: Failed Operator Bootstrap Cleanup

| Requirement | RED case | GREEN evidence | Test |
|---|---|---|---|
| FR-001 | an asset or private-main failure rejects while a public session remains or reaches a protected fetch | boot resolves `false`, public session is absent, and the next protected request rejects before fetch | `tests/operator-bootstrap-cleanup.test.mjs` |
| FR-002 | staged data URLs/styles/private module survive a failing private main import | all URLs are revoked, private clear hook runs, styles are removed | `tests/operator-bootstrap-cleanup.test.mjs` |
| FR-003 | root handler fallback omits explicit session clearing | source contract includes cleanup before public render | `tests/operator-bootstrap-cleanup.test.mjs` |
| FR-004 | successful flow changes | existing root/session tests remain green | existing focused tests |

## RED/GREEN Sequence

1. Add controlled asset-failure and private-main-failure tests before changing loader or root logic.
2. Run the new test and observe retained public state / rejection.
3. Add the cleanup seam and root fallback handling.
4. Re-run cleanup and existing focused session tests.
