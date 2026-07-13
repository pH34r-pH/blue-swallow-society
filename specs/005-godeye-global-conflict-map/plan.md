# Godeye Global Conflict Map Implementation Plan

> **For Hermes:** Use the `subagent-driven-development` skill to implement this plan task-by-task, with spec-compliance review before code-quality review.

**Goal:** Replace the fixed-zoom hosted Godeye prototype with a safe MapLibre foundation that exposes explicit `cybermap` and `conflicts` views while keeping P0 free of conflict adapter implementations and conflict-data routes.

**Architecture:** Keep the authenticated `/operator` shell and browser-facing Cybermap POST read proxy, but replace the coordinate-bearing SWA-to-VM GET translation and caller-controlled clock with a fixed-endpoint POST and server-owned time. Add a pure view-state/URL module, one shared MapLibre host, and a namespaced source/layer registry. `cybermap` ports current backend observation behavior first; `conflicts` ships as a strategic world shell with descriptive source-candidate metadata but no adapter callable, endpoint descriptor, or conflict-data fetch path. A follow-on adapter remains prohibited until normalized-contract, operation-specific license/health, trusted-clock delay, server coarsening, and contextual safety gates pass.

**Tech Stack:** Static HTML/CSS/ES modules, MapLibre GL JS 5.24.0 (exact pin, self-hosted runtime assets), Node 22 built-in test runner, Azure Static Web Apps/Functions, existing VM Node API and PostgreSQL/PostGIS Cybermap spine.

---

**Branch**: `kanban/godeye-p0-contract` | **Date**: 2026-07-13 | **Spec**: [`spec.md`](./spec.md)

**Input**: Feature specification from `/specs/005-godeye-global-conflict-map/spec.md` and normative architecture from `/docs/godeye-web-architecture.md`.

## Summary

The implementation is a map-foundation migration, not a conflict-feed launch. It must preserve current Cybermap behavior, enforce the existing operator/public and POST-body location boundaries, and make the two hosted products explicit. The `conflicts` view is useful in P0 as a strategic shell, source-health/gate explainer, and stable deep-link target, but it contains no conflict adapter implementation, endpoint descriptor, event/force geometry, or conflict-data request path.

The implementation sequence is test-first:

1. lock URL/state, source-gate, zoom-policy, no-capture, and no-demo invariants in tests;
2. pin and self-host MapLibre under the existing CSP;
3. add the shared view state, layer registry, and map host;
4. port `cybermap` to MapLibre with parity and rollback support;
5. add the fail-closed `conflicts` shell and responsive/accessibility states;
6. remove the manual renderer only after parity, security, and responsive verification pass.

## Technical Context

**Language/Version**: Browser JavaScript ES modules and Node.js 22 Functions/tests; Python 3 for existing repository validation.

**Primary Dependencies**: MapLibre GL JS 5.24.0 (exact pin); existing browser APIs (`History`, `Geolocation`, `ResizeObserver`, `AbortController`); no UI framework.

**Storage**: No new storage in P0. Existing PostgreSQL/PostGIS observation ledger remains Cybermap source of truth. View state is bounded to URL-safe state and current in-memory operator session; no localStorage persistence.

**Testing**: `node --test tests/*.test.mjs`; `PYTHONPATH=scripts python -m unittest discover -s tests -p '*_test.py'` (the unprefixed command cannot import the existing strategy-synthesis module); deterministic pure-module tests plus existing security review tests and manual responsive/browser smoke.

**Target Platform**: Authenticated Azure Static Web Apps operator shell on modern evergreen desktop/mobile browsers; same-origin Azure Functions proxy to the VM Cybermap API.

**Project Type**: Static web frontend + serverless proxy + VM API; P0 changes include frontend/tests/docs, reproducible MapLibre asset pinning, Cybermap private-hop hardening, and rollout-gate verification.

**Performance Goals**:

- one MapLibre instance per operator session, reused across view switches;
- only the active view polls/fetches;
- viewport/filter requests debounce to at most one active generation per view;
- no full global corpus payload; future country/world layers use bounded vector tiles/bbox reads;
- map movement remains responsive while loading/refresh state updates outside the canvas.

**Constraints**:

- public root and decoy behavior remain unchanged and silent;
- operator auth/token checks remain server-side and fail closed;
- precise local coordinates remain POST-body data on both Cybermap hops and are not serialized into browser/backend URLs or logs; caller clocks are rejected and VM time is server-owned;
- no browser camera/RF/loopback capture path;
- no runtime demo/fake map data;
- no conflict adapter implementation, endpoint descriptor, or conflict-data fetch in P0;
- no active-force/tactical tracking regardless of zoom;
- no browser mutation, analytics, telemetry, endpoint override, or direct third-party map request; Cybermap POSTs remain semantically read-only bounded queries;
- CSP remains self-hosted for scripts/styles and same-origin for API/basemap connections; basemap provider privacy/license/cache/log-retention gates block rollout.

**Scale/Scope**: Two hosted views; one map host; current Cybermap point/radius parity; one descriptive conflict-candidate registry without adapter callables/endpoints; desktop/tablet/mobile layouts; no conflict ingest or global API in P0.

## Current Source Anchors

| Concern | Existing source | Implementation consequence |
|---|---|---|
| Operator shell | `api/_private/operator/shell.html:348-453` | Replace the single Godeye panel body with the nested view switch and shared map/panel containers. Keep shell private/token-served. |
| Top-level tab lifecycle | `app/operator/main.js:386-559` | Preserve existing top-level ARIA tabs; Godeye nested views get their own state/controller. |
| Current Godeye renderer | `app/operator/main.js:1482-1900` | Extract lifecycle/data concerns, port map rendering to MapLibre, retain temporary rollback flag. |
| Current map math | `app/operator/map-math.mjs` | Keep only helpers still needed by tests/fallback; MapLibre owns projection/navigation. |
| Cybermap model | `app/operator/wigle.mjs` | Reuse normalization/filter/provenance behavior until a versioned Cybermap cell/entity contract replaces `accessPoints`. |
| Cybermap browser proxy | `api/cybermap-viewport/index.js` | Keep token gate, browser POST-body coordinate rule, 25-5000 m radius clamp, 1-500 row limit, HTTPS VM proxy, and no-store response; remove caller `now`/endpoint variability, forward a fixed VM POST body, map failures to bounded local classes, and add effective rate-abuse controls plus location-free event-class logging. |
| VM viewport | `vm/cybermap-api/src/server.mjs`, `vm/cybermap-api/test/http.test.mjs`, stores | Add the token-gated POST-body read contract, reject unknown fields/caller `now`, use an injected server clock for tests, and disable the coordinate-bearing GET compatibility path before rollout. The local point/radius semantics remain separate from conflict data. |
| Responsive styles | `app/operator/styles.css` | Add view switch, desktop drawers, tablet collapse, and mobile bottom sheets without changing public CSS. |
| Security gates | `tests/security-review.test.mjs` | Extend no-public-leak, self-hosted dependency, no-capture, token, and URL privacy assertions. |
| SWA routing/CSP | `app/staticwebapp.config.json` | Preserve `/operator` behavior, remove direct public tile origins, and keep script/style/map traffic self/same-origin. Add no CDN allowance. |

## Architecture Design

### 1. View registry and state reducer

Create `app/operator/godeye-state.mjs` with pure functions and constants:

```js
export const GODEYE_VIEWS = Object.freeze(['cybermap', 'conflicts']);
export const DEFAULT_GODEYE_VIEW = 'cybermap';

export function parseGodeyeUrl(url, definitions) { /* allowlist + clamp */ }
export function serializeGodeyeUrl(state, definitions) { /* safe fields only */ }
export function reduceGodeyeState(state, action) { /* deterministic transitions */ }
export function nextRequestGeneration(state, view) { /* stale-response guard */ }
```

The reducer owns per-view camera/region, layer ids, selection, time, lifecycle state, health, last success, and request generation. It has no DOM, fetch, geolocation, or history side effects. `main.js`/controller adapters perform effects and feed results back as actions.

URL rules are exactly those in `docs/godeye-web-architecture.md`:

- `/operator?tab=godeye&view=cybermap` is canonical/default;
- `/operator?tab=godeye&view=conflicts&region=global` is canonical strategic view;
- `lat`/`lon` for either view, current heading, local RF/device/source ids, endpoint overrides, raw search, and credentials never serialize;
- unknown/cross-view/disabled layers are discarded;
- `pushState` only on view switch; debounced `replaceState` for safe intra-view changes; `popstate` never pushes.

### 2. Layer/source registry and fail-closed gate

Create `app/operator/godeye-sources.mjs` with namespaced definitions and one descriptive evaluator used before both fetch and render decisions:

```js
export function evaluateConflictSourceGate({ source, operation, trustedNow, context }) {
  const gates = evaluateAllSixGates({
    source,
    operation,       // fetch | materialize | cache | display | export
    trustedNow,      // server-owned for any enforcing follow-on API
    context,         // region, audience, record/asset class, requested detail
  });
  return {
    eligible: Object.values(gates).every(Boolean),
    enabled: false, // invariant in P0: no approved integration/adapter/endpoint
    gates,
    reasons: failingGateReasons(gates).concat('p0_no_adapter'),
  };
}
```

The real implementation returns all failing reasons. License is evaluated per operation; `healthy` is required for a new fetch, while `degraded` can only permit already-cached display; `offline`/`unknown` block fetch. Delay compares `not_before` with trusted time. Coarsening proves server-applied minimum radius/grid and zoom generalization. Safety evaluates operation, region, audience, record/asset class, and detail. Unknown is failing. P0 conflict definitions contain descriptive metadata only and expose no adapter callable, endpoint descriptor, or enabled toggle. The controller has no conflict fetch operation to invoke. Any follow-on server must enforce the same decisions independently; client evaluation is not authorization.

Cybermap definitions retain access-risk classes and existing source gates. Conflict definitions use separate record/source-role classes and separate style channels. The registry rejects layer ids whose namespace does not match the active view.

### 3. Shared MapLibre host

Create `app/operator/godeye-map.mjs` as the only MapLibre-owning module. It:

- initializes one map in the Godeye map container;
- defaults to 2D north-up; pitch/rotation are opt-in and view-policy bounded;
- installs navigation, scale, fullscreen, and explicit locate/follow controls;
- reconciles namespaced sources/layers atomically on view switch;
- exposes selection and rendered-feature summaries without owning business data;
- applies the strategic zoom matrix before feature/layer visibility;
- calls `map.resize()` after view/panel/orientation changes;
- provides teardown on logout/session expiry.

The current renderer remains behind an equivalent checked-in `legacy|maplibre` configuration constant only during parity. No environment-controlled conflict enable flag or runtime adapter registration exists in P0.

### 4. Cybermap adapter

`cybermap` uses the same-origin `POST /api/cybermap/viewport` body contract. The SWA proxy forwards a fixed-endpoint token-gated VM POST with the same bounded fields; both hops reject unknown fields and caller `now`, the VM owns the freshness clock, and bounded local error classes replace reflected upstream text. Geolocation starts only after the operator activates “Enable location.” Follow updates remain in memory and do not write exact coordinates to URL/history.

The adapter maps current `accessPoints` into a namespaced GeoJSON source while preserving:

- operator location and accuracy geometry;
- observed/last-seen freshness;
- confidence/range uncertainty;
- source/source class, retention, provenance, and caveats when supplied;
- bounded zero-result, stale, unavailable, partial-error, and auth-error behavior.

Do not expand the local point/radius API into world conflict use. A later Cybermap cell/entity migration can replace this adapter without changing the view contract.

### 5. Conflict shell

The P0 `conflicts` view contains:

- strategic world camera (`region=global`, north-up, zoom 2);
- disabled layer rows grouped as Mosaic, Murmurs, sensor context, and external references;
- a source-gate/health explanation for each row;
- timeline and inspector placeholders that explain their unavailable gate rather than showing fake content;
- no conflict network fetch, event geometry, force layer, or synthetic fixture in runtime.

External products remain reference metadata only. Their geometry/text is not scraped or republished. Link launchers require explicit review of product copy and referrer/privacy behavior before activation.

### 6. Responsive and accessibility shell

`api/_private/operator/shell.html` gets:

- nested `role="tablist"` for `cybermap` and `conflicts`;
- one shared map canvas with separate layers, inspector, timeline, source-health, and status regions;
- live regions that do not announce every map move;
- ordered result list/inspector access independent of pointer selection;
- bottom-sheet controls with explicit open/close buttons and focus restoration.

`app/operator/styles.css` implements:

- >=1024 px: left layers / center map / right inspector;
- 640-1023 px: full map + mutually exclusive collapsible drawers;
- <640 px: sticky 44 px-minimum view switch + bottom sheets;
- reduced motion, safe areas, visible focus, non-color states, and map-safe swipe ownership.

### 7. State and copy contract

The controller renders distinct states from the architecture note. It never turns `unavailable` into zero-result `empty`, or source outage into “no conflict.” Copy uses `reported`, `assessed`, `detected`, `effective at`, `retrieved`, and `last verified`.

The current shell copy that advertises aircraft/live-track scaffolds must be replaced with the strategic/tactical boundary. No active-force layer appears as “coming soon.”

## Follow-On API Boundary (Not a P0 Contract)

P0 authorizes no `/api/godeye/*` route signature. A separate feature must define any conflict API only after it has versioned conflict tables/contracts, source-adapter evidence, documented auth/rate limits, server-side delay/coarsening/safety enforcement, bounded bbox/vector-tile reads, sanitized errors, and retraction propagation. A client-only hide is not an acceptable gate.

## Constitution Check

*GATE: planning may complete with documented PARTIAL items, but implementation may not remove the fallback or roll out until every PARTIAL item below is closed. No waiver is implied.*

| Principle / requirement | Status | Evidence / rollout gate |
|---|---|---|
| I. Security-First Development | PARTIAL | The design requires allowlist state, server tokens, server-owned freshness time, fixed endpoints, bounded failures, and no conflict adapter path. Current proxy clock/error behavior remains a rollout blocker closed by T024/T031/T057/T063. |
| II. Privacy and Anonymity by Design | PARTIAL | Explicit location consent; no browser capture/analytics; both Cybermap hops become POST-body-only; direct third-party map requests are prohibited. Current VM query strings and OSM browser tiles remain rollout blockers closed by T009/T015-T016/T024-T031/T039/T057/T063. |
| III. Defense in Depth | PASS | Authenticated proxy, shared fetch/render policy evaluator, server-side follow-on gate requirement, URL allowlist, CSP, and unconditional active-force exclusion. Tests: T007-T009, T016, T024, T046-T049, T057. |
| IV. Secure Defaults | PASS | `cybermap` default, no automatic geolocation, no P0 conflict adapter/endpoint, unknown gate failure, no demo fallback, no tactical detail. Tests: T006-T010, T040-T044. |
| V. Continuous Security Monitoring | PARTIAL | P0 adds no browser telemetry backend. T024/T031 must prove sanitized server event-class logging and rate/abuse controls without request bodies, exact locations, backend URLs, ids, or credentials; T063 exercises alert/error paths. |
| Authentication and Authorization | PARTIAL (inherited) | Current custom token does not satisfy the constitution's OAuth/OIDC requirement and logout does not revoke already issued credentials. T060/T063 must verify an approved platform remediation and server-enforced invalidation before rollout; this feature grants no waiver. |
| Data Protection | PARTIAL | HTTPS and no new persistent client/conflict storage are retained, but private-hop coordinate URLs and third-party browser tiles must be removed. Tests: T006, T009, T016, T024-T025, T039, T057, T063. |
| Input Validation and Output Encoding | PASS | Pure allowlist parser, clamped state, text-only copy selectors, stable ids, no endpoint override. Tests: T006, T010, T017, T020, T032-T034. |
| API Security | PARTIAL | Token, bounds, no-store, HTTPS, and timeout exist. T024/T031 must replace the VM GET/caller clock, reject unknown fields, bound reflected upstream failures, and add effective rate/abuse controls plus location-free logging before rollout. No conflict API is authorized. |
| Threat Modeling | PASS | `docs/godeye-web-architecture.md` records assets, threats, privacy impact, controls, and required verification. T056 re-checks it against implementation. |
| Code Review Security Focus | PASS | T060 performs spec/security review before fallback removal; T068 requests human review before merge. |
| Dependency Management | PARTIAL | T011-T016 pin, lock, self-host, license, and identity-check MapLibre; T059 adds CodeQL and runs dependency/license verification. Rollout is blocked until they pass or a non-runtime advisory is explicitly reviewed. |
| Security Testing | PARTIAL | Focused auth/privacy/policy tests are specified. T057 adds security regression coverage; T059 adds CodeQL SAST; T063 runs authenticated DAST/manual abuse cases; T061-T066 gate release. |
| Privacy Impact Assessment | PASS | The architecture threat/privacy section documents data categories, flow, retention, consent, URL/log restrictions, and teardown. T056/T057/T060 verify implementation alignment. |

No constitutional violation is accepted. PARTIAL rows are explicit rollout blockers mapped to tasks, not waivers.

## Project Structure

### Documentation (this feature)

```text
specs/005-godeye-global-conflict-map/
├── spec.md
├── plan.md
└── tasks.md

docs/
├── architecture.md
└── godeye-web-architecture.md
```

**Design artifact disposition**:

- No separate `research.md`: the canonical vault research remains the cited source, while decisions and rejected alternatives are captured in this plan and the normative architecture.
- No separate `data-model.md`: P0 adds no persistent entity store; the spec's Key Entities and the architecture's state/source/revision sections are the complete in-memory/read-model contract.
- No `contracts/` API artifact: P0 authorizes no new API route. The existing Cybermap request is source-anchored above, and the architecture is the normative browser URL/state/view contract.
- No separate `quickstart.md`: the Implementation Phases, task-level RED/GREEN commands, and Verification section below are the implementation sampler and operator checklist.

### Source Code (repository root)

```text
package.json                                  # create: exact frontend dependency pin/scripts
package-lock.json                             # create: reproducible pin
scripts/vendor-maplibre.mjs                   # create: copy/check pinned runtime dist + license
.github/workflows/codeql.yml                  # create: pinned JS/TS SAST workflow
app/operator/
├── vendor/maplibre-gl/                       # create: self-hosted generated JS/CSS/license
├── godeye-state.mjs                          # create: reducer + URL/history-safe state
├── godeye-sources.mjs                        # create: registries + conflict gate/zoom policy
├── godeye-map.mjs                            # create: shared MapLibre host
├── main.js                                   # modify: nested controller, effects, teardown
└── styles.css                                # modify: map shell/drawers/sheets/states
api/_private/operator/shell.html              # modify: accessible two-view shell
app/staticwebapp.config.json                  # modify: same-origin map CSP; remove public tile origins
api/cybermap-viewport/index.js                # modify: fixed VM POST, bounded errors/rate/logs
vm/cybermap-api/src/server.mjs                # modify: POST read, server-owned clock, reject caller now
vm/cybermap-api/test/http.test.mjs            # modify: private-hop method/clock/privacy contract

tests/
├── godeye-view-state.test.mjs                # create
├── godeye-source-gates.test.mjs              # create
├── godeye-map-policy.test.mjs                # create
├── godeye-presentation-state.test.mjs         # create
├── godeye-shell-contract.test.mjs             # create
├── godeye-responsive.test.mjs                 # create
├── godeye-inspector.test.mjs                  # create
├── security-review.test.mjs                  # modify
├── cybermap-viewport-api.test.mjs             # modify
├── wigle.test.mjs                            # verify/extend Cybermap adapter parity
└── fixtures/godeye-policy-data.mjs            # create
```

**Structure Decision**: Keep the existing static ES-module frontend. Do not introduce a framework. Separate pure state/policy modules from the MapLibre/DOM controller so Node tests can validate URL privacy, source gating, zoom safety, and stale-response behavior without a browser. Keep all operator markup private under `api/_private/operator/shell.html`.

## Implementation Phases

### Phase 1: Contract tests

Write and run failing tests for URL/default/history safety, source gate completeness, strategic zoom/active-force exclusion, stale request invalidation, no-capture/no-demo behavior, and operator/public boundaries. This phase blocks all UI work.

### Phase 2: Reproducible map dependency

Add exact `maplibre-gl@5.24.0` pin, lockfile, self-host script, committed runtime dist/license, and a test/check that regenerated assets are byte-identical. Record the approved self-hosted or same-origin-proxied basemap decision; if none is approved, the view remains unavailable and fallback removal is blocked. Do not add CDN or direct tile origins to CSP.

### Phase 3: Shared foundation

Implement pure state reducer, URL parser/serializer, layer/source registry, six-gate evaluator, zoom safety policy, and one MapLibre map host. Make `cybermap` the normalized default and `conflicts` a registered but source-disabled view.

### Phase 4: Cybermap parity

Port operator location/accuracy and current backend observations to MapLibre. Keep explicit location consent, fixed-endpoint POST-body coordinates on both hops, token headers, server-owned freshness time, bounded errors/refresh, stale/no-data/error states, and no demo fallback. Compare against the current renderer before switching the default.

### Phase 5: Conflict shell and responsive UI

Add strategic world default, descriptive source-candidate rows/gate reasons, no-active-force copy, timeline/inspector unavailable states, desktop/tablet/mobile layout, keyboard view switching, mobile header swipe, bottom sheets, screen-reader summary, and reduced motion. Do not add an adapter callable, endpoint descriptor, or conflict-data request.

### Phase 6: Verification and fallback removal

Run full tests, rendered responsive smoke, auth/privacy/source gate checks, dependency/license/SAST audit, and Graphify update. Remove the manual raster renderer and temporary rollback only after Phase 10 spec/security review gates pass; final human merge review still follows.

### Phase 7: Policy-gated future work

Do not implement source adapters, endpoint descriptors, or `/api/godeye/*` routes from this plan. Spawn separate features only after normalized schema, license decision, source-health contract, region/source delay, server-side coarsening, safety review, and test fixtures exist for the selected source.

## Complexity Tracking

No constitution violation is accepted. The additional pure modules and shared map host are the minimum separation needed to prevent URL/history logic, source safety gates, and MapLibre side effects from being tangled in the existing 1,900-line `main.js`. The conflict registry is descriptive metadata only and intentionally data-free; building adapters now would violate secure defaults and YAGNI. The inherited OAuth/OIDC and session-invalidation mismatch remains a documented rollout gate rather than an implicit exception.

## Verification

Implementation is complete only after:

```bash
PYTHONPATH=scripts python -m unittest discover -s tests -p '*_test.py'
node --test tests/*.test.mjs
git diff --check
graphify update .
```

Browser verification must cover 320, 768, 1024, and 1440 px widths; keyboard-only view/layer/inspector navigation; reduced motion; location denial; source outage; slow stale response after view switch; Back/Forward; logout/session expiry and credential invalidation; same-origin-only basemap traffic; and the P0 conflict shell with zero conflict callables, endpoint descriptors, requests, or event/force geometry. Security verification also requires dependency/SAST scanning plus authenticated DAST/manual abuse cases for auth, bounds, server-owned freshness time, URL/private-hop privacy, logging, and bounded error handling.
