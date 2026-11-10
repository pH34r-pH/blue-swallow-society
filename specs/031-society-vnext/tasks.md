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
- [x] Secret-free phone-page handoff, mobile deep-link login and explicit release check.
- [ ] Populate the journal through private owner import/authoring/publication.
- [ ] Complete public canonical metadata, RSS/sitemap, media and publication coverage.
- [ ] Integrate data-driven inspector, panel behavior and full desktop accessibility.
- [ ] Compatible browser shared-dataset reader and Android parity fixtures.
- [x] Read-only same-origin dataset transport with current signed-roster checks.
- [x] Signed v1/v2 wire codec and actual Kotlin-producer/Chromium-worker fixtures.
- [x] Verifying browser worker, bounded canonical admission and explicit refresh controls.
- [ ] Full Android Room admission/projection parity at the pinned producer revision.
- [ ] Map controls, Encounters, Trips, timeline and shared inspector.
- [x] Initial bounded receiver-fix map with explicit opt-in basemap.
- [ ] Private bird import/preview/publication and supported sync feasibility.
- [x] Bounded, owner-only candidate CSV preview endpoint (spec 032).
- [ ] Owner correction compatibility and friend onboarding/update experience.

## Qualification

- [ ] Real browser visual/accessibility/performance evidence.
- [ ] Exact-source qualified runtime, auth/storage and private release evidence.
- [ ] Physical installation/update and multi-phone/browser convergence.
- [ ] Rollback and operational runbooks; issue acceptance reconciliation.

No deployment, credential provisioning, bird account connection or physical
acceptance has been performed by this source work.

## Friend APK handoff checkpoint — 2026-11-10

- Chromium exercises mobile deep-link login and a synthetic APK download through
  an authenticated redirect, including a changed current-release pointer and lock.
- Live root still shows the older password entry; the new download metadata route
  returns 404 anonymously. This source branch has not been deployed.
- A verified published APK and protected release path remain outstanding in
  [Wardriver #372](https://github.com/pH34r-pH/blue-swallow-wardriver/issues/372).
  Runtime qualification and real-phone installation/update remain open.

## Receiver map checkpoint — 2026-11-10

The initial MapLibre view displays bounded, unambiguous receiver fixes after an
explicit data read. It clears on refresh, signed revocation, local clear and
session teardown. OpenStreetMap tiles are requested only after the user selects
the disclosed basemap action. This is not an emitter estimate, encounter or trip
view. Richer filtering, selection/inspector, parity and launch work remain open.
Local Node 24.22.2/Windows evidence: 417 root tests and ten Chromium journeys
passed, including producer fixture, revocation and opt-in tile-request checks.

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

## Dataset transport evidence — 2026-11-10

- Reviewed current Wardriver producer source at
  `2b5a526bac6cf2914c967fa61a185b4ff3db70e8`; documented v1/v2 observation
  envelopes separately from unsupported evidence slots and old Cybermap.
- Nine transport tests cover real viewer authorization, configuration and group
  scope, path/method/origin denial, exact bytes, current roster verification,
  authority-change races, revoked-member reads, malformed/oversized/partial
  streams, private-error redaction and timeout/concurrency budgets.
- Full root CI-contract suite: 386 passed on Node 24.22.2/Windows. Focused
  companion/device-auth regressions: 33 passed. New modules pass structural lint.
- Interface commit `7f35ddc61d3e839be428775e64bcc14db6008b25` passed all seven
  hosted workflows, including Society public CI and its Linux VM suite. This
  does not change the previously recorded local Windows VM limitation.
- No transport read used real group storage. The browser worker, verified
  admission/projection and Android golden parity are still unimplemented.

## Wire codec evidence — 2026-11-10

- Pinned exact producer schemas/license at Wardriver
  `2b5a526bac6cf2914c967fa61a185b4ff3db70e8`; static generation reproducibility
  passes with protobufjs 8.8.1 / CLI 2.7.1. API dependency audit: zero vulnerabilities.
- The producer's `DeviceDatasetWireTest` and synthetic golden export test passed
  through its Gradle wrapper on JDK 17/Windows. Golden bytes contain live v2,
  closed v1, retraction, unknown retained observation fields and a clock beyond
  JavaScript safe-integer precision. No private fixture key was exported.
- Seven Node codec tests pass, including adversarial signatures/envelopes,
  scope/version/identity/clock/control checks. Chromium verifies the same producer
  bytes inside a worker under a CSP without unsafe-eval.
- Full root CI-contract suite: 393 passed. All eight Chromium journeys passed.
  Authored codec modules pass the pinned structural lint thresholds.
- Dataset transport commit `519b9fd6e5734cdb6a24012cace5a5dc7620099a` passed all
  seven hosted workflows. This newer wire-codec slice still needs its own CI.
- The full reader remains incomplete: verified roster progression, atomic
  canonical admission/journal continuity, conflicts, withdrawals/cutoffs,
  orchestration, map/history projection and full Android parity are next.

## Admission and worker integration evidence — 2026-11-10

- Signed roster monotonicity, bounded atomic admission, whole control-journal
  continuity, exact-byte/cross-kind conflict quarantine, publisher-scoped
  withdrawal, sticky cutoffs and permanent geometry ambiguity are implemented.
- Nine admission and eight reader tests pass, including tiny-budget fair progress,
  fork/rollback rejection, peer isolation, cancel/resume, clear versus late work,
  capacity limits and redacted/auth failures. Four bridge tests cover bounded
  streams, response authority, fixed destinations and teardown.
- Two integrated Chromium journeys consume actual pinned Kotlin producer bytes
  through the real private asset/API guards and site's CSP: explicit load,
  unchanged-head refresh, cancel/resume, cutoffs, clear, outage retry and Lock
  during a pending request. Worker termination and private asset denial pass.
- Full root CI-contract suite: 414 passed; all ten Chromium journeys passed on
  Node 24.22.2/Windows. Both codec and worker generation reproduce byte-for-byte.
  Authored modules pass pinned structural lint.
- Inspected synthetic desktop and expanded phone-width reader controls in
  Chromium screenshots; controls/status remain legible with no horizontal overflow.
- The preceding codec commit `d0c9630d806ed8359843571b935ebdbc1d102b0e` passed all
  seven hosted workflows. This new reader slice still needs its own hosted CI.
- This completes bounded observation-history reading, not map/encounter/trip
  projection, full Android Room parity, dense performance or live convergence.
  The shell labels that distinction; no real data, hosting change, credentials,
  account connection, release publication or phone acceptance is claimed.
