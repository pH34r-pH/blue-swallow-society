# Cybermap API VM service

Node 20 scaffold for the VM-hosted Cybermap API gateway.

Runtime contract:
- Listens on `127.0.0.1:8000`; nginx terminates HTTPS 443 and proxies locally.
- `GET /healthz` returns secret-free process health and never checks PostgreSQL.
- `GET /readyz` is a placeholder that reports `pending-db-task` until PgBouncer/PostgreSQL wiring lands.
- `/api/v1/*` denies unauthenticated requests by default; configured bearer/operator tokens are read from runtime environment only.
- Emits structured JSON logs with request IDs.
- Enforces request body-size limits and exposes a `rateLimitHook` seam for the gateway hardening task.

Do not commit database URLs, passwords, or token values here. Use VM environment files or Azure app settings.
