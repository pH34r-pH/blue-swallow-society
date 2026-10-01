# Blue Swallow Society — Project Context

## Current navigation map

The source-grounded system map is [`docs/current-source-map.md`](docs/current-source-map.md).
Use it for the current companion dashboard, authenticated observation upload boundary,
entity authorization path, paper-only runtime, and the distinction between source,
deployment, and physical-device evidence. The dated implementation delta and repair
plans remain historical/scientific records; do not rewrite them to make them look
current.

Directory maps narrow these rules without replacing them:

- [`app/AGENTS.md`](app/AGENTS.md) — public entrypoint, owner sign-in handoff, and route shell.
- [`api/AGENTS.md`](api/AGENTS.md) — Functions authentication, same-origin proxies, and release metadata.
- [`api/_private/operator/AGENTS.md`](api/_private/operator/AGENTS.md) — token-gated companion shell/assets.
- [`vm/cybermap-api/AGENTS.md`](vm/cybermap-api/AGENTS.md) — VM API, PostGIS projections, ingest, history, and entities.
- [`docs/AGENTS.md`](docs/AGENTS.md) — source-state versus historical documentation routing.

When a change crosses a boundary, update the narrowest map and the current source map
in the same change. `.github/workflows/documentation-artifact.yml` derives changed
paths from Git, always runs the artifact guard, and runs pinned markdownlint-cli2 and
lychee only when changed living Markdown is selected. It uses hosted read-only CI;
the empty selection must be byte-empty so code-only changes skip doc tools cleanly.

## Purpose and source of truth

This repository delivers the Blue Swallow Society web system: a public owner
sign-in surface, a separately loaded authenticated companion dashboard, Azure
Static Web Apps Functions, VM/API integration, and the planned Cybermap PostGIS
store. The browser never receives the private companion shell anonymously, and
checked-in source does not by itself prove deployment.

- Start with `docs/blue-swallow-system-implementation-delta.md` to distinguish deployed, working-tree, prototype, schema-only, and designed-only behavior.
- Read the active feature package under `specs/<NNN-feature>/` before implementation. Preserve the prior Spec Kit instruction from `CLAUDE.md`: the current plan owns project-specific technologies, paths, and commands.
- Architecture and operational contracts belong in `docs/`; deployable infrastructure belongs in `infra/`; Node backend code and migrations belong in `vm/cybermap-api/`.

## Architecture boundaries

- The browser calls `/api/*`; it does not call the VM directly.
- Public/cover and authenticated operator surfaces stay separate. Do not expose operator APIs, downloads, shell assets, credentials, or internal topology on the public surface.
- Operator routes fail closed. Preserve `X-Blue-Swallow-Operator-Token` validation and the existing signed-session behavior.
- Wardriver delivery is operator-gated. Do not restore a public APK path or bypass the release manifest flow.
- The Cybermap ingest boundary is authenticated and idempotent. Do not claim a designed service is deployed without deployment evidence.

## Security, privacy, and cloud rules

- Keep secrets, passcodes, hashes, connection strings, tokens, and private endpoints out of source, browser bundles, logs, and test fixtures.
- Preserve GitHub OIDC deployment. Do not add static Azure credential JSON or widen network access without explicit approval.
- Treat PII, precise location, and RF observations as sensitive. Preserve consent, minimization, and the owned/local-trigger boundary for enrichments.
- Tzeentch runtime code must not seed or fall back to synthetic/demo feeds. Fixtures belong under tests only.

## Spec Kit and change authority

For every material feature, use and reconcile:

```text
spec.md → plan.md → tests.md → tasks.md
```

- `spec.md` owns observable behavior and acceptance.
- `plan.md` owns technical approach, constraints, paths, and tooling.
- `tests.md` owns validation design and traceability.
- `tasks.md` owns executable work only.
- Repair a contradiction at the earliest authoritative artifact, then regenerate downstream work. Use explicit actors, conditions, expected results, error behavior, and evidence.

## Verification and delivery

- Reconcile tasks against current source before implementation; do not recreate existing behavior.
- Run focused tests first, then relevant regressions. Root contract tests use `node --test tests/*.test.mjs` when applicable. The Cybermap API has its own `npm test` workflow in `vm/cybermap-api/`.
- Treat infrastructure, workflow, deployment, and release changes as separate verification surfaces. Record what was actually exercised.
- Do not deploy, publish, rotate credentials, or make external writes unless the task explicitly authorizes that action.
- After source changes, run `graphify update .` from the repository root. Keep semantic/private corpus content local unless cloud routing is explicitly approved.

## Repository hygiene

- Keep public-facing BSS styling separate from authenticated operator language.
- Preserve exact identifiers, API fields, commands, URLs, hashes, and legal text.
- Keep changes scoped. Do not reformat unrelated files or rewrite historical specifications merely to make them look current.
