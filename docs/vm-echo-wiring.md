# Historical VM echo wiring (retired)

> **Historical record:** This file preserves the pre-Cybermap echo-lab design. The anonymous `/api/echo` route, its Function proxy, and its app setting were retired on 2026-07-26. The deployed route now returns 404.

## Former topology

The retired lab used a VM-local Python `GET /echo` service behind an anonymous Static Web App Function. It was a connectivity proof only; it is not a current product, deployment, or supported local-development path.

The VM gateway now installs `vm/cybermap-api` behind HTTPS. See [VM API Specification](./vm-api.md) and [Cybermap Geospatial Backend](./cybermap-geospatial-backend.md) for the active architecture.
