# Entity workbench source validation

Local source qualification on Node 24.19.0, synthetic fixtures only:

- Isolated PostGIS 17/3.5 image digest `sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6`.
  All migrations apply in a fresh randomly named schema inside local disposable `entity_test`.
  Focused suite: 12 passed, zero skipped, including canonical token adapter/HTTP tests.
- API regression: 216 passed; six pre-existing environment-dependent skips. The isolated
  entity PostGIS case runs without skips in its dedicated CI/local command.
- Root source contracts: 244 passed, zero failed/skipped.
- Pinned Playwright 1.63.0 Chromium: entity UI, companion and owner-login suites, three passed.
- New production modules: no native structural or Lizard findings at repository thresholds;
  no new-module duplicate blocks in the scoped jscpd report.

Commands:

```sh
BSS_ENTITY_TEST_DATABASE_URL=<local disposable entity_test URL> node --test vm/cybermap-api/test/entity-workbench*.test.mjs vm/cybermap-api/test/entity-api-adapter.test.mjs
npm test --prefix vm/cybermap-api
node --test --test-skip-pattern='^Obscura ' tests/*.test.mjs
node --test tests/entity-workbench.browser.mjs tests/companion.browser.mjs tests/owner-login.browser.mjs
```

`graphify update .` was attempted as AGENTS.md requires; graphify is not installed in this
execution environment. No cloud/private-corpus fallback was used. Branch-protection detail
lookup returned GitHub integration 403; visible PR checks must all pass before merging.
Remote exact-commit CI results belong to the PR rather than being inferred from these local runs.

The private UI and token-gated HTTP dispatch are isolated seams. Production server, store
readiness, migration runner, shell and Functions routes are not activated by this source slice.
No deployment, live migration, personal corpus read/export or credential setup was performed.
#44 remains open for scoring/evaluation, offline model sync, shared route/private UI integration
and separately approved live acceptance.
