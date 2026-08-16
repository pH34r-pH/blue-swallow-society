# Feature Specification: Deployment Runtime Verification Gates

**Feature Branch**: `fix/issue-34-deployment-runtime-gates`
**Created**: 2026-08-15
**Status**: Active
**Input**: Society issue #34

## Scope

The canonical deployment workflow must reject an invalid source candidate before it changes Azure resources. After deployment, it must verify bounded runtime evidence without returning credentials, downloading artifacts, or modifying application data.

## Functional Requirements

- **FR-001**: A `validate-source` job must complete before `deploy-infra` and `deploy-app` can start.
- **FR-002**: The validation job and VM installer must install every API and VM lockfile tree with package lifecycle scripts disabled, run the complete hermetic root contract suite, run the complete VM API suite, syntax-check the VM installer, and validate every Azure Function `function.json` file.
- **FR-003**: The deployment jobs must declare the validation job as a dependency. A failed validation job must block Azure login, ARM deployment, runtime setting changes, and SWA upload. The validation job MUST not receive an OIDC token; Azure OIDC permission is job-scoped only to jobs that use Azure Login.
- **FR-004**: The VM installer must write a bounded public receipt only after all ordered migrations succeed. The receipt must contain the immutable source revision, archive SHA-256, installation timestamp, and exact applied migration versions; it must not contain credentials.
- **FR-005**: A `verify-runtime` job must run only after infrastructure and SWA deployment succeed. It must fail closed if the deployed VM receipt is absent, malformed, over its bound, or does not match `GITHUB_SHA` and the repository migration set.
- **FR-006**: Runtime verification and deployment provisioning must perform bounded Azure CLI operations only through a single adapter. Every adapter invocation must have a monotonic execution deadline, including a close event at or after that deadline, bounded stdout/stderr capture, and best-effort ordinary child-process-tree termination on timeout or output overflow. The adapter must use an explicit safe child-environment allowlist, reject sensitive argument forms and inherited sensitive values, and never use stdout as a data channel. A bounded Azure result needed by a workflow step must be written only to a caller-owned mode-0600 ephemeral file and removed after use. The adapter and workflow must never emit Azure CLI diagnostics, deployment `statusMessage` values, command arguments, inherited credential values, or other data that can contain credentials; they may emit only bounded local verdicts. Secure deployment parameters and SWA app-setting updates must be materialized only in mode-0600 ephemeral files, passed to Azure by file reference, then removed; no secret value may enter Azure CLI argv or the Azure child environment. Before an Azure-derived deployment value reaches `GITHUB_OUTPUT`, a local helper with a scrubbed environment must parse it from the bounded result file, require the fixed origin/resource-name schemas, reject every control character, and serialize only the validated values. The dynamically acquired SWA deployment token must be masked, control-free, available only through the deploy action and its cleanup step, and cleared before another job step can use it. The custom-domain OIDC/ARM helper must also run through a bounded wrapper with a minimal explicit OIDC environment and must reject or redact unbounded/raw remote diagnostics. Runtime verification must also perform bounded, retrying HTTPS reads of backend `/healthz` and `/readyz` and an existing read-only protected metadata probe. It must record only status/provenance verdicts, never secrets or download URLs.
- **FR-007**: Every GitHub Action `uses:` reference in the deployment workflow MUST pin a full 40-character commit SHA, with the reviewed human version retained as a comment.

## Acceptance Criteria

1. The workflow source makes validation a graph dependency of both deployment jobs.
2. The post-deploy verifier checks immutable provenance, migration receipt, health, readiness, and a protected route via bounded non-destructive reads.
3. A local source-contract test fails if a required gate or bound is removed.
4. A local source-contract test fails if a required gate, bound, direct Azure CLI call, mutable Action ref, raw Azure diagnostic, secret argv transfer, or lifecycle-enabled lockfile install is introduced.
5. Local process tests prove both a hung Azure-command wrapper and a close observed at its monotonic deadline reject; the validation job cannot mint an Azure OIDC token.
