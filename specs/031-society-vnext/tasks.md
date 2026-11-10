# Society vNext execution

## Foundation

- [x] Inspect current source and issues; preserve independent open PRs.
- [x] Establish the full vNext behavior, authorization and delivery contract.
- [x] Implement password KDF, durable sessions, companion guard and auth routes.
- [x] Implement browser-authorized private vNext download facade.
- [x] Verify focused authentication/release and retained boundary regressions.

## Experience and data

- [x] Public journal layout, explicit password entry, posts/archive/species views.
- [x] Isolated Vector Edge shell, routes, keyboard/pointer resize and phone collapse.
- [x] Private vNext download card, immutable artifact links and installation guidance.
- [ ] Populate the journal through private owner import/authoring/publication.
- [ ] Complete public canonical metadata, RSS/sitemap, media and publication coverage.
- [ ] Integrate data-driven inspector, panel behavior and full desktop accessibility.
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

At this foundation checkpoint the public UI and default auth mode were unchanged.
The next checkpoint below integrates public-first entry and the isolated shell.
Owner-only corpus access is not widened by the viewer routes.

## Public and private experience evidence — 2026-11-10

- Root CI contract suite: 377 passed on Node 24.22.2/Windows.
- Seven Chromium journeys passed: retained companion, owner and Travels;
  public-first root with existing cookies; explicit password entry; safe deep
  links; private asset denial; downloads/renewal; cross-tab lock; cancellation;
  expiry; unavailable bootstrap; mobile layout; approved public projection;
  failed logout/retry; Back after revocation.
- Interactive Edge visual inspection exercised the public journal, Login,
  wide desktop shell/inspector, desktop and phone-width downloads and Lock
  returning to the public journal. Preview data and the release were synthetic.
- Public content is initially empty. Real bird history has not been imported
  or published. Map/Encounters/Trips are honest unavailable views pending the
  signed shared-dataset reader; no synthetic observations appear in production.
- Source default auth mode is still Entra during protected configuration rollout;
  password mode is explicit. Retained owner sign-in now lives at `/owner`.
- Browser/hosting performance, full 200% zoom and assistive-technology coverage,
  exact-source live configuration and physical phone acceptance remain open.
