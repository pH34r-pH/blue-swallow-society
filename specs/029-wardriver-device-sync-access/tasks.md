# Executable tasks

- [x] Reconcile source, maintained SDK support, owner/signature model, and Android contract.
- [x] Establish spec, implementation plan, and validation design.
- [x] Implement bounded device proofs and stateless signed challenges.
- [x] Implement atomic invitation/membership/replay state and signed roster repair.
- [x] Implement managed-identity user delegation grants and POST Function binding.
- [x] Add focused crypto, route, concurrency, and scope tests.
- [x] Document provisioning, wire contract, and current source boundary.
- [x] Run source regressions and record actual host validation or tooling blocker.
- [ ] Qualify configured deployment, live prefix enforcement, and phone behavior.

The final item is an operational evidence gate, not satisfied by source tests or
an emulator. No cloud resource mutation is part of this implementation task.

## Verification recorded 2026-11-03

- Node 24.22.1: 21 focused sync tests and 353 complete public source tests pass.
- Changed Markdown passes markdownlint-cli2 0.18.1; the changed-path artifact
  guard and `git diff --check` pass.
- Actual Functions Core Tools 4.16.0 / runtime 4.1054.250.26428 loads the source
  binding. All six disabled POST actions return 503 `sync_unavailable`; a synthetic
  configured challenge returns 200 with a verified RS256 signature; an invalid
  proof returns 401. No cloud storage access is attempted by these probes.
- The original host cannot download its extension bundle through this execution
  environment. The local HTTP probes use an isolated host configuration with
  only `extensionBundle` omitted and the actual source/bindings unchanged.
  Missing local `AzureWebJobsStorage` produces a health warning; this is route
  evidence, not full unchanged-host or production qualification.
- The existing OCI workflow now checks the new disabled POST bindings through
  its actual container host. Its next CI run and live managed-identity/prefix
  authorization remain separate evidence gates.
