# Society vNext execution

## Foundation

- [x] Inspect current source and issues; preserve independent open PRs.
- [x] Establish the full vNext behavior, authorization and delivery contract.
- [x] Implement password KDF, durable sessions, companion guard and auth routes.
- [x] Implement browser-authorized private vNext download facade.
- [x] Verify focused authentication/release and retained boundary regressions.

## Experience and data

- [ ] Public journal, explicit password entry, posts/archive/species navigation.
- [ ] Vector Edge desktop shell and accessible panels/navigation.
- [ ] Compatible browser shared-dataset reader and Android parity fixtures.
- [ ] Map controls, Encounters, Trips, timeline and shared inspector.
- [ ] Private bird import/preview/publication and supported sync feasibility.
- [ ] Owner correction compatibility and friend onboarding/update experience.

## Qualification

- [ ] Real browser visual/accessibility/performance evidence.
- [ ] Exact-source qualified runtime, auth/storage and private release evidence.
- [ ] Physical installation/update and multi-phone/browser convergence.
- [ ] Rollback and operational runbooks; issue acceptance reconciliation.

No deployment, credential provisioning, bird account connection or physical
acceptance has been performed by this source work.

## Foundation evidence — 2026-11-10

Local Node 24.22.2 on Windows:

- Root CI command (`node --test --test-skip-pattern='^Obscura ' tests/*.test.mjs`):
  374 passed. The separate Obscura CLI is not installed; the CI exclusion remains.
- Playwright Chromium companion, owner-login and Travels journeys: 3 passed.
- API dependency audit after MSAL 7.2.1 update: zero vulnerabilities reported.
- Changed living Markdown: pinned markdownlint 0.18.1 passed; documentation
  guard unit tests: 5 passed. New foundation modules have no warnings under
  the repository's complexity/function-length thresholds.
- VM suite: 234 passed, 4 skipped, 1 failed. The unchanged oversized-upload
  HTTP test receives `ECONNRESET` on Windows rather than the expected 413.
  The isolated unchanged HTTP suite reproduces this; no VM source was changed.
  This remains a regression qualification limitation, not a passing VM claim.

The public UI and default auth mode are unchanged. The next source slice must
integrate public-first entry and a separate viewer-safe shell before password
mode is treated as a complete user journey. Owner-only corpus access is not
automatically widened by these foundation routes.
