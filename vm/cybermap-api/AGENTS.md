# Society Cybermap API map

[`src/server.mjs`](src/server.mjs) and [`src/main.mjs`](src/main.mjs) compose
the VM HTTP service and stores. [`src/auth.mjs`](src/auth.mjs),
[`src/api-access-token.cjs`](src/api-access-token.cjs), and
[`src/owner-read-auth.mjs`](src/owner-read-auth.mjs) own token and owner-scope
authentication. The boundary is:

```text
Functions or authenticated device client
  -> auth.mjs / api-access-token.cjs / owner-read-auth.mjs
  -> contracts.mjs and route-specific validators
  -> PostgresObservationStore, PostgresEntityStore, history/global stores
  -> append-only observations, derived cells, entities, receipts, and progress
```

[`src/contracts.mjs`](src/contracts.mjs) owns the observation/receipt/idempotency
invariants; [`src/postgres-store.mjs`](src/postgres-store.mjs) owns device ingest
persistence; [`src/history-store.mjs`](src/history-store.mjs) and
[`src/history-query.mjs`](src/history-query.mjs) own bounded capture history;
`src/entity-*` plus [`src/entity-postgres-store.mjs`](src/entity-postgres-store.mjs)
own the entity projection and scoped optimistic corrections; `src/world-*` and
`src/greenfeed-*` own separate public aggregate materialization.
[`db/migrations/`](db/migrations/) is ordered schema authority and is not run
implicitly by the application.

Preserve immutable observations, device/source/idempotency binding, exact durable
receipt validation, owner scope checks, no raw-token logging, and the distinction
between capture location and inferred emitter location. Fixtures under `test/`
are synthetic and never fallback runtime data. A source implementation or local
PostGIS test does not prove a deployed VM, applied production migration, or field
device upload.

Focused checks:

```bash
npm test --prefix vm/cybermap-api
node --test vm/cybermap-api/test/contracts.test.mjs vm/cybermap-api/test/http.test.mjs vm/cybermap-api/test/postgres-store.test.mjs
node --test vm/cybermap-api/test/entity-workbench*.test.mjs vm/cybermap-api/test/entity-api-adapter.test.mjs
node --test vm/cybermap-api/test/history-*.test.mjs vm/cybermap-api/test/global-viewport*.test.mjs
git diff --check
```

For disposable PostGIS coverage, use the exact service/database environment
from the applicable GitHub workflow. Do not point tests at a personal or
production database.
