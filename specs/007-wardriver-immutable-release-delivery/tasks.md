# Tasks: Wardriver Immutable Release Delivery

## Phase 1 — Release store and protected BSS contract

- [ ] T001 [US1] Add RED protected-route, manifest-validation, redirect, and no-legacy-binary tests for TST-001/TST-002 in `tests/operator-downloads-api.test.mjs`.
- [ ] T002 [US3] Add RED public metadata-redaction tests for TST-003 in `tests/wardriver-release-current-api.test.mjs`.
- [ ] T003 [US1] Add RED operator-shell dynamic-fact tests for TST-004 in `tests/operator-shell-download.test.mjs`.
- [ ] T004 [US1] Implement validated private Blob manifest/SAS store in `api/_lib/wardriver-release-store.js`; trace TST-001/TST-002.
- [ ] T005 [US1] Replace `api/operator-downloads/index.js` file reads with the injected Blob store and authenticated 302 delivery; delete `api/_private/downloads/` artifacts; trace TST-001/TST-002.
- [ ] T006 [US3] Add `api/wardriver-release-current/{index.js,function.json}` with metadata-only redaction; trace TST-003.
- [ ] T007 [US1] Replace hard-coded operator shell release facts with authenticated metadata hydration; trace TST-004.

## Phase 2 — Azure deployment and release promotion

- [ ] T008 [US2] Add RED static IaC/workflow checks for TST-005 in `tests/wardriver-release-delivery-config.test.mjs`.
- [ ] T009 [US2] Add `infra/modules/wardriver-release-storage.bicep`, wire it from `infra/main.bicep`, output account/container names, and configure private/versioned/soft-delete storage; trace TST-005.
- [ ] T010 [US2] Update `.github/workflows/deploy-static-web-app.yml` to register Storage, set the dedicated release-store connection string as an SWA app setting without logging it, and retain existing app deployment behavior; trace TST-005.
- [ ] T011 [US2] Add RED Wardriver release workflow/Gradle tests for TST-006 in `/home/ph3/repos/blue-swallow-wardriver/tests` or its established test location.
- [ ] T012 [US2] Add mandatory external release signing configuration and increment to `2.109-bss.2` / code `311` in Wardriver Gradle; trace TST-006.
- [ ] T013 [US2] Extend Wardriver `.github/workflows/android.yml` with tag-only signed build, signer/package/version validation, immutable Blob/manifest upload, and final pointer promotion; trace TST-006.

## Phase 3 — Device freshness signal

- [ ] T014 [US3] Add RED JVM tests for the release version comparator/parser in `BssReleaseUpdateCheckerTest.java`; trace TST-007.
- [ ] T015 [US3] Implement bounded metadata-only `BssReleaseUpdateChecker`, invoke it from Settings, and show availability without automatic download/install; trace TST-007.

## Phase 4 — verification and operational cutover

- [ ] T016 Run focused Node/JVM tests, Bicep compile/validate, existing Node/JVM suites, and `git diff --check`; record TST-001–TST-007 results.
- [ ] T017 Provision the dedicated release account and least-privilege Wardriver publisher OIDC identity; configure the corresponding GitHub secrets and SWA runtime settings; trace TST-008.
- [ ] T018 Generate/secure a new release keystore, produce the first tag, retain manifest/blob/run evidence, and complete the first device uninstall/reinstall migration; trace TST-008.
- [ ] T019 Run `graphify update .` in both repositories, inspect scoped diffs for secrets/unrelated changes, and append verified evidence to the daily log.
- [x] T020 [US1] Add a proxy-auth collision regression in `tests/operator-downloads-api.test.mjs`, then verify `api/_lib/operator-auth.js` accepts a valid signed cookie when SWA injects an unrelated `Authorization` bearer; trace TST-001.
