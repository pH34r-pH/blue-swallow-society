---
title: Wardriver mTLS direct API
status: accepted
date: 2026-07-26
---

# Wardriver mTLS Direct API

## Purpose

Wardriver must read Azure/PostGIS aggregates and upload staged observations without an app-embedded API credential.

## Definitions

- **Client certificate**: the exportable PFX certificate `wardriver-mtls-2026` in Key Vault `bsswdmtls3f85618`. The operator downloads it through Azure, imports it into Android KeyChain, then selects its alias in Wardriver.
- **mTLS ingress**: the dedicated backend listener on TCP 8443. Caddy verifies the client certificate before it proxies to the loopback-only Node API.
- **Browser ingress**: the existing TCP 443 route used by SWA and browser clients. It is unchanged.

## Functional requirements

- **FR-1**: Caddy must require and verify the Wardriver client certificate on TCP 8443. TCP 443 must keep its current behavior.
- **FR-2**: The mTLS ingress must expose only `POST /api/v1/cybermap/viewport`, `POST /api/v1/observations/batch`, `GET /api/v1/raid/models/catalog?channel=field`, `GET /api/v1/raid/models/releases/{release_id}/artifact`, and `POST /api/v1/raid/models/releases/{release_id}/feedback`. The catalog allows only the exact `channel=field` query; catalog/artifact compatibility is carried in bounded singleton headers, never a GET body or device/model query parameter.
- **FR-3**: Node must accept an mTLS request only when it receives the trusted proxy marker over its loopback-only listener. Direct HTTP headers must not authenticate a public client.
- **FR-4**: A valid mTLS batch must require `device_id` and `idempotency_key`, preserve idempotency, and resolve its enabled source credential without an app-supplied ingest token.
- **FR-5**: A valid mTLS viewport request must use body fields `lat`, `lon`, `radiusMeters`, and `limit`; it must return aggregate-only data and must not include persisted raw RF observations or precise observation coordinates.
- **FR-6**: The existing token-gated browser/SWA endpoints must remain available and unchanged.
- **FR-7**: Infrastructure must declare the RBAC/purge-protected Key Vault and expose only its non-secret URI. Deployment must supply the public trust certificate to Caddy without storing the PFX/private key in GitHub, the repository, logs, or VM extension output.

## Acceptance

Node tests prove FR-3 through FR-6. Caddy configuration validation proves mTLS listener syntax and proxy restrictions. Azure inspection proves the vault is RBAC-enabled, purge-protected, and holds one enabled exportable RSA-3072 client certificate. A deployment is not claimed until its CI evidence exists.
