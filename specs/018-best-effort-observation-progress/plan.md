---
title: Best-effort authenticated observation progress plan
created: 2026-07-29
implements: specs/018-best-effort-observation-progress/spec.md
---

# Plan

1. Extend `vm/cybermap-api/src/contracts.mjs` to parse v1 unchanged and parse v2 `progress` as a bounded decimal-string cursor. Derive the Wardriver maximum from every submitted external key; reject a progress cursor that is not exactly that derived value.
2. Extend `MemoryObservationStore` and `PostgresObservationStore` with a v2 resolution branch. New observations insert normally; exact scoped identities duplicate; v2 same-device changed-content identities contribute `preserved_conflict_count` without an observation mutation or insert. V1 retains its strict changed-content `409` path.
3. Persist v2 receipts transactionally. Add migration `0006_best_effort_observation_progress.sql` to extend `sync_batches` reconciliation count metadata and receipt constraints while preserving valid historical v1 rows. Do not update `observations`; preserve append-only triggers.
4. Keep existing authentication, idempotency-key, unscoped legacy, public error, and response-after-commit behavior intact. Only a valid v2 complete receipt becomes a durable v2 acknowledgement.
5. Add RED tests in contracts, memory, HTTP, Postgres scripted/store, and root migration contracts. Then implement the smallest changes that turn each test green.
6. Register the migration in readiness/installer/migration contract locations and document the new compatibility contract in the Cybermap API README or VM API documentation.

## Affected paths

- `vm/cybermap-api/src/contracts.mjs`
- `vm/cybermap-api/src/memory-store.mjs`
- `vm/cybermap-api/src/postgres-store.mjs`
- `vm/cybermap-api/db/migrations/0006_best_effort_observation_progress.sql`
- `vm/cybermap-api/src/main.mjs`
- `infra/scripts/install-cybermap-api.sh` if migration discovery is explicit
- `vm/cybermap-api/test/{contracts,memory-store,http,postgres-store}.test.mjs`
- `tests/cybermap-schema.test.mjs`
- `docs/vm-api.md`

No deployment occurs under this plan. Production rollout follows only after final source verification and explicit authorization.
