# Implementation Plan: Adversarial Surface Remediation and Tool-First Operator UI

**Branch**: `fix/operator-passcode-transition` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)
**Input**: Reconciled remediation requirements from `spec.md`.

## Summary

Retire the anonymous echo and placeholder agent surfaces, move private operator implementation delivery behind a derived short-lived asset grant, remove runtime WiGLE/vision samples, establish bounded controller/CSS seams, correct historical documentation, then reduce authenticated-console copy without removing operational or accessibility information.

The work is intentionally serial. Security and data-truth boundaries land before controller/CSS extraction; the copy pass is last. The existing uncommitted root-login handoff repair is preserved and tested before any functional change.

## Technical Context

**Language/Version**: Node.js 22 for Azure Static Web Apps Functions; browser ESM; Node built-in test runner.
**Primary Dependencies**: Native Node modules and Azure Functions programming model already in `api/`; no new dependency is planned.
**Storage**: Existing function configuration, session storage for the root handoff, server-issued cookies, and existing Cybermap backends. No new database.
**Testing**: `node --test tests/*.test.mjs`; targeted `node --test <paths>`; `npm test` in `vm/cybermap-api` when Cybermap proxy boundaries change.
**Target Platform**: Azure Static Web Apps static `app/` and managed Functions in `api/`; modern browsers.
**Project Type**: Static web application with serverless same-origin Functions.
**Performance Goals**: Asset grant issuance and allowlisted private-asset fetch add no provider/network fan-out. Private asset responses are `private, no-store`.
**Constraints**: No deploy/push/merge before canonical tests and independent review; no source secrets, bearer URLs, static private fallback, synthetic runtime data, new live inference, or source enablement.
**Scope**: Public root, operator loader/shell/assets, echo/agent retirement, WiGLE/vision fixtures, controller/CSS seams, historical docs, and authenticated UI copy.

## Reconciled Architecture

```text
public root: app/index.html + app/main.js + app/styles.css
  -> validate-passcode POST
  -> passcode-issued operator bearer stored only for existing protected API flow
  -> sealed handoff -> /operator generic loader

public operator loader: app/operator/{index.html,loader.js,loader.css}
  -> validates session locally
  -> GET /api/operator-shell with custom operator token header
  -> token validation
  -> private shell HTML + derived HttpOnly asset-grant cookie
  -> module/CSS requests to /api/operator-assets/<allowlisted-name>
  -> asset-grant validation before private file read
  -> private operator console assets under api/_private/operator/

operator data routes: token-gated Functions
  /api/cybermap/viewport
  /api/cybermap/observations/batch
  /api/wigle
  /api/osint
  /api/tzeentch
  /api/operator-downloads/wardriver/*

retired: /api/echo, /api/agent, /agent, /agent.html, Agent Interface Lab
```

### Asset-grant boundary

`/api/operator-shell` continues to authenticate with the existing custom passcode-issued token. Only after that succeeds it derives an asset-only grant, sets it as an `HttpOnly; Secure; SameSite=Strict; Path=/api/operator-assets; Max-Age<=300` cookie, and returns the private shell. The grant is signed/validated as asset-only and must not authenticate data/action APIs.

`/api/operator-assets` maps a fixed public filename set to a private root. It rejects any unknown name, path separator, encoded traversal, query-selected asset, invalid/missing/expired grant, and content-type mismatch before resolving a filesystem path. The Function returns `Cache-Control: private, no-store` and the exact approved content type. It never lists its manifest or filesystem root.

The loader is the only static operator client. It has no console metadata and no fallback import from `/operator/*.mjs`; a failed shell/asset request clears the session and redirects to `/`.

### Runtime sample isolation

Move deterministic records from `app/operator/wigle.mjs` and `app/operator/vision.mjs` into named files under `tests/fixtures/`. Tests import fixtures directly. Production normalizers retain only parsing, normalization, current-state filtering, and explicit empty/unavailable responses. No source path may call a sample factory.

### Controller and CSS seams

The private bootstrap owns only shell boot, session loss handling, tab registration, and feature-controller composition. Extract named Godeye/WiGLE and vision controllers with explicit dependencies and focused tests; retain shared pure map/normalization helpers where they are actually shared. Do not introduce a framework or a state-management package.

Extract only generic loader structure into one public-safe stylesheet. Public root colors, event-cover styles, and `operator-handoff` styling stay in `app/styles.css`. The anonymous `/operator` loader gets its own generic surface tokens. Nacre-Moiré/private console CSS remains private and must not be copied to root or loader assets.

## Constitution Check

| Constitution constraint | Result | Evidence / required action |
|---|---|---|
| Security-first and defense in depth | Pass after implementation | Retire echo; require an independent asset grant before private asset read; retain existing Cybermap Function token guards. |
| Privacy/anonymity by design | Pass after implementation | Root remains identity-free; no URL bearer, public sample record, private asset fallback, or asset-manifest listing. |
| Secure defaults | Pass after implementation | Missing/invalid shell session, asset grant, asset name, and source data each fail closed with explicit UI/API state. |
| API responses avoid implementation disclosure | Pass after implementation | Asset function has fixed allowlist and controlled denial; retired routes return 404. |
| Continuous security monitoring and review | Partial | The release requires current tests, scoped secret scan, Graphify refresh, independent review, deploy evidence, and live default-host verification. |

## Affected Structure

```text
app/
├── index.html
├── main.js
├── styles.css
├── staticwebapp.config.json
└── operator/
    ├── index.html                 # retain generic loader only
    ├── loader.js                  # retain generic handoff only
    ├── loader.css                 # new public-safe generic loader structure
    └── [remove static private console modules/styles/agent loader]

api/
├── operator-shell/index.js        # issue asset-only grant after token validation
├── operator-assets/{index.js,function.json} # new allowlisted private asset Function
├── _lib/operator-auth.js          # narrow asset-grant create/verify helpers if needed
├── _private/operator/
│   ├── shell.html
│   ├── nacre-moire.css
│   ├── nacre-moire-mark.svg
│   └── assets/                    # private CSS and operator ESM modules
├── cybermap-viewport/index.js     # preserve, do not broaden
├── cybermap-observations-batch/index.js # preserve, do not broaden
└── [remove echo/ and agent/]

tests/
├── adversarial-surface-remediation.test.mjs # new static/API boundary guardrail
├── operator-shell-api.test.mjs
├── ui-shell.test.mjs
├── root-login-handoff-browser.test.mjs
├── wigle.test.mjs
├── vision.test.mjs
└── fixtures/{wigle-sample-data,vision-sample-data}.mjs # new test-only records

docs/
├── blue-swallow-system-implementation-delta.md
├── static-web-app-functionality.md
├── vm-api.md
├── vm-echo-wiring.md
├── tzeentch-paper-api-status.md
└── nacre-moire-operator-design-system.md

.github/workflows/deploy-static-web-app.yml
README.md
specs/009-adversarial-surface-remediation/
```

## Serial Delivery Sequence

1. Preserve the current root-login repair and record baseline test evidence.
2. Write the remediation test guards first; observe specific RED failures for anonymous echo, public private-assets, Agent Lab, runtime samples, missing module seam, and historical-document markers.
3. Retire echo and its deployment/local/docs references; prove deliberate 404 while Cybermap test contracts remain green.
4. Build the private asset delivery boundary, migrate private console assets, and prove anonymous/malformed asset requests fail before private file reads.
5. Remove Agent Interface Lab and its placeholder Function/route/template/loaders/tests.
6. Move WiGLE/vision records to fixtures; preserve explicit empty/unavailable state behavior.
7. Extract controller/CSS seams and prove public/private token scope plus controller boundaries.
8. Label historical audit documents and redact obsolete documentation-only passcode text without modifying production configuration.
9. Reduce operator-only copy and verify the retained functional/accessibility contract.
10. Run focused suites, full repository suite, applicable VM suite, `git diff --check`, scoped secret review, and `graphify update .`; inspect graph integrity.
11. Obtain independent review. Only then commit, push, merge, deploy through the canonical workflow, and verify the live default host.

## Rollback

- Restore a reviewed prior mainline release through the repository release path; do not deploy a stale branch over main.
- Do not re-enable `/api/echo` or `/api/agent` as a rollback shortcut.
- If private asset grant deployment fails, keep the operator loader fail-closed and diagnose cookie/function routing rather than serving static private modules.
- If copy changes obscure a required error/empty/provenance/accessibility affordance, restore the prior local text while keeping completed security/data-boundary work.

## Verification Commands

```bash
node --test tests/adversarial-surface-remediation.test.mjs
node --test tests/operator-shell-api.test.mjs tests/ui-shell.test.mjs tests/root-login-handoff-browser.test.mjs
node --test tests/wigle.test.mjs tests/vision.test.mjs tests/wigle-api.test.mjs
node --test tests/cybermap-viewport-api.test.mjs tests/cybermap-ingest-api.test.mjs
node --test tests/*.test.mjs
(cd vm/cybermap-api && npm test)
git diff --check
graphify update .
```

`graphify update .` is a code-freshness check. Documentation-only changes may report that semantic document refresh requires an approved backend; that must be recorded separately and must not be presented as a semantic refresh.

## Complexity Tracking

| Decision | Why needed | Simpler alternative rejected because |
|---|---|---|
| Derived asset-only cookie and allowlisted asset Function | Browser module and stylesheet requests cannot carry the existing custom header safely. | Static assets expose private implementation; query-string bearers leak; reusing the bearer cookie would grant data/API access too broadly. |
| Private asset relocation plus controller extraction | The current static asset tree exposes the 2,109-line controller and embedded samples. | CSS/route hiding retains public source access and does not create a narrow testable boundary. |
| One public-safe loader CSS seam | Root/login and operator-loader structure overlap, while their identity/theme scopes must remain separate. | Copying selectors lets public/operator visual contracts drift and risks leaking private tokens to public assets. |
