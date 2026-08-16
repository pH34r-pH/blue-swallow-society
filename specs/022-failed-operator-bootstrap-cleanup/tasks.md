# Tasks: Failed Operator Bootstrap Cleanup

**Authority chain**: [spec.md](./spec.md) → [plan.md](./plan.md) → [tests.md](./tests.md) → this file

- [x] T001 Add controlled asset and private-main failure tests; record RED.
- [x] T002 Add loader-owned terminal cleanup for public/private sessions, URLs, and styles; convert failed bootstrap to `false`.
- [x] T003 Make the public login path clean up and render the standard branch when bootstrap declines or rejects.
- [x] T004 Run focused GREEN regressions, `git diff --check`, and Graphify refresh.

Independent-review handoff: require a fresh read-only staged-candidate review before commit; no deployment or live endpoint access is authorized.
