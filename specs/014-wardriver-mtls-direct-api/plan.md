---
title: Wardriver mTLS direct API plan
date: 2026-07-26
implements: specs/014-wardriver-mtls-direct-api/spec.md
---

# Plan

1. Keep the browser/SWA listener on TCP 443 unchanged. Add a dedicated Caddy TCP 8443 site for the same backend FQDN. Its `tls` block requires and verifies the trusted Wardriver certificate. Caddy sets the proxy marker only for this route and proxies to Node at `127.0.0.1`.
2. Add a Key Vault Bicep resource that matches the provisioned vault: RBAC authorization, purge protection, 90-day soft-delete retention, and no secret-valued outputs. The deployment workflow obtains only the public certificate for Caddy trust material through OIDC.
3. Extend the Node request router with explicit mTLS-only POST routes. Validate the trusted proxy marker before parsing a body. Keep the existing GET viewport and token paths unchanged.
4. Add `authenticateMtls` to both stores. It resolves the existing enabled device/source row and required scope but never accepts an app token. The route still verifies body/header device and idempotency identity.
5. Extend the VM installation template with the trusted public certificate, the Caddy mTLS site, and an NSG rule for 8443. Do not bind Node outside loopback.
6. Execute Node tests, Bicep build/what-if, Caddy validation, and Azure read-only inspection. Deployment remains CI-driven.
