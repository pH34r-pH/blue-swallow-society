# Test Design: Adversarial Surface Remediation and Tool-First Operator UI

**Created**: 2026-07-26
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Baseline**: `node --test tests/*.test.mjs` passed 166/166 on 2026-07-26 before this package. The uncommitted root-login handoff browser test passed in that run and is protected regression evidence.

## Test Matrix

| ID | Level | Covers | RED condition to observe before production edit | GREEN condition | Planned path |
|---|---|---|---|---|---|
| TST-001 | Static route/deployment | FR-003–FR-004, SC-001, SC-003 | `/api/echo` Function, SWA anonymous route, local-server branch, workflow app setting, and current docs are still present. | Echo is absent/intentional 404; Cybermap routes remain configured for Function token validation. | `tests/adversarial-surface-remediation.test.mjs` |
| TST-002 | Function unit | FR-006–FR-008, SC-001 | No asset-grant helper or asset Function exists; static operator assets remain directly accessible. | Shell issues only a derived asset-only grant after operator token validation; asset handler denies bad grant/name before private file read and serves only allowlisted assets. | `tests/operator-shell-api.test.mjs`, `tests/adversarial-surface-remediation.test.mjs` |
| TST-003 | Static route/API unit | FR-009, SC-001 | Agent placeholder Function, agent route rewrites, private `view=agent` branch, and lab assets exist. | Agent endpoints/routes/templates/loaders are absent or deliberately 404; no retained response claims live inference. | `tests/adversarial-surface-remediation.test.mjs`, `tests/operator-shell-api.test.mjs`, `tests/ui-shell.test.mjs` |
| TST-004 | Runtime-source and pure module | FR-010–FR-011, SC-004 | `createSampleWigleDataset`, `createSampleVisionDataset`, sample records, and sample source defaults are shipped under runtime paths. | Runtime sources contain no sample factory/record/fallback; test fixtures supply deterministic data; empty/unavailable states stay explicit. | `tests/adversarial-surface-remediation.test.mjs`, `tests/wigle.test.mjs`, `tests/vision.test.mjs` |
| TST-005 | Module-boundary/static shell | FR-005, FR-012–FR-013, SC-002, SC-005–SC-006 | Private console modules/styles are in `app/operator/`; `app/operator/main.js` owns boot plus Godeye/WiGLE and vision functions. | Static operator directory has only generic loader assets; private asset manifest is explicit; named controllers own Godeye/WiGLE and vision behavior; shared loader CSS is public-safe. | `tests/adversarial-surface-remediation.test.mjs`, `tests/ui-shell.test.mjs` |
| TST-006 | Browser/API regression | FR-001–FR-002, FR-004, FR-008, SC-002–SC-003 | N/A: the current root handoff/browser test is already GREEN and must remain so. Any regression is a blocking failure. | Correct token response shows sealed handoff then generic operator loader; every non-token response shows the cover; Cybermap API remains token-gated. | `tests/root-login-handoff-browser.test.mjs`, `tests/ui-shell.test.mjs`, `tests/cybermap-viewport-api.test.mjs`, `tests/cybermap-ingest-api.test.mjs` |
| TST-007 | Documentation/static scan | FR-014, SC-007 | Historical audit document lacks a conspicuous historical-snapshot label; obsolete documentation passcode text remains. | Historical label is present; obsolete literal value is gone; fixture/placeholder language does not disclose configuration. | `tests/adversarial-surface-remediation.test.mjs` |
| TST-008 | Refactor containment | FR-015, SC-006 | N/A: this guardrail is deliberately established GREEN before copy reduction. It tests retained functional text, not prose volume. | Post-copy shell retains control labels, provenance fields, errors, empty states, keyboard labels, and `aria-*`/live-region contracts. | `tests/ui-shell.test.mjs`, `tests/adversarial-surface-remediation.test.mjs` |
| TST-009 | Full regression | SC-008 | A targeted test failure, lint/whitespace error, or regression is blocking. | All repository tests pass with zero failures. | `node --test tests/*.test.mjs` |
| TST-010 | Graph freshness | SC-008 | N/A: graph update is evidence, not a product test. | `graphify update .` completes and `graphify-out/graph.json` parses; semantic-doc refresh caveat is recorded if emitted. | `graphify update .` plus JSON parse probe |
| TST-011 | Release and live default-host | FR-016, SC-008 | No local fixture or unit pass is deployment proof. | Reviewed main deploy succeeds; default host verifies public root/echo retirement and private asset/Cybermap denial/allow behavior. | GitHub Actions and constrained live smoke receipt |

## RED/GREEN Sequences

### TST-001 — Echo retirement without Cybermap regression

1. Add a named test that asserts no `api/echo/function.json`, no anonymous `/api/echo` SWA route, no `BACKEND_ECHO_BASE_URL` deployment setting/local-server branch, and an intentional `/api/echo` 404 rule.
2. Run `node --test --test-name-pattern='echo' tests/adversarial-surface-remediation.test.mjs`.
3. Expected RED: specific assertions identify the current echo Function/route/setting, not a syntax or fixture error.
4. Remove the echo production path and update only relevant current-operation documentation. Preserve `/api/cybermap/viewport` and `/api/cybermap/observations/batch` route semantics.
5. Re-run the named test, then `node --test tests/cybermap-viewport-api.test.mjs tests/cybermap-ingest-api.test.mjs`.
6. Expected GREEN: retirement test and both Cybermap token-boundary suites pass.

### TST-002 — Private operator asset boundary

1. Add tests that request each asset route with no grant, invalid/expired grant, unknown asset name, encoded traversal name, and valid grant. Test that denial occurs before the private-file reader/spies are invoked.
2. Add static assertions that generic `app/operator/` contains no private console module/style and that the private manifest contains only declared names/content types.
3. Run the targeted test. Expected RED: no grant helper/Function exists and the present static implementation remains visible.
4. Add derived-grant helpers and `api/operator-assets`; make `api/operator-shell` set the asset-only cookie after successful bearer validation.
5. Move private CSS/modules behind the allowlisted Function. Extract Godeye/WiGLE and vision controller modules before moving the new bootstrap entry.
6. Re-run targeted tests. Expected GREEN: valid grant serves the requested allowed asset with `private, no-store`; every invalid path denies; no protected console module has a static fallback.

### TST-003 — Agent placeholder retirement

1. Add tests that reject `/agent`, `/agent.html`, `/api/agent`, `view=agent`, Interface Lab strings, and placeholder response strings in shipped paths.
2. Run the named Agent test. Expected RED: current Function, template, loaders, rewrites, and test assertions expose the placeholder.
3. Remove those paths and update current docs/design-system references. Do not substitute a fake unavailable inference response.
4. Re-run the test. Expected GREEN: the route is unavailable and no operator shell branch claims an agent service exists.

### TST-004 — Fixture-only WiGLE and vision records

1. Add fixture modules under `tests/fixtures/` and update unit tests to import them. Add a shipped-runtime scan that rejects sample factories, `source: 'sample'`, and sample-mode fallback in runtime modules.
2. Run `node --test --test-name-pattern='sample|fixture' tests/wigle.test.mjs tests/vision.test.mjs tests/adversarial-surface-remediation.test.mjs`.
3. Expected RED: the sample datasets still live in `app/operator/{wigle,vision}.mjs`.
4. Move/remove sample factories and records. Keep normalizers, current-state reducers, and explicit empty statuses.
5. Re-run targeted tests. Expected GREEN: fixtures drive deterministic tests; no shipped source contains sample records/fallbacks.

### TST-007 — Historical documentation correction

1. Add a text scan that requires the 2026-07-11 delta document to state it is historical and rejects the obsolete documentation-only passcode value.
2. Run the historical-document test. Expected RED: missing label and literal text are detected.
3. Add the historical snapshot notice and replace obsolete value with a neutral placeholder/fixture reference. Do not change production configuration or copy a real secret.
4. Re-run. Expected GREEN: provenance remains dated and configuration-free.

### TST-008 — Tool-first copy refactor containment

1. Establish a GREEN pre-refactor test inventory for required accessible names, tab keyboard labels, status regions, provenance labels, errors, and empty-state text. This is intentionally GREEN because it guards a wording refactor rather than a missing behavior.
2. Make copy changes only after TST-001–TST-007 are green. Reduce explanatory prose in private shell/templates and controller status text.
3. Re-run TST-008 after each small copy edit. Any missing functional text is a blocking regression.

## Edge and Failure Coverage

- Asset grant issuance failure, cookie suppression, static asset import failure, and invalid shell result redirect to `/` with no static fallback.
- Asset route names reject encoded path separators, `..`, duplicate separators, query-selected file names, unsupported extensions, and an allowlisted name with wrong requested content type.
- Existing operator bearer headers remain usable for data APIs; asset-cookie capability cannot call `/api/wigle`, `/api/osint`, `/api/tzeentch`, Cybermap, or downloads.
- Echo removal does not change `apiRuntime`, public root fallback, or the Function-layer token requirements of Cybermap routes.
- Empty, stale, unavailable, and error source states remain distinguishable from test fixtures and from one another.
- Private/operator brand tokens remain absent from root/public styles; generic loader styling has no operator persona/console copy.

## Traceability

| Requirement | Tests |
|---|---|
| FR-001–FR-002 | TST-006, TST-009 |
| FR-003–FR-004 | TST-001, TST-006, TST-009 |
| FR-005–FR-008 | TST-002, TST-005, TST-006 |
| FR-009 | TST-003, TST-009 |
| FR-010–FR-011 | TST-004, TST-009 |
| FR-012–FR-013 | TST-005, TST-008, TST-009 |
| FR-014 | TST-007, TST-009 |
| FR-015 | TST-008, TST-009 |
| FR-016 | TST-009–TST-011 |
| SC-001–SC-007 | TST-001–TST-009 |
| SC-008 | TST-009–TST-011 |

## Evidence Rules

- Record a RED receipt only when its named targeted command fails for the missing behavior described above. A syntax failure, broken fixture, missing dependency, or unrelated suite failure blocks work rather than proving RED.
- Record each GREEN receipt with command, cwd, exit code, test count, and changed paths. Baseline evidence does not substitute for post-change evidence.
- Treat Graphify and live deployment checks as separate evidence classes. A graph refresh is not a functional test; local tests are not operational proof.
