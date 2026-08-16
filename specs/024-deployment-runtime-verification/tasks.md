# Tasks: Deployment Runtime Verification Gates

**Authority chain**: [spec.md](./spec.md) → [plan.md](./plan.md) → [tests.md](./tests.md) → this file

- [x] T001 Add source-contract coverage for workflow dependencies, installer receipt timing, and runtime verification; record RED.
- [x] T002 Add `validate-source` and explicit deployment dependencies.
- [x] T003 Write the post-migration receipt and bounded runtime verifier.
- [x] T004 Add `verify-runtime` workflow integration with OIDC and protected-probe secret handling.
- [x] T005 Route every deployment/runtime Azure CLI command through one bounded, redacting adapter; pin workflow Actions to immutable commits; require strict monotonic close-deadline enforcement; scrub child credentials; carry secure values only by temporary mode-0600 files; retain least-privilege OIDC and disabled lifecycle scripts; add RED/GREEN source and hung-process contracts.
- [x] T006 Run focused source contracts, relevant regression suites, syntax/config checks, Graphify refresh, and clean-diff checks.
- [x] T007 Repair the independent review findings: replace adapter stdout capture with mode-0600 result files, use explicit Azure child-environment allowlists and sensitive-argument rejection, bound/redact custom-domain OIDC/ARM execution, then add RED/GREEN behavior and source contracts.
- [x] T008 Re-run focused source contracts, relevant regression suites, syntax/config checks, Graphify refresh, and clean-diff checks for the repaired candidate.
- [x] T009 Freeze and materialize the pre-remediation candidate for independent review; the review found the Azure-derived GitHub-output injection defect.
- [x] T010 Repair the exact review finding: schema-validate and control-character-reject Azure-derived deployment outputs before `GITHUB_OUTPUT`, then scope and clear the SWA deployment token with RED/GREEN contracts.
- [x] T011 Re-run focused contracts, syntax/config checks, index-bound Graphify regeneration, and clean-diff validation for the repaired candidate.

Independent-review handoff: a fresh read-only staged-candidate review is external evidence, not a task checkbox. It must bind the final staged tree and cached-patch Git blob before commit; no deployment or live endpoint access is authorized.
