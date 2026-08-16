# Tasks: Cybermap Proxy Byte Bounds

**Authority chain**: [spec.md](./spec.md) → [plan.md](./plan.md) → [tests.md](./tests.md) → this file

- [x] T001 Add declared and streaming oversized request/response regression tests; record RED.
- [x] T002 Implement shared 1 MiB Cybermap boundary helpers.
- [x] T003 Apply helpers to viewport/projection, global, ingest, tiles, and paper-state routes.
- [x] T004 Run focused GREEN suites, Graphify refresh, and clean-diff checks.

Independent-review handoff: a fresh read-only staged-candidate review is external evidence, not a task checkbox. It must bind the final staged tree and cached-patch Git blob before commit; no deployment or live backend request is authorized.
