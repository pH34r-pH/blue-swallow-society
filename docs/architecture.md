# Architecture decisions

## Product architecture

Blue Swallow Society is moving from an echo-backend scaffold to a **Cybermap-first geospatial product**.

Primary surfaces:

- **Azure Static Web Apps** handles the public frontend, Godeye, Tzeentch, and managed `/api/*` proxy routes.
- **VM API gateway** handles authenticated product APIs, ingest validation, small worker jobs, and PostgreSQL access.
- **Azure Database for PostgreSQL Flexible Server** is the durable Cybermap source of truth.
- **Blue Swallow Wardriver / RaID** posts owned/local observations and reads nearby Cybermap context.
- **Jetson / Mosaic / Murmurs** pulls observation/memory summaries and writes distilled memory events.

The old echo service remains only as a connectivity scaffold. The target backend is documented in [`docs/cybermap-geospatial-backend.md`](./cybermap-geospatial-backend.md).

## Target data flow

```text
Wardriver / RaID
  -> POST /api/v1/observations/batch
  -> VM API gateway
  -> PostgreSQL/PostGIS observation ledger
  -> Cybermap cell/entity materialization
  -> RaID nearby context response

Browser / Godeye
  -> Static Web App
  -> /api/* Function proxy
  -> VM API gateway
  -> GET /api/v1/cybermap/viewport
  -> Cybermap cells/entities with provenance and caveats

Jetson / Mosaic / Murmurs
  -> GET /api/v1/memories?since=...
  -> POST /api/v1/memories
  -> claim/direct-observation feedback loops
```

## Core decision

Cybermap is not a UI overlay and not a demo map. It is the materialized fusion layer produced from:

- Green public/owned/authorized source catalogs
- owned/local Wardriver and RaID observations
- direct observation packets
- Mosaic/Murmurs memory events
- explicit, provenance-marked enrichment gated by source class

Godeye and RaID are two views into the same Cybermap spine:

- **Godeye**: public website map view, backed by viewport/cell APIs.
- **RaID**: native field AR view, backed by foreground device observation plus nearby Cybermap context.

## Non-goals

- no runtime demo/fake feed data in production paths
- no browser-side Wi-Fi scanning
- no private-camera probing or grey/red visual jack-in
- no raw-frame/PII warehouse by default
- no direct browser access to PostgreSQL
