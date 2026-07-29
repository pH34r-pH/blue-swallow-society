# Implementation Plan: Wardriver mTLS Proxy Secret Delivery

**Branch**: `fix/wardriver-mtls-caddy-proxy-secret` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

## Root Cause

The live bss.19 receipt proves that the direct `:8443` endpoint, endpoint policy, and Android KeyChain material are valid. Caddy and the API are active; Caddy has the dedicated proxy-secret environment. The API recorded only `missing_ingest_credentials`, so the failure is before mTLS credential lookup.

The Caddyfile's paired `header_up -X-Blue-Swallow-Mtls-*` removal rules delete the same fields that the later `header_up X-Blue-Swallow-Mtls-* <trusted value>` directives set. As a result, Caddy forwards neither assertion field even though its process has the secret. The API correctly selects no mTLS assertion and then reports `missing_ingest_credentials` before it can evaluate the enrolled tuple.

## Approach

1. Remove only the two conflicting `header_up -X-Blue-Swallow-Mtls-*` removal rules. Retain the two `header_up X-Blue-Swallow-Mtls-* <trusted value>` directives, which replace client-supplied values.
2. Keep the existing dedicated Caddy proxy-secret environment file and the API environment file unchanged.
3. Keep the Caddy-only systemd drop-in and restart ordering unchanged.
4. Prove the installer contract RED→GREEN, then deploy through the canonical Society workflow.
5. Verify only boolean presence and status remotely; do not print, hash, or copy the proxy secret, certificate fingerprint, database credentials, or device identifiers.
6. Verify the corrected proxy assertion against an internal malformed-body boundary before requesting one new field upload. Do not make Tyler retry while the defect remains deployed.
7. If the post-fix field upload returns `403`, correlate one server-only, bounded rejection stage: missing ordinary credentials, invalid Caddy-to-API assertion (including an absent server assertion configuration), or mTLS credential rejection. Keep every client-facing rejection as the existing generic `403`; preserve token-gated requests with no mTLS assertion. Drain the unread POST request stream before responding. Never log client headers, certificate fingerprints, device identifiers, batch data, viewport coordinates, or secret material.

## Affected Files

- `infra/scripts/install-cybermap-api.sh`
- `vm/cybermap-api/test/mtls-installer-contract.test.mjs`
- `specs/016-wardriver-mtls-proxy-secret/{spec,plan,tests,tasks}.md`

## Security Boundary

The proxy secret remains deployment-scoped and Caddy-only. The Caddy process receives no PostgreSQL or API token environment values. mTLS trust, certificate verification, assertion replacement, API loopback binding, credential scope checks, and encrypted Android outbox behavior remain unchanged.