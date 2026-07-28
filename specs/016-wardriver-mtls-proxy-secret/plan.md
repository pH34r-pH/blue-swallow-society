# Implementation Plan: Wardriver mTLS Proxy Secret Delivery

**Branch**: `fix/wardriver-mtls-caddy-proxy-secret` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

## Root Cause

The direct client certificate succeeds at Caddy: the live API recorded three forbidden 403 responses and Caddy recorded no TLS errors. The active database has an eligible credential for the unchanged build default `wardriver-primary`.

The fault is between Caddy and the API. The installer writes `BSS_MTLS_PROXY_SECRET` to `/etc/bss/cybermap-api.env` for the API, while its Caddyfile refers to `{env.BSS_MTLS_PROXY_SECRET}`. The Caddy systemd unit has neither that environment nor a dedicated `EnvironmentFile`. Caddy therefore forwards no valid proxy secret; `mtlsProxyAssertionIfPresent()` rejects the assertion before `authenticateMtls()` can evaluate the credential tuple.

## Approach

1. Keep the existing API environment file unchanged.
2. During installation, create a private temporary file in `/etc/caddy` under `umask 077`, write the already validated proxy secret, enforce `0600`, and atomically rename it to `/etc/caddy/bss-mtls-proxy.env`. Root ownership follows the root-run installer.
3. Create a Caddy systemd drop-in that references only that dedicated file.
4. Run `systemctl daemon-reload` and restart Caddy after the drop-in exists.
5. Prove the installer contract RED→GREEN, then deploy through the canonical Society workflow.
6. Verify only boolean presence and status remotely; do not print, hash, or copy the proxy secret, certificate fingerprint, database credentials, or device identifiers.
7. If a field upload or mTLS viewport request returns `403`, log one server-only, bounded rejection stage: missing ordinary credentials, invalid Caddy-to-API assertion (including an absent server assertion configuration), or mTLS credential rejection. Keep every client-facing rejection as the existing generic `403`; preserve token-gated requests with no mTLS assertion. Drain the unread POST request stream before responding. Never log client headers, certificate fingerprints, device identifiers, batch data, viewport coordinates, or secret material. Use the resulting category to choose whether credential remediation is justified.

## Affected Files

- `infra/scripts/install-cybermap-api.sh`
- `vm/cybermap-api/test/mtls-installer-contract.test.mjs`
- `specs/016-wardriver-mtls-proxy-secret/{spec,plan,tests,tasks}.md`

## Security Boundary

The proxy secret remains deployment-scoped and Caddy-only. The Caddy process receives no PostgreSQL or API token environment values. mTLS trust, certificate verification, assertion replacement, API loopback binding, credential scope checks, and encrypted Android outbox behavior remain unchanged.