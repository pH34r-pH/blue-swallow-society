# Adversarial Review Repair Guidance

**Status:** Source implementation complete; protected deployment and runtime receipts pending
**Source baseline:** `6124e64f8cc4970657a6c060713f97c4f1eb4abd`
**Authority:** The [System Implementation Delta](./blue-swallow-system-implementation-delta.md) owns the findings. This document owns the repair sequence, boundaries, and proof conditions.

## Goal

Remove the material deployment, location-privacy, session, rate-limit, and dependency-boundary risks found in the 2026-07-28 review without weakening the current passcode split, device-ingest contract, green-only Godeye policy, or paper-only state model.

## Non-goals

- Do not claim a live Azure repair without deployment receipts.
- Do not redesign the public cover, Wardriver protocol, or Cybermap schema as part of a boundary repair.
- Do not replace the existing tests with broad integration claims. Add a focused test at each changed boundary.
- Do not migrate a secret into browser storage, source control, documentation, or generated Graphify output.

## Repair order

| Order | Workstream | Why first | Completion evidence |
|---:|---|---|---|
| R0 | Freeze behavior and add boundary tests | Makes later changes reversible. | Focused RED/GREEN tests plus the root suite. |
| R1 | Immutable VM service artifact | Current deployment can change under the same IaC input. | Commit/release ID and SHA-256 are verified on the VM before install. |
| R2 | Body-only viewport contract end-to-end | Exact field location can reach operational request logs. | Function→VM request is authenticated POST JSON; tests prove no coordinates in the upstream URL. |
| R3 | Operator-session decision and short-term containment | The bearer is script-readable for its default lifetime. | Chosen session architecture has an ADR, expiry/revocation tests, and browser proof. |
| R4 | Shared passcode throttling | Instance-local state cannot provide a reliable abuse bound. | Shared or edge enforcement holds across independent Function instances. |
| R5 | Cut WiGLE reads over to BSS Wardriver/VM contracts | An API route imports browser source by path and treats a generic WiGLE shape as the shared authority. | Wardriver-to-VM remains the canonical observation lane; legacy WiGLE adaptation is an API-owned compatibility edge. |
| R6 | Incremental operator modularization | Large modules make every policy change expensive. | Extracted seams retain existing behavior and focused tests. |

The implemented source tranche covers R0–R6: immutable revision/digest receipt, body-only VM reads, memory-only five-minute sessions with global token-version revocation, a dedicated Azure Table throttle, a Wardriver/VM operator-signal projection plus legacy adapter, and extracted controller seams. The remaining gates are protected deployment, browser, and multi-instance runtime receipts; no source declaration is evidence that Azure has applied them.

## R0 — Freeze the current contracts

**Evidence:** `tests/cybermap-viewport-api.test.mjs`, `vm/cybermap-api/test/http.test.mjs`, `tests/security-review.test.mjs`.

1. Add a test that describes the desired VM viewport request: authenticated `POST /api/v1/cybermap/viewport`, JSON body, no location-bearing query string.
2. Add a Function proxy test that asserts the upstream URL is exactly the route path, the request method is `POST`, and coordinates exist only in the serialized body.
3. Retain tests for operator authentication, HTTPS-only backend URLs, bounds, `no-store`, and backend read-token forwarding.
4. Run the targeted tests before touching implementation. They must fail solely because the old contract is GET/query.

This creates a narrow, observable migration boundary. Do not simultaneously alter viewport response semantics.

## R1 — Replace the mutable VM artifact

**Finding:** `infra/vm-echo-lab.bicep:55-56` defaults `cybermapSourceTarballUrl` to `refs/heads/main`; `infra/scripts/install-cybermap-api.sh:38-43` downloads and installs it without an integrity check. The workflow already records `GITHUB_SHA` as `cybermapDeploymentVersion` (`.github/workflows/deploy-static-web-app.yml:138-148`), but that value does not identify the code fetched by the VM extension.

### Target contract

The deployment passes all three values together:

```text
cybermapSourceRevision = immutable Git commit or release ID
cybermapSourceTarballUrl = archive addressed by that immutable revision
cybermapSourceSha256 = expected archive digest
```

The installer verifies the digest before extraction and writes a root-readable deployment receipt containing the revision, digest, install time, and migration versions. The receipt contains no credentials.

### Tasks

1. Add `cybermapSourceRevision` and secure `cybermapSourceSha256` parameters to `infra/vm-echo-lab.bicep`; replace the mutable-branch default with an explicit required deployment input.
2. Add placeholders for both values to `infra/scripts/install-cybermap-api.sh`. After download, use `sha256sum --check` or a constant-time equivalent. Abort before `tar -xzf` on mismatch.
3. In the GitHub Actions workflow, obtain the archive for `${GITHUB_SHA}`, calculate its SHA-256 once, and pass URL, revision, digest, and deployment version into Bicep. Do not print the digest alongside secret-bearing command lines.
4. Write `/opt/bss/cybermap-api-release.json` mode `0644` containing only public provenance. Preserve `/etc/bss/cybermap-api.env` mode `0600` for secrets.
5. Add static tests that reject a branch-head URL and require a checksum verification before extraction.
6. Add deployment acceptance: the service reports healthy, the receipt revision matches the workflow SHA, and the recorded digest matches the release artifact digest.

### Rollback rule

Rollback selects a previously recorded `(revision, URL, SHA-256)` tuple. It never reuses `main` or an unverified archive.

## R2 — Make viewport location body-only across both hops

**Finding:** The browser-facing Function rejects coordinate query parameters, but `api/cybermap-viewport/index.js:44-70` transforms validated coordinates into an upstream GET query. The current Function test proves this exact URL at `tests/cybermap-viewport-api.test.mjs:145-149`. The VM accepts it at `vm/cybermap-api/src/server.mjs:539-558` and its HTTP test uses the same query form at `vm/cybermap-api/test/http.test.mjs:448-454`.

### Target contract

```text
operator browser
  -> POST /api/cybermap/viewport {lat, lon, radiusMeters, limit, maxAgeMs?, now?}
  -> Function validates and authenticates
  -> POST /api/v1/cybermap/viewport (same bounded JSON body + backend read token)
  -> VM validates, queries store, returns existing response shape
```

The public endpoint remains a POST. The VM endpoint becomes a POST. Neither URL contains coordinates.

### Tasks

1. Extract a single viewport-input parser in `vm/cybermap-api/src/` that validates body JSON, ranges, optional clock, and unknown fields. Keep response serialization untouched.
2. Update VM routing to accept only authenticated POST for the viewport route. Return `405` for GET after the edge migration is deployed; do not retain a silent query-compatible bypass.
3. Change the Function proxy to build an HTTPS URL with no query, then `fetch(..., { method: 'POST', headers: { content-type, accept, read token }, body })`.
4. Update the Function and VM contract tests to assert URL/path, method, content type, body limits, bad JSON, unknown fields, bounds, authorization, and no-store response behavior.
5. Audit Function, Caddy, VM, and observability configuration before deployment. During migration, ensure request-target logging cannot retain old location-bearing URLs.
6. Perform a protected end-to-end proof with a synthetic coordinate and retain only a bounded receipt: route/method/status/revision, never the coordinate itself.

## R3 — Operator-session decision before implementation

**Historical finding (resolved in source):** the reviewed baseline held the operator token in browser `sessionStorage` so client modules could attach it to requests. The source also issued an HttpOnly cookie, but prior SWA behavior had not been re-proven for cookie-only authorization.

### Decision record required

Create an ADR that chooses one of these feasible patterns and records platform evidence:

1. **Cookie-only BFF/session:** only if the deployed SWA path preserves and forwards the required cookie semantics.
2. **Short-lived in-memory bearer:** no persistent browser storage; reload requires a fresh passcode flow; server enforces short TTL and revocation/rotation.
3. **Platform-authenticated operator route:** only if the product accepts the identity and enrollment model.

Do not implement a hybrid based on an assumed `Set-Cookie` behavior. The ADR must include a browser capture, expiration test, logout/revocation test, XSS exposure analysis, and operator-download behavior.

### Immediate containment

Until the decision is proven, reduce default bearer lifetime only with an explicit UX acceptance test, preserve CSP protections, and avoid adding any additional script-readable token copies.

## R4 — Replace instance-local passcode throttling

**Historical finding (resolved in source):** the reviewed baseline `api/validate-passcode/index.js` used a process-local `Map`.

### Decision boundary

Choose one durable enforcement point:

- Azure Front Door/WAF rate limiting, if the operating cost and public-edge topology are accepted;
- a dedicated shared counter store with expiry and failure telemetry; or
- another managed rate-limit control with documented behavior across cold starts and scale-out.

Do not reuse the private Cybermap PostgreSQL path or Wardriver release storage as an opportunistic limiter.

### Required proof

Two logically independent Function instances must observe the same blocked caller window. Tests must cover successful-auth reset, TTL expiry, forwarded-client normalization, false-positive response, and an outage policy that fails safely without making the public cover unavailable.

## R5 — Cut WiGLE reads over to BSS Wardriver/VM contracts

**Finding:** `api/wigle/index.js:8-11` resolves and dynamically imports `app/operator/wigle.mjs`. That fixes neither ownership nor the source-of-truth question: `app/operator/wigle.mjs` mixes generic WiGLE-shaped payload normalization with map and AR presentation heuristics.

### Decision boundary

Do **not** create a new cross-runtime JavaScript `wigle-core` and do not import Android code into the web runtime. The canonical BSS observation core already exists as a contract, not as a shared language library:

- Wardriver's `BssUploadBatchBuilder.java` maps passive scanner rows into the privacy-bounded `bss.observation_batch.v1` contract; its default lane hashes identifiers and declares `hash_only` retention.
- `BssVmObservationBatch.java` validates the bounded, idempotent Android batch before the encrypted-outbox/upload path.
- `api/cybermap-observations-batch/index.js` forwards the exact authenticated body to the VM.
- `vm/cybermap-api/src/contracts.mjs` validates the same `bss.observation_batch.v1` schema before persistence.

That Wardriver → Function → VM route is the authoritative BSS signal lane. A BSS operator surface should consume a VM-owned, provenance-bearing projection of that lane, not re-parse a WiGLE browser model as its backend contract.

`BssLocalBridge.java` is a separate, device-local read surface. It binds to loopback, exposes the current Wardriver cache and `bss.signal-envelope.v1` data, and explicitly has no cloud-upload semantics. An operator may fetch it directly from the enrolled device only after an intentional local action, then filter/render locally. An Azure Function must not proxy an arbitrary device loopback bridge.

### Target shape

1. Keep `bss.observation_batch.v1` unchanged as the Wardriver ingest contract. Do not make it a browser display DTO.
2. Define a VM-owned, versioned operator signal projection. It must state source, observation time, redaction/retention class, confidence radius, and the distinction between observation location and emitter estimate. For `hash_only` data, it must not promise plaintext SSID/BSSID display fields that the ingest lane never stored.
3. Move the browser to request that projection. `app/operator/wigle.mjs` becomes presentation-only or is renamed when the product surface no longer describes the payload as WiGLE data.
4. Keep local database and WiGLE-shaped bridge parsing only as an API-owned legacy adapter. It may emit explicitly labeled `legacy_wigle` provenance, but it cannot become canonical BSS observation state and must not import from `app/operator/**`.
5. Retire the dynamic `api/wigle` → `app/operator/wigle.mjs` import. During migration, the Function can preserve the existing HTTP response shape behind an adapter; it must not preserve the dependency direction.

### Required proof

- Contract fixtures derived from the Wardriver batch tests are accepted by `vm/cybermap-api/src/contracts.mjs` and reject unknown fields, bad timestamps, duplicate observation keys, and unsupported privacy classes.
- A `hash_only` Wardriver fixture produces an operator projection with provenance and confidence semantics but without raw identifiers.
- A local-bridge acceptance test proves direct, manual device fetch plus local filtering; no Azure Function request is made and no coordinates or raw cache rows are copied to a cloud route.
- A repository test fails if any `api/**` module imports from `app/operator/**`.
- Existing legacy WiGLE fixtures retain their current behavior and are visibly labeled as a compatibility source.

## R6 — Decompose operator modules without a rewrite

Start with the low-risk browser-only seam: move duplicated session parsing/header construction from `app/operator/main.js`, `loader.js`, `agent.js`, and `agent-loader.js` into one `app/operator/operator-session.mjs` module with unit tests.

Then extract one controller at a time from `app/operator/main.js`:

1. tab lifecycle;
2. operator-download interaction;
3. Godeye lifecycle;
4. AR/vision lifecycle;
5. DOM-only rendering helpers.

Keep event binding ownership explicit. A controller receives dependencies rather than reading global state where practical. After each extraction, run the focused UI test and the full root Node suite. Do not combine this with a security behavior change.

## Source implementation ledger

- **R1:** Bicep accepts a required full commit, archive URL, and SHA-256. The installer checks revision/URL agreement and digest before extraction, migration, or service replacement, then writes a public `/opt/bss/cybermap-api-release.json` receipt.
- **R2:** Function-to-VM viewport and operator-signal reads are authenticated JSON `POST`s. The VM query-form viewport route is retired.
- **R3:** The selected feasible pattern is a five-minute in-memory bearer. `operator-session.mjs` owns it; direct reloads require the root passcode flow. `BLUE_SWALLOW_OPERATOR_TOKEN_VERSION` is a global emergency-revocation setting and deployment automation does not reset it.
- **R4:** A dedicated Azure Table account/table stores hashed caller failure windows. Counter configuration or store failure returns `503` from the passcode route; the public cover remains available. Source tests exercise two independent limiter instances over one table client.
- **R5:** `bss.observation_batch.v1` stays canonical. The VM returns `bss.operator_signal_snapshot.v1` with raw identifier suppression; Godeye consumes it. `api/wigle` uses a runtime-neutral compatibility parser and labels its response `legacy_wigle`; no Function imports `app/operator/**` or proxies `BssLocalBridge`.
- **R6:** Session, signal adaptation, backend transport, rate-limit, and VM viewport concerns have explicit modules and focused tests.

## Required verification matrix

```bash
node --test tests/cybermap-viewport-api.test.mjs tests/security-review.test.mjs
(cd vm/cybermap-api && npm test)
node --test tests/*.test.mjs
PYTHONPATH=scripts python3 -m unittest discover -s tests -p '*_test.py'
git diff --check
```

After code changes, run `graphify update .` from the repository root and verify the generated graph loads at the repaired commit. For documentation-only edits, retain the local code graph and state that semantic documentation extraction was not run.

## Promotion gate

A repair is complete only when its focused tests pass, the complete local suite passes, a deployment receipt identifies the immutable artifact, and the applicable protected runtime check succeeds. A passing unit test alone is not a deployment proof.
