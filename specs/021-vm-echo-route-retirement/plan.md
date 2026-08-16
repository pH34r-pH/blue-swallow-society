# Implementation Plan: VM Echo Route Retirement

**Spec**: [spec.md](./spec.md)

## Technical Approach

1. Remove the `/echo` branch from `vm/cybermap-api/src/server.mjs`; the existing final not-found branch supplies the intentional 404 JSON contract.
2. Replace the legacy success test in `vm/cybermap-api/test/http.test.mjs` with a direct 404 regression test.
3. Change the public `__BACKEND_FQDN__` Caddy block in `infra/scripts/install-cybermap-api.sh` from catch-all proxying to a named path allowlist for health/readiness and existing Cybermap API paths, followed by `respond "not_found" 404`.
4. Add a root static contract test that extracts the public Caddy block and asserts the allowlist/default denial without inspecting generated secrets.

## Boundaries

- No deployment, remote VM access, or infrastructure provisioning.
- The existing mTLS `:8443` route remains unchanged.
- No application credentials or secret-bearing installer placeholders enter tests.

## Verification

```bash
cd vm/cybermap-api && npm test -- --test-name-pattern='echo|health and readiness'
cd ../.. && node --test tests/vm-echo-route-retirement.test.mjs
```
