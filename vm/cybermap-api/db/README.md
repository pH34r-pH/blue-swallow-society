# Cybermap database migrations

This directory uses ordered, checked-in PostgreSQL SQL migrations. P0 intentionally keeps the runner simple: apply each file in lexical order with `psql` against a disposable database for local verification, then against the managed PostgreSQL instance during deployment.

## Apply locally

```bash
createdb bss_cybermap_dev
psql bss_cybermap_dev -v ON_ERROR_STOP=1 -f vm/cybermap-api/db/migrations/0001_cybermap_core.sql
psql bss_cybermap_dev -v ON_ERROR_STOP=1 -f vm/cybermap-api/db/migrations/0002_device_ingest_contract.sql
psql bss_cybermap_dev -c 'SELECT postgis_full_version();'
```

Or point `DATABASE_URL` at an explicit libpq URL:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/bss_cybermap_dev'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f vm/cybermap-api/db/migrations/0001_cybermap_core.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f vm/cybermap-api/db/migrations/0002_device_ingest_contract.sql
```

## Migration contract

- Files are immutable once applied; append a new numbered migration for changes.
- `schema_migrations` records applied versions.
- `0001_cybermap_core.sql` enables PostGIS and pgcrypto, creates the observation ledger, and materializes Cybermap cells.
- `0002_device_ingest_contract.sql` adds scoped device credential digests, durable sync receipts, observation content hashes, and batch links. It never stores raw ingest tokens.
- H3 cells (`h3_7`, `h3_9`, `h3_11`) are app-computed. Do not require a PostgreSQL H3 extension in P0.
- Canonical source-class mapping: `public_greenfeed -> green_public`, `owned_greenfeed -> green_owned`, `authorized_greenfeed -> green_authorized`.
- Green source classes may preload globally. Grey/orange/red rows must include local or explicitly authorized trigger metadata (`trigger_observation_id`, `session_id`, or `authorized_scope_ref`).
- Raw frames and PII are disabled by default. Store summary payloads in JSONB; explicit raw artifacts live behind retention classes plus operator approval references.
