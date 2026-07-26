# Tasks: Adversarial Surface Remediation and Tool-First Operator UI

**Authority chain**: [spec.md](./spec.md) → [plan.md](./plan.md) → [tests.md](./tests.md) → this file
**Execution mode**: Strictly serial. Do not parallelize: every phase touches the access boundary or a shared operator path.
**TDD rule**: Each RED task must be run and recorded before its paired production task. A passing test written after the production edit is not acceptable evidence.

## Phase 0 — Reconciled Baseline

- [x] T000 Reconcile the source tree and existing root-login handoff repair. Evidence on 2026-07-26: `app/index.html`, `app/main.js`, `app/styles.css`, `tests/ui-shell.test.mjs`, and `tests/root-login-handoff-browser.test.mjs` are uncommitted repair paths; `node --test tests/*.test.mjs` passed 166/166. Preserve all five paths and do not reset/rewrite unrelated worktree changes.
- [ ] T001 Create `tests/adversarial-surface-remediation.test.mjs` with named static/API guardrails for TST-001, TST-003, TST-004, TST-005, and TST-007. Limit this task to the test file; do not edit production paths.

## Phase 1 — Retire Anonymous Echo, Preserve Cybermap

- [x] T002 [US1] Run `node --test --test-name-pattern='echo' tests/adversarial-surface-remediation.test.mjs` and record the expected TST-001 RED assertion against the current echo Function/route/deployment setting. Evidence: RED observed before removal; the guard identified the anonymous echo Function and then stale deployment/local-development wiring.
- [x] T003 [US1] Remove `api/echo/{function.json,index.js}` and the `/api/echo` local-server branch. Modify `app/staticwebapp.config.json` so `/api/echo` resolves to intentional 404, not SPA fallback or anonymous Function dispatch. Allowed paths: `api/echo/*`, `app/staticwebapp.config.json`, `local-server.js`.
- [x] T004 [US1] Remove `BACKEND_ECHO_BASE_URL` deployment wiring and current-operation references from `.github/workflows/deploy-static-web-app.yml`, `README.md`, `docs/static-web-app-functionality.md`, `docs/vm-api.md`, `docs/vm-echo-wiring.md`, `docs/azure-resources.md`, and the relevant local-development helper text. Mark retained echo design/spec material as historical rather than silently claiming it is current.
- [x] T005 [US1] Run the TST-001 GREEN command, then `node --test tests/cybermap-viewport-api.test.mjs tests/cybermap-ingest-api.test.mjs`. Record that the Cybermap viewport route retains its passcode-issued token guard and the observation-batch route retains its enrolled-device ingest-token guard at the Function layer. Evidence: TST-001 GREEN; focused Cybermap suite 5/5; full suite 167/167.

## Phase 2 — Token-Gated Private Operator Assets

- [ ] T006 [US2] Extend `tests/operator-shell-api.test.mjs` and `tests/adversarial-surface-remediation.test.mjs` for an asset-only grant and asset manifest: no header/grant, expired grant, malformed grant, unknown asset, encoded traversal, query-selected asset, and valid allowlisted asset. Use a reader spy to assert denials occur before private-file access.
- [ ] T007 [US2] Run `node --test --test-name-pattern='asset|operator shell' tests/operator-shell-api.test.mjs tests/adversarial-surface-remediation.test.mjs` and record the expected TST-002 RED failures.
- [ ] T008 [US2] Add narrowly scoped asset-grant create/verify helpers in `api/_lib/operator-auth.js` (or an adjacent dedicated module). The grant must be asset-only, short-lived, signed, HttpOnly, Secure, SameSite=Strict, and path-scoped to `/api/operator-assets`; it must not authorize existing data/action APIs. Target files: auth helper and its tests only.
- [ ] T009 [US2] Add `api/operator-assets/{index.js,function.json}` with a fixed asset manifest, content types, private root, controlled denial response, and `Cache-Control: private, no-store`. Do not expose a directory listing or accept a filesystem-derived path.
- [ ] T010 [US2] Update `api/operator-shell/index.js` to issue the derived asset grant only after `requireOperatorToken` succeeds. Preserve the Agent branch until T013 RED is recorded and T014 removes it.
- [ ] T011 [US2] Move private console CSS/modules from `app/operator/` to `api/_private/operator/assets/`, update private-shell references to `/api/operator-assets/<allowlisted-name>`, and leave `app/operator/` with only identity-free loader assets. Maintain explicit ESM import names through the asset manifest; never put a bearer token in a module URL.
- [ ] T012 [US2] Run the TST-002 GREEN command and `node --test tests/ui-shell.test.mjs tests/root-login-handoff-browser.test.mjs`. Verify failed shell/grant/import behavior redirects to `/` with no static private fallback.

## Phase 3 — Remove the Placeholder Agent Surface

- [ ] T013 [US2] Add/complete TST-003 assertions for `/agent`, `/agent.html`, `/api/agent`, `view=agent`, Interface Lab markup, placeholder response text, and loader/template paths. Run the named test and record expected RED.
- [ ] T014 [US2] Remove `api/agent/`, `app/operator/{agent.html,agent.js,agent-loader.js}`, and `api/_private/operator/agent.html`. Remove agent rewrites from `app/staticwebapp.config.json` and the private-template selection from `api/operator-shell/index.js`. Update tests/docs that claim the placeholder is a current operator capability.
- [ ] T015 [US2] Run `node --test --test-name-pattern='agent|Interface Lab|private view' tests/adversarial-surface-remediation.test.mjs tests/operator-shell-api.test.mjs tests/ui-shell.test.mjs` and record GREEN: the unavailable route has no live-inference claim and the main console remains protected.

## Phase 4 — Make WiGLE and Vision Fixtures Test-Only

- [ ] T016 [US3] Create `tests/fixtures/wigle-sample-data.mjs` and `tests/fixtures/vision-sample-data.mjs`; update `tests/wigle.test.mjs` and `tests/vision.test.mjs` to consume them. Add the TST-004 runtime-source guard. Do not edit runtime modules in this task.
- [ ] T017 [US3] Run `node --test --test-name-pattern='sample|fixture' tests/wigle.test.mjs tests/vision.test.mjs tests/adversarial-surface-remediation.test.mjs` and record expected RED because runtime sample records/factories remain.
- [ ] T018 [US3] Remove sample constants/factories/defaults from the runtime WiGLE and vision modules. Preserve parsing, normalization, live/local/file paths, empty states, stale status, and no-fallback behavior. Update imports after private asset relocation. Allowed production paths: private WiGLE/vision modules and their direct controller callers.
- [ ] T019 [US3] Run the TST-004 GREEN command plus `node --test tests/wigle-api.test.mjs`. Confirm missing local/bridge sources report explicit unavailable/empty state and do not substitute test data.

## Phase 5 — Bound the Controller and CSS

- [ ] T020 [US4] Add TST-005 assertions for the private asset manifest, public-loader-only `app/operator/` surface, shared public-safe loader CSS, root/private token separation, and named Godeye/WiGLE plus vision controller imports. Run the named test and record expected RED.
- [ ] T021 [US4] Extract Godeye/WiGLE state, polling, rendering, and request construction from the private bootstrap into a named controller. Retain only explicit boot/session/tab composition in the bootstrap. Add focused controller tests before production extraction.
- [ ] T022 [US4] Extract vision state, endpoint/file ingestion, rendering, and empty-state handling into a named controller. Add focused controller tests before production extraction; preserve `aria-live` and empty-state contracts.
- [ ] T023 [US4] Establish one public-safe loader-structure stylesheet used by the root login/hand-off and generic operator loader. Keep root light/cover tokens in `app/styles.css`; keep Nacre-Moiré/private console tokens in protected assets. Do not move private identity/copy into the public asset.
- [ ] T024 [US4] Run `node --test tests/adversarial-surface-remediation.test.mjs tests/ui-shell.test.mjs tests/root-login-handoff-browser.test.mjs` and all focused controller tests. Record GREEN module/CSS boundary evidence.

## Phase 6 — Historical Provenance and Tool-First Copy

- [ ] T025 [US4] Run the TST-007 historical-document test and record expected RED. The test must require a conspicuous historical-snapshot label and reject obsolete literal documentation passcode text without scanning test fixtures or configuration.
- [ ] T026 [US4] Update `docs/blue-swallow-system-implementation-delta.md` with an explicit historical-audit notice. Replace obsolete literal documentation passcode text in `docs/tzeentch-paper-api-status.md` with a neutral placeholder/fixture reference. Reconcile current docs that still describe echo/Agent as live; retain historical provenance rather than deleting audit facts.
- [ ] T027 [US4] Run the TST-007 GREEN command. Confirm no production secret/config path was edited or printed.
- [ ] T028 [US4] Establish the TST-008 functional/accessibility text inventory as a deliberately GREEN pre-copy guardrail. Cover visible control labels, provenance fields, errors, empty states, keyboard/tab text, `aria-label`, and `aria-live` regions.
- [ ] T029 [US4] Reduce only authenticated private-console explanatory copy. Preserve every TST-008 contract and all state/provenance distinctions. Do not change the public root/cover voice or make unauthenticated content reveal Nacre-Moiré/operator implementation.
- [ ] T030 [US4] Run TST-008 after each copy edit and the protected shell/browser suites. Treat any removed control/status/accessibility/provenance text as a blocking regression.

## Phase 7 — Verification, Review, and Release

- [ ] T031 Run `node --test tests/*.test.mjs` and record pass/fail/skip counts from a fresh run.
- [ ] T032 Run `(cd vm/cybermap-api && npm test)` if Phase 1 touched proxy route/configuration assumptions; otherwise record why the VM source/test topology was unaffected.
- [ ] T033 Run `git diff --check`, a scoped source secret review that excludes `.env`/credentials, and `graphify update .` from the repository root. Verify `graphify-out/graph.json` parses. Do not stage generated graph output.
- [ ] T034 Obtain independent code/security review of the exact scoped diff. Resolve blocking findings through new RED/GREEN evidence; do not self-approve.
- [ ] T035 After review, create a scoped commit, push the branch, merge through the repository review path, verify the canonical GitHub Actions deployment, and record commit/PR/workflow identifiers.
- [ ] T036 Verify the live default host: public root/cover works, `/api/echo` is unavailable, anonymous private-asset and Cybermap requests fail closed, a valid operator session loads the console, and no runtime sample/Agent claim appears. Record this as operational proof, not a local-test result.

## Dependency Order

`T000 → T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030 → T031 → T032 → T033 → T034 → T035 → T036`.

No task is parallel-safe because the public/private asset tree, route configuration, and test contracts overlap. Stop and revise this authority package if SWA cookie behavior, Function asset routing, or CSP prevents the asset-only boundary without weakening it.
