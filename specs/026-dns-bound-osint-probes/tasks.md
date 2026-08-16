# Tasks: DNS-Bound OSINT HTTPS Probes

**Authority chain**: [spec.md](./spec.md) → [plan.md](./plan.md) → [tests.md](./tests.md) → this file

- [x] T001 Add deterministic DNS binding, peer mismatch, redirect, and slow-trickle deadline regressions; record RED.
- [x] T002 Replace raw hostname fetch with pinned HTTPS transport, absolute deadline, and peer validation.
- [x] T003 Run OSINT security regression tests and static/syntax checks.
- [x] T004 Refresh Graphify, run `git diff --check`, and obtain an independent security review (PASS; focused tests passed five times) before commit.
