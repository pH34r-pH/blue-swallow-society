# Tasks: VM Echo Route Retirement

**Authority chain**: [spec.md](./spec.md) → [plan.md](./plan.md) → [tests.md](./tests.md) → this file

- [x] T001 Add the VM `/echo` 404 regression assertion and the public-Caddy allowlist static contract test; run both and record RED.
- [x] T002 Remove the `/echo` handler and add an explicit public Caddy path allowlist plus default 404 response.
- [x] T003 Run focused GREEN tests and affected VM suite; verify health/readiness remains green.
- [x] T004 Run `git diff --check`, refresh Graphify, and obtain an independent scoped review (PASS; VM and focused contracts green).
