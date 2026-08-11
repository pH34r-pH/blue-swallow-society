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

## Follow-on bss.31 authorization repair

The current field receipt proves the post-Caddy path reaches `store.authenticateMtls`. The current PostgreSQL lookup collapses an absent/ambiguous binding, disabled or expired credential, missing required scope, disabled source, credential/source provenance disagreement, and configured-policy disagreement into one `forbidden` error. The repair must preserve that generic public error while assigning one server-only fixed reason to the same in-process error.

1. Consolidate PostgreSQL and memory mTLS eligibility into `mtls-credential-policy.mjs`. The shared normalizer must require a complete exact policy with nonempty string identity/provenance/metadata values, unique scopes, and a dynamic valid certificate fingerprint; it must reject malformed policy configuration rather than coercing it.
2. Require that exact policy for every `authenticateMtls` call. When no complete policy is configured, both stores must fail closed as bounded `policy_mismatch` before reading or classifying tuple candidates; ordinary token authentication remains unchanged.
3. Change `PostgresObservationStore.authenticateMtls` to select the complete exact `(device_id, certificate fingerprint)` candidate row set without an arbitrary pre-eligibility cap, then apply the shared former authorization predicates to every candidate in deterministic fail-closed order. Authorize one fully eligible candidate; reject only two or more fully eligible candidates as `binding_ambiguous`; retain a deterministic fixed reason when none is eligible.
4. Carry the bound mTLS policy into the locked `applyBatch` credential recheck. PostgreSQL must require bidirectional scope containment and equal array cardinality so duplicate stored values cannot satisfy the unique configured scope policy. A post-auth rotation of source, provenance, metadata, fingerprint, or scope state must reject before durable work. Attach only the approved fixed rejection reason to a forbidden error. Preserve a successful credential object and all existing authorization behavior, including a valid credential beside an ineligible historical twin.
5. Update `MemoryObservationStore` to use the same shared normalizer and complete predicate for route-level tests. Missing or malformed fields fail closed; the memory store must not authorize a tuple the durable store would reject.
6. Project `mtls_credential_rejected` and its allowlisted `mtls_rejection_reason` atomically at the logger boundary. If either half is absent or untrusted, omit both diagnostic fields; preserve the generic HTTP response.
7. Run the local real Caddy → API → disposable PostGIS proof before deployment. The proof must cover a valid binding and one wrong/unbound fingerprint without printing certificate, device, or database material.
8. Deploy only the reviewed backend correction. Ask for one controlled field retry, collect only its fixed Diagnostics fields, and use the server-only reason to apply the minimum authoritative enrollment/policy repair. Do not rotate a client certificate unless the reason and certificate authority separately require it.

## Affected Files

- `infra/scripts/install-cybermap-api.sh`
- `vm/cybermap-api/test/mtls-installer-contract.test.mjs`
- `vm/cybermap-api/test/spec-authority-integrity-contract.test.mjs`
- `vm/cybermap-api/src/{postgres-store,memory-store,mtls-credential-policy,server}.mjs`
- `vm/cybermap-api/test/{postgres-store,memory-store,mtls-direct-api,local-proof-contract}.test.mjs`
- `specs/016-wardriver-mtls-proxy-secret/{spec,plan,tests,tasks}.md`

## Security Boundary

The proxy secret remains deployment-scoped and Caddy-only. The Caddy process receives no PostgreSQL or API token environment values. mTLS trust, certificate verification, assertion replacement, API loopback binding, credential scope checks, and encrypted Android outbox behavior remain unchanged.