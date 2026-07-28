# Implementation Plan: Adversarial Review Repairs

**Spec**: `specs/009-adversarial-review-repairs/spec.md`
**Design**: `/home/ph3/repos/blackbox/blackbox/Designs/Blue Swallow Society/Adversarial Review Repairs - 2026-07-28.md`
**Tests**: `specs/009-adversarial-review-repairs/tests.md`

## Technical context

- Root tests: Node built-in runner (`node --test tests/*.test.mjs`).
- VM tests: `npm test` in `vm/cybermap-api`.
- Python tests: `PYTHONPATH=scripts python3 -m unittest discover -s tests -p '*_test.py'`.
- API package owns its dependency lockfile at `api/package-lock.json`.
- Existing function route contracts are CommonJS; VM/browser contracts are ESM.

## Constitution check

- **Source authority**: PASS. `docs/adversarial-review-repair-guidance.md` and the approved vault design define intent.
- **Trust boundaries**: PASS after implementation. VM persistence remains canonical; Functions remain authenticated adapters; browser remains presentation.
- **Backward compatibility**: Function/browser POST contracts remain stable. Direct VM GET/query callers must migrate; browser bearer persistence is deliberately invalidated and requires re-entry.
- **Live claims**: PASS. No source result is described as live deployment proof.

## Implementation sequence

1. **Artifact contract (R1)**
   - Make `cybermapSourceTarballUrl` and `cybermapSourceTarballSha256` required Bicep parameters.
   - Compute a commit-addressed archive checksum in deployment/what-if workflows; pass both values to `infra/main.bicep` and `vm-echo-lab.bicep`.
   - Validate strict URL/ref and digest shapes in the installer, verify checksum before extract, and retain the prior release on failure.

2. **Viewport transport and seam (R2/R6)**
   - Extract `vm/cybermap-api/src/viewport.mjs` for strict body parsing, bounded store reads, and operator-signal projection.
   - Add VM POST viewport handling and retire the GET/query route.
   - Extract `api/_lib/cybermap-backend.js`; make `api/cybermap-viewport` proxy body-only JSON upstream.

3. **Session containment and revocation (R3/R6)**
   - Add `app/operator/operator-session.mjs` with module-private session storage, expiry enforcement, header construction, and explicit clear/reset.
   - Root login loads the authenticated private shell in the same document and imports the operator UI only after setting memory state. `/operator` and `/agent` loaders redirect to the root gate instead of reading persisted material.
   - Remove cookie issuance as a security control claim; set a five-minute default token TTL and enforce configured token-version claims server-side.

4. **Authoritative limiter (R4)**
   - Add a dedicated storage account/table Bicep module and workflow setting.
   - Add `@azure/data-tables` and an injected `api/_lib/passcode-rate-limit.js` interface with ETag conditional updates and bounded retries.
   - Make `validate-passcode` require the durable limiter before secret verification and clear records on success.

5. **Wardriver/VM signal cutover (R5/R6)**
   - Add VM `/api/v1/cybermap/operator-signals` POST projection and Function `/api/operator-signals` proxy.
   - Add browser `operator-signal-client.mjs`; route Godeye/AR reads through it.
   - Move the API legacy parser to `shared/legacy-wigle-parser.mjs`; retain the browser presentation parser in `app/operator/wigle.mjs`. Keep `/api/wigle` migration-compatible but explicit about `legacy_wigle` provenance.

6. **Acceptance and operational receipts (R0/R7)**
   - Add focused static/unit/HTTP tests first, then implementation.
   - Update API/VM/architecture/repair documentation with migration and rollback behaviors.
   - Run all local suites, `git diff --check`, and `graphify update .`. Report live Azure validation as a separate unperformed gate.

## Affected structure

```text
api/
  _lib/{operator-auth,passcode-rate-limit,cybermap-backend}.js
  operator-signals/index.js
  shared/{legacy-wigle-parser.mjs,contracts/}
app/operator/
  {operator-session,operator-signal-client}.mjs
  {main,loader,agent-loader,agent}.js
infra/
  {main,vm-echo-lab}.bicep
  modules/passcode-rate-limit-storage.bicep
  scripts/install-cybermap-api.sh
vm/cybermap-api/src/
  {server,viewport}.mjs
specs/009-adversarial-review-repairs/
```

## Rollback and migration

- VM service rollback selects a prior verified commit URL and digest; no mutable branch ref is accepted.
- VM GET/query viewport is retired. Direct callers must migrate before deployment; the Function and browser use POST.
- Existing browser-persisted bearer data is ignored; users re-enter the passcode after deployment.
- Global session revocation increments `BLUE_SWALLOW_OPERATOR_TOKEN_VERSION` manually in the SWA app setting; deployment automation intentionally does not reset it.
- A limiter storage outage gives only `/api/validate-passcode` a controlled 503; it does not make the cover site unavailable.
