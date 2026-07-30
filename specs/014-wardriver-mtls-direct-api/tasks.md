---
title: Wardriver mTLS direct API tasks
date: 2026-07-26
implements: specs/014-wardriver-mtls-direct-api/spec.md
---

# Tasks

- [x] T1. Add and run RED Node tests for proxy-bound mTLS batch and viewport behavior.
- [x] T2. Add store-level mTLS credential resolution and route handling.
- [ ] T3. **Partially complete:** declare Key Vault ownership, the `:8443` Caddy listener, trust-material injection, NSG ingress, CI parameters, and bounded external RaID public-key configuration. Live rollout remains blocked until GitHub and device-management trust configuration are provisioned; no PFX/private key is accepted.
- [ ] T4. **Partially complete:** Node tests, Bicep build, Bash syntax check, Azure Key Vault/certificate metadata inspection, live Caddy validation, and a no-client-certificate rejection probe pass. An isolated Caddy mTLS GET/POST/proxy-header proof and protected disposable PostgreSQL migration proof pass; an authorized device remains a release gate.
- [x] T5. Reconcile this package and the Wardriver Android package after end-to-end source validation.
- [x] T6. Add RED TST-014-07 GET catalog/artifact + POST feedback method/header tests, then align the Caddy allowlist and Node mTLS router. Preserve the 8443 KeyChain boundary; do not admit a token/browser fallback.
