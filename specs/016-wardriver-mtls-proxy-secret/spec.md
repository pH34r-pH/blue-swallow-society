# Feature Specification: Wardriver mTLS Proxy Secret Delivery

**Feature Branch**: `fix/wardriver-mtls-caddy-proxy-secret`
**Created**: 2026-07-28
**Status**: Corrective release
**Input**: Tyler reports that Wardriver `2.110-bss.18` receives HTTP 403 during the `bss-upload` `mtls-response` stage.

## Incident

RaID did not run: camera state is `not-started`, detector state is `not-attempted`, and no local RaID error exists. Wardriver reaches the direct mTLS listener and receives HTTP 403.

The Cybermap API requires a Caddy-injected loopback assertion containing the client-certificate fingerprint and `BSS_MTLS_PROXY_SECRET`. The live Caddy process has the dedicated proxy-secret environment, but paired `header_up -X-Blue-Swallow-Mtls-*` removal rules delete the same fields that the trusted replacement directives set. Caddy therefore forwards neither assertion field, and the API correctly fails closed before credential lookup.

## Follow-on bss.31 enrollment-rejection incident

Wardriver `2.110-bss.31` reaches the direct `:8443` listener, reports KeyChain availability, and receives HTTP `403` after a response. The server records `mtls_credential_rejected`, rather than `invalid_proxy_assertion`. Therefore Caddy supplied a valid loopback mTLS assertion and the failure is inside the device-credential authorization predicate, not certificate transport, proxy-secret delivery, or a generic client re-enrollment event. The existing top-level category intentionally hides which fail-closed predicate rejected the request. This corrective scope adds a server-only, fixed subreason so one controlled retry can identify the minimum repair without logging identity or credential material.

## User Scenario & Acceptance

### US1 — Upload through the existing trusted Wardriver enrollment (P1)

A Wardriver build that presents a CA-trusted enrolled client certificate uploads its queued encrypted batch without re-enrollment after the infrastructure repair.

1. **Given** Caddy has accepted a client certificate on port 8443, **when** it proxies `/api/v1/observations/batch`, **then** it injects the configured proxy secret and the client-certificate fingerprint to the loopback-only API.
2. **Given** the API has received that assertion, **when** the `(device_id, certificate fingerprint)` tuple is enabled, unexpired, and scoped for `observations:write`, **then** the API accepts the batch or returns its normal application-level validation response.
3. **Given** an untrusted or missing certificate, **when** a client connects to port 8443, **then** Caddy continues to reject it before the API receives a trusted assertion.

## Edge Cases

- Caddy must not inherit PostgreSQL credentials or unrelated API secrets merely to receive the proxy secret.
- A missing dedicated Caddy environment file must cause service startup/reload failure rather than forwarding a blank assertion.
- A caller-supplied proxy assertion must not reach the API. Caddy's `header_up <name> <value>` replacement MUST overwrite it; separate `header_up -<name>` rules must not be retained because they delete the trusted replacements.
- The repair must not mutate device credentials, source enablement, client certificates, KeyChain aliases, app version, or encrypted outbox records.

## Functional Requirements

- **FR-001**: The installer MUST atomically create or replace a Caddy-only root-owned `0600` environment file containing only `BSS_MTLS_PROXY_SECRET`. The secret MUST never be written to a broader-permission destination, including transiently.
- **FR-002**: The installer MUST configure Caddy's systemd service to read that dedicated file before Caddy starts or restarts.
- **FR-003**: The Caddyfile MUST continue to obtain the injected secret only from `{env.BSS_MTLS_PROXY_SECRET}`; the secret MUST NOT be rendered into source, a Caddyfile, logs, or command arguments.
- **FR-004**: The installer MUST daemon-reload systemd and restart Caddy after changing the service environment.
- **FR-005**: The existing `require_and_verify` client-auth policy, trust pool, loopback proxy target, and Caddy `header_up` replacement of both client-controlled assertion fields MUST remain intact. The Caddyfile MUST NOT contain `header_up -X-Blue-Swallow-Mtls-Proxy-Secret` or `header_up -X-Blue-Swallow-Mtls-Client-Fingerprint`, because those removal rules delete the trusted replacement fields.
- **FR-006**: The repair MUST NOT add an Android or database credential bypass.
- **FR-007**: For a rejected mTLS observation batch or mTLS viewport request, server logs MUST record exactly one bounded authorization-stage category when applicable: `missing_ingest_credentials`, `invalid_proxy_assertion`, or `mtls_credential_rejected`. The client-facing response remains the existing generic `403 Forbidden`; an absent or invalid Caddy-to-API assertion, including a presented assertion when the server proxy secret is unconfigured, receives only the server-side `invalid_proxy_assertion` category. When and only when the category is `mtls_credential_rejected`, the same server-only record MUST contain exactly one `mtls_rejection_reason`: `binding_absent`, `binding_ambiguous`, `credential_disabled`, `credential_expired`, `required_scope_missing`, `source_disabled`, `provenance_mismatch`, or `policy_mismatch`. A record MUST NOT contain `mtls_credential_rejected` without one allowlisted reason; if the reason is absent or untrusted, it MUST omit both fields rather than synthesize or partially emit a credential-rejection diagnostic. The existing token-gated browser/SWA routes remain unchanged when no mTLS assertion is present. Logs and HTTP responses MUST NOT contain a proxy assertion, certificate fingerprint, device identifier, batch payload, viewport coordinates, database credential, or a value derived from any of them. Before sending any rejected POST response, the API MUST resume the request stream so an unread body cannot retain a keep-alive socket.
- **FR-008**: The credential store MUST classify a rejected mTLS tuple from one exact-tuple database snapshot. Every mTLS authentication attempt MUST have a complete normalized exact credential policy; when that policy is absent, the mTLS path MUST fail closed as the existing bounded `policy_mismatch` reason before tuple candidate selection, while malformed policy configuration MUST be rejected during initialization and ordinary token authentication remains unchanged. It MUST first evaluate every returned candidate with the complete former authorization predicate: enabled state, expiry, required scope, source state, provenance, and configured policy. It MUST authorize exactly one eligible candidate even when disabled, expired, or otherwise ineligible historical twins share its tuple; it MUST report `binding_ambiguous` only when two or more candidates are fully eligible; it MUST report `binding_absent` only when no exact-tuple candidate exists; and when all tuple candidates are ineligible it MUST select one allowlisted rejection reason by deterministic fail-closed order. Before a durable write, `applyBatch` MUST lock and recheck the chosen credential's bound source, provenance, metadata, and exact configured scope policy. A stored scope array MUST have the same members and cardinality as the configured unique scope policy; duplicate stored scope values are ineligible. The tuple lookup MUST NOT use an arbitrary row limit that can hide an eligible candidate. The shared policy normalizer MUST require nonempty string device/source identities, string provenance/metadata fields, a valid dynamic certificate fingerprint, and unique scope values. The in-memory route store MUST normalize and evaluate the same fields and predicate for route-level tests, including malformed expiry and absent/malformed source or provenance data; it MUST fail closed rather than authorize a tuple that the durable store would reject. It MUST attach only the fixed subreason to the in-process authorization error; it MUST NOT persist, return, or log the inspected tuple or candidate row values.

## Success Criteria

- **SC-001**: The installer contract proves Caddy receives only the dedicated proxy-secret environment file and that the file is root-owned `0600`.
- **SC-002**: After deployment, the Caddy service reports the proxy-secret environment as present without disclosing its value, and an internal malformed-body probe with the injected assertion reaches the API's normal `400 invalid_json` boundary rather than `403`.
- **SC-003**: Tyler reuses installed Wardriver `2.110-bss.18` and receives an upload success or a normal non-auth application response; `bss-upload/mtls-response` no longer records HTTP 403 for the repaired enrollment.
- **SC-004**: A post-deployment rejected field upload produces exactly one bounded server-side authorization-stage category per request, with no credential material in the log or HTTP response.
- **SC-005**: One controlled post-deployment retry that reaches `mtls_credential_rejected` records exactly one allowlisted `mtls_rejection_reason`; the resulting repair changes only the authoritative failing enrollment or policy state.
