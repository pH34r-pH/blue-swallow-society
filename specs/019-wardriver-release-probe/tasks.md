# Tasks: Wardriver Release-Probe Verification

## Phase 1 — Contract and implementation

- [x] T001 [US1] Add RED TST-019-01–003 contracts in `tests/wardriver-release-probe-api.test.mjs`.
- [x] T002 [US1] Extend `api/_lib/wardriver-release-store.js` with optional acceptance-mode validation and a no-delivery release-probe projection; trace TST-019-02/TST-019-04.
- [x] T003 [US1] Add `api/wardriver-release-probe/{index.js,function.json}` with a bounded timing-safe header gate before store construction; trace TST-019-01–003.
- [x] T004 [US2] Add RED static deployment-setting coverage in `tests/wardriver-release-delivery-config.test.mjs`; wire the Society repository secret through `.github/workflows/deploy-static-web-app.yml` into the SWA app setting without logging it; trace TST-019-05.
- [x] T005 [US2] Run focused and public/current/operator Node regression suites; trace TST-019-04.

## Phase 2 — Deployment and release evidence

- [x] T010 [US1] Add RED full-handler non-GET coverage with an injected release-store factory; reject `POST` after valid probe auth but before store construction. Trace: TST-019-03.
- [ ] T006 [US1] Commit/merge the Society route through the canonical main deployment flow; verify the deployed SHA/run receipt.
- [ ] T007 [US1] Generate one random probe value without printing it; set it as the Society repository secret and protected Wardriver `wardriver-release` environment secret; verify names only.
- [ ] T008 [US1] Verify live anonymous `403` and authenticated bss.25 probe identity with no APK/SAS request; trace TST-019-06.
- [x] T009 Run `graphify update .`, inspect scoped diffs for secret/public-delivery regressions, and preserve release evidence.
