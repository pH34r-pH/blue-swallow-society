# Cybermap API VM service

Node 20 scaffold for the VM-hosted Cybermap API gateway.

Runtime contract:
- Listens on `127.0.0.1:8000`; nginx terminates HTTPS 443 and proxies locally.
- `GET /healthz` returns secret-free process health and never checks PostgreSQL.
- `GET /readyz` checks DB configuration, PostgreSQL connectivity, and the latest `schema_migrations` version. Missing DB settings return sanitized HTTP 503 without crash-looping.
- `/api/v1/*` denies unauthenticated requests by default. Auth uses `CYBERMAP_AUTH_REGISTRY_JSON` or `CYBERMAP_AUTH_TOKEN_HASHES`; registry records carry `tokenHash` values in `sha256:<hex>` form, not plaintext tokens.
- Token identity maps to `clientType` (`wardriver_device`, `swa_proxy`, `jetson`, `greenfeed_worker`, `operator_admin`), scopes, source IDs, and `source_class` grants.
- Source IDs/classes supplied by clients are claims only; middleware verifies them against the env-loaded runtime registry before route handlers run. The `api_tokens` / `api_token_source_scopes` tables are durable admin/persistence scaffolding until the DB-backed registry loader lands.
- Public HTTPS ingest/read paths are rate-limited by default via `CYBERMAP_INGEST_RATE_LIMIT`, `CYBERMAP_READ_RATE_LIMIT`, and their window settings. Set `CYBERMAP_PRIVATE_MESH_ONLY=true` only for a real private-mesh-only VM.
- Implements bounded read APIs for `GET /api/v1/cybermap/viewport`, `GET /api/v1/cybermap/cells/{h3Cell}`, `GET /api/v1/entities/{id}`, and `GET /api/v1/sources`. Viewport zoom is mapped in app code to stored `gh7`/`gh9`/`gh11` cells; grey/orange/red exposure layers are filtered unless the caller has matching source-class/operator/authorized-scope authority, local/owned materialized layers are omitted when the token only has green source authority, and viewport `since`/ordering/truncation use caller-visible projected freshness rather than raw mixed-authority cell metadata.
- Read responses include freshness, provenance, caveats, salience/confidence where available, and bounded observation/source links. They never select or serialize raw observation payloads, raw frame refs, or raw PII columns.
- Emits structured JSON logs with request IDs plus `auth_decision` events. Logs include token ID/client type/scope counts, never bearer values or token hashes.
- Enforces request body-size limits before DB-backed routes exist.

Token rotation/revocation:
- Generate high-entropy bearer values outside the repo and store only `token_hash` / `tokenHash` (`sha256:<hex>`) in the runtime registry or DB.
- Rotate by adding a new hash with `expires_at` / `expiresAt`, deploying/reloading, moving the client, then setting the old row `revoked_at` and removing the old runtime JSON entry.
- Revoke by deleting the runtime hash and setting `revoked_at` in `api_tokens`; do not log or return the revoked plaintext value.

Do not commit database URLs, passwords, bearer values, or token registry material containing anything except hashes. Use VM environment files, Azure app settings, or operator-managed secret paths.
