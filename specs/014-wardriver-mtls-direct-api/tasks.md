---
title: Wardriver mTLS direct API tasks
date: 2026-07-26
implements: specs/014-wardriver-mtls-direct-api/spec.md
---

# Tasks

- [x] T1. Add and run RED Node tests for proxy-bound mTLS batch and viewport behavior.
- [x] T2. Add store-level mTLS credential resolution and route handling.
- [ ] T3. **Partially complete:** declare Key Vault ownership, the `:8443` Caddy listener, trust-material injection, NSG ingress, and CI parameters. Live deployment is blocked until the two new GitHub secrets are configured; no PFX/private key is accepted.
- [ ] T4. **Partially complete:** Node tests, Bicep build, Bash syntax check, and Azure Key Vault/certificate metadata inspection pass. A live `caddy validate`, no-certificate probe, spoofed-header probe, and authorized-device probe remain release gates.
- [x] T5. Reconcile this package and the Wardriver Android package after end-to-end source validation.
