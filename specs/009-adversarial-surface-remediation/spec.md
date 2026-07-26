# Feature Specification: Adversarial Surface Remediation and Tool-First Operator UI

**Feature Branch**: `fix/operator-passcode-transition`
**Created**: 2026-07-26
**Status**: Ready for serial implementation
**Input**: User description: "Remediate verified anonymous-surface, placeholder/sample-data, structural, documentation, and tool-first UI findings without breaking the passcode split or token-gated Cybermap routes."

## Current State

This authority package reconciles the source at `c1122e9` plus the uncommitted root-login handoff repair. The repair changes only `app/index.html`, `app/main.js`, `app/styles.css`, `tests/ui-shell.test.mjs`, and `tests/root-login-handoff-browser.test.mjs`; it passed `node --test tests/*.test.mjs` on 2026-07-26 (166 pass, 0 fail). It is a prerequisite, not a change to replace.

Verified audit findings:

- `/api/echo` is an anonymous Function (`api/echo/{function.json,index.js}`), is explicitly anonymous in `app/staticwebapp.config.json`, and is still configured by the deployment workflow through `BACKEND_ECHO_BASE_URL`.
- The root is identity-free, and `app/operator/loader.js` already redirects without a valid session or failed shell fetch. The guessed static `/operator/*` modules, styles, and sample factories remain anonymously downloadable.
- `api/agent/index.js` returns `"Agent placeholder"`; its protected Interface Lab is exposed by `/agent`, `/agent.html`, `app/operator/agent*`, `api/_private/operator/agent.html`, and the `view=agent` branch of `api/operator-shell`.
- WiGLE sample records are embedded in `app/operator/wigle.mjs`; vision sample detections are embedded in `app/operator/vision.mjs`. Runtime code must not manufacture those data.
- `app/operator/main.js` is 2,109 lines and owns unrelated boot, AR/vision, Godeye/WiGLE, and UI concerns. The root and operator stylesheets both own loader/login-shaped selectors.
- `docs/blue-swallow-system-implementation-delta.md` is an audit snapshot dated 2026-07-11 but is not prominently marked historical. `docs/tzeentch-paper-api-status.md` contains an obsolete literal passcode in a historical local smoke command.
- Existing operator copy contains useful functional labels, provenance, errors, empty states, keyboard labels, and accessibility text. The copy pass must preserve those contracts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reach a legitimate public cover without an anonymous operator backchannel (Priority: P1)

A visitor reaches the identity-free root, enters a non-operator value, and receives the event-cover branch. They cannot use the retired echo proxy, agent placeholder, or guessed operator implementation files to obtain operator capability or sample records.

**Why this priority**: The public root and the privileged surface must remain separate in both behavior and disclosed implementation. Removing the anonymous echo proxy must not disturb the already token-gated Cybermap routes.

**Independent Test**: Run the remediation static/API guard tests plus `tests/root-login-handoff-browser.test.mjs` and `tests/ui-shell.test.mjs`.

**Acceptance Scenarios**:

1. **Given** an anonymous request to `/api/echo`, **When** the deployed route table resolves it, **Then** it returns a deliberate 404 and no deployed Function or app setting restores the proxy.
2. **Given** an anonymous request to an operator asset path, **When** no short-lived asset grant is present, **Then** the request fails before private asset content is read.
3. **Given** a failed or non-operator passcode response, **When** the root flow completes, **Then** the event-cover branch opens with no operator token, private shell, operator route, or operator implementation reference.
4. **Given** the existing Cybermap viewport and observation routes, **When** their route configuration is reconciled, **Then** they remain reachable to the passcode flow and still fail closed inside their Functions without an operator token.

---

### User Story 2 - Load a real operator console only after token validation (Priority: P1)

An authenticated operator receives the private shell and a bounded, allowlisted operator asset grant. The loader remains generic and redirects to `/` if the session, shell response, grant, or asset request is invalid.

**Why this priority**: Static asset obscurity is not an authorization boundary. The operator implementation must become a token-gated delivery path without moving a bearer token into an asset URL or broadening public routes.

**Independent Test**: Run the operator-shell and operator-asset tests with missing, malformed, expired, valid, unknown, and traversal-shaped asset requests.

**Acceptance Scenarios**:

1. **Given** a valid passcode-issued operator token, **When** `/api/operator-shell` returns the private shell, **Then** it issues only a short-lived, HttpOnly, Secure, SameSite=Strict asset grant scoped to `/api/operator-assets` and loads only allowlisted private CSS/modules.
2. **Given** an anonymous, expired, malformed, unknown, or traversal-shaped operator-asset request, **When** the asset Function resolves it, **Then** it returns a controlled denial and reads no arbitrary file.
3. **Given** the generic `/operator` loader has no session or its private shell request fails, **When** it boots, **Then** it removes the session and redirects to `/` without rendering console material.
4. **Given** the retired Agent Interface Lab route or `view=agent`, **When** it is requested with or without a token, **Then** it is unavailable and no endpoint claims live inference.

---

### User Story 3 - Inspect live-only Godeye and vision states honestly (Priority: P1)

An authenticated operator sees only live, local, or explicitly imported records. When a source is unavailable or empty, the UI reports that state instead of manufacturing WiGLE or vision samples.

**Why this priority**: Sample sensor records in a production module can look live, leak false operational claims, and conceal an unavailable data source.

**Independent Test**: Run the WiGLE and vision unit tests using `tests/fixtures/` imports, plus a runtime-source guard that rejects sample factories and sample labels outside test fixtures.

**Acceptance Scenarios**:

1. **Given** a missing WiGLE bridge/local source or no current records, **When** Godeye renders, **Then** it preserves the existing explicit unavailable or empty state and produces no synthetic access point.
2. **Given** no vision endpoint/file has returned detections, **When** the AR detection region renders, **Then** it preserves its empty-state and accessibility text without a sample detection.
3. **Given** deterministic WiGLE or vision fixtures are needed for tests, **When** the test suite imports them, **Then** the fixture resides under `tests/fixtures/` and no shipped runtime source imports it.

---

### User Story 4 - Operate a narrow console instead of a narrated prototype (Priority: P2)

An authenticated operator can read controls, provenance, errors, empty states, and keyboard instructions quickly. The console uses smaller responsibility modules and concise tool-first copy without losing semantic labels or accessibility text.

**Why this priority**: Functional security work must land before polish. Once the data and asset boundaries are honest, the interface should state only the work, source state, and next usable control.

**Independent Test**: Run module-boundary tests plus static shell/accessibility tests that preserve required labels, status regions, provenance, errors, empty states, and keyboard control text.

**Acceptance Scenarios**:

1. **Given** the protected console starts, **When** its controller imports feature behavior, **Then** boot/session/tab ownership is separate from Godeye/WiGLE and vision behavior through named module boundaries.
2. **Given** a source is unavailable, empty, stale, or erroring, **When** the relevant panel renders, **Then** the explicit state, source/provenance fields, and recovery action remain visible after copy reduction.
3. **Given** a keyboard or assistive-technology user, **When** they traverse tabs, fields, controls, and live regions, **Then** the functional labels, focus behavior, `aria-*` contracts, and status announcements remain present.

### Edge Cases

- A direct route request must not turn a missing Function into SPA HTML; retired public capability routes return an intentional 404.
- A token-valid shell response that cannot set or use the asset grant must fail closed to `/`; it must not fall back to static operator modules.
- The asset allowlist must reject a valid-looking extension, encoded traversal, duplicate separator, query-selected file, or unknown name without exposing filesystem paths.
- A browser must not receive the operator bearer token through a query string, module URL, local storage, source map, response cache, or diagnostic text.
- Empty/stale/error data states are not interchangeable with sample states; the UI must preserve the correct condition and source label.
- Historical documentation must retain audit provenance while clearly stating that its deployment observations and obsolete local smoke values are not current configuration.
- Copy reduction must not remove labels that tests use for operator controls, provenance, errors, empty states, keyboard navigation, or accessibility.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The root page MUST remain an identity-free passcode split. A non-operator response MUST open the event-cover surface without an operator session or private implementation reference.
- **FR-002**: The existing successful root-login sealed handoff MUST remain intact: controls hide, passcode input clears, status text announces the handoff, and navigation proceeds once.
- **FR-003**: Production MUST retire `/api/echo`: no `api/echo` Function, anonymous route allowance, deployment app setting, local-server route, or current-operation documentation may keep it reachable. `/api/echo` MUST resolve to an intentional 404.
- **FR-004**: The remediation MUST preserve the route and Function token guards for `/api/cybermap/viewport` and `/api/cybermap/observations/batch`; retiring echo MUST NOT make those routes SWA-AAD-only or anonymously authorized at the Function layer.
- **FR-005**: Static `/operator` content MUST be limited to an identity-free loader and public-safe loader styling. Private console CSS, modules, sample data, route details, and persona content MUST move behind an authenticated asset delivery boundary.
- **FR-006**: `/api/operator-shell` MUST validate the passcode-issued operator token before issuing a derived, short-lived operator-asset grant. The grant MUST be HttpOnly, Secure, SameSite=Strict, path-scoped to `/api/operator-assets`, and unable to authorize data/action APIs.
- **FR-007**: `/api/operator-assets` MUST validate the asset grant and serve only an explicit allowlist of private shell assets with correct content type and `private, no-store` caching. It MUST reject anonymous, expired, malformed, unknown, and traversal-shaped requests before file access.
- **FR-008**: The operator loader MUST redirect to `/` and clear its session on any missing/invalid session, non-OK shell response, missing grant, failed private import, or failed private stylesheet/module load. It MUST NOT use a static fallback.
- **FR-009**: The remediation MUST remove the Agent Interface Lab rather than relabel it. It MUST remove its static loader/pages, private template branch, API Function, route rewrites, tests that assert the placeholder, and current-operation documentation claims.
- **FR-010**: Runtime WiGLE and vision modules MUST contain no sample records, sample factory, sample source fallback, or sample-mode UI copy. Deterministic samples MUST live only in `tests/fixtures/` and test code.
- **FR-011**: Missing, failed, stale, and empty WiGLE/vision sources MUST retain schema-shaped explicit status and empty-state behavior. The implementation MUST NOT substitute fixture data.
- **FR-012**: The protected console bootstrap MUST be reduced to a bounded composition seam. It MUST delegate Godeye/WiGLE and vision behavior through named modules with explicit imports and focused tests; no new feature logic may be added to the bootstrap module.
- **FR-013**: Shared root-login/operator-loader structural CSS MUST have one public-safe source. Public color/theme tokens and private Nacre-Moiré/operator tokens MUST remain in separate scopes.
- **FR-014**: `docs/blue-swallow-system-implementation-delta.md` MUST be labelled as a historical audit snapshot. Obsolete historical passcode text in documentation MUST be replaced by neutral placeholders or fixture references; production secret material remains configuration-only.
- **FR-015**: The final copy pass MUST follow functional remediation. It MUST reduce explanatory prose only in the authenticated operator UI while preserving functional labels, provenance, errors, empty states, keyboard labels, and accessibility text.
- **FR-016**: No implementation task may deploy, push, merge, or enable a new external data source until its declared tests, independent review, scoped secret scan, `git diff --check`, Graphify update, and release receipt pass.

### Key Entities

- **Operator Asset Grant**: A derived, short-lived, path-scoped cookie that authorizes only allowlisted private operator asset retrieval; it is distinct from the operator API bearer token.
- **Operator Asset Manifest**: The server-side map from a stable asset name to an approved private file path and content type.
- **Public Loader**: Identity-free static `/operator` markup/script/style with only redirect and handoff responsibilities.
- **Private Operator Asset**: Shell CSS or module served only after shell validation and asset-grant verification.
- **Runtime Fixture**: Deterministic WiGLE/vision input that test code may import from `tests/fixtures/` but production/browser runtime code may not import.
- **Historical Audit Snapshot**: A dated record of observed system state that remains useful for provenance but is not current operating configuration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Targeted remediation tests prove anonymous `/api/echo`, Agent Interface Lab paths, and private operator assets fail closed; a valid operator session can load only allowlisted private assets.
- **SC-002**: The root handoff and shell tests pass, including the existing browser handoff test, with no operator identity or implementation material in the root source set.
- **SC-003**: Targeted Cybermap route/API tests prove that `/api/cybermap/viewport` and `/api/cybermap/observations/batch` retain passcode-token guards after echo retirement.
- **SC-004**: Runtime-source guards prove WiGLE/vision sample records and factory exports exist only under `tests/fixtures/`; missing source tests render explicit empty/unavailable states instead of synthetic records.
- **SC-005**: Module-boundary tests prove the protected console bootstrap imports distinct Godeye/WiGLE and vision controllers; focused controller tests pass without relying on the monolithic bootstrap.
- **SC-006**: CSS and shell tests prove one shared public-safe loader seam, no Nacre-Moiré/operator token in root assets, and retention of required operator functional/accessibility text after the copy pass.
- **SC-007**: Current/historical documentation tests prove the audit snapshot is marked historical and contains no obsolete literal passcode text.
- **SC-008**: Before release, `node --test tests/*.test.mjs`, the applicable VM suite, `git diff --check`, a scoped secret review, and `graphify update .` all pass; independent review finds no blocking issue.

## Assumptions and Boundaries

- The passcode is a thematic gate, not a replacement for API authorization. Existing token validation remains the real access boundary.
- Static `/operator` loader reachability through SWA remains necessary so the passcode flow can boot it. That is not authorization for private shell assets.
- The asset-grant design intentionally does not make the browser bearer token a URL parameter or grant data/action API access. If cookie behavior differs on deployed SWA, stop and correct the plan before weakening the boundary.
- This feature does not introduce a live inference service, external WiGLE lookup, sensor scan, source enablement, or persistent production sample data.
- This feature does not rewrite historical Specs 000–008. It labels/updates current documentation where needed and preserves historical source provenance.
- This card produces the authority package only. Production edits, commits, deployment, and live verification belong to the serial implementation/review/release work after this package is accepted.
