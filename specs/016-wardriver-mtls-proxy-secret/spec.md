# Feature Specification: Wardriver mTLS Proxy Secret Delivery

**Feature Branch**: `fix/wardriver-mtls-caddy-proxy-secret`
**Created**: 2026-07-28
**Status**: Corrective release
**Input**: Tyler reports that Wardriver `2.110-bss.18` receives HTTP 403 during the `bss-upload` `mtls-response` stage.

## Incident

RaID did not run: camera state is `not-started`, detector state is `not-attempted`, and no local RaID error exists. Wardriver reaches the direct mTLS listener and receives HTTP 403.

The Cybermap API requires a Caddy-injected loopback assertion containing the client-certificate fingerprint and `BSS_MTLS_PROXY_SECRET`. At incident time, the Caddy process had the dedicated proxy-secret environment but its service unit did not load that file before proxying, so the API received no valid assertion and rejected the request.

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
- **FR-007**: For a rejected mTLS observation batch or mTLS viewport request, server logs MUST record only one bounded authorization-stage category when applicable: `missing_ingest_credentials`, `invalid_proxy_assertion`, or `mtls_credential_rejected`. The client-facing response remains the existing generic `403 Forbidden`; an absent or invalid Caddy-to-API assertion, including a presented assertion when the server proxy secret is unconfigured, receives only the server-side `invalid_proxy_assertion` category. The existing token-gated browser/SWA routes remain unchanged when no mTLS assertion is present. Logs MUST NOT contain a proxy assertion, certificate fingerprint, device identifier, batch payload, viewport coordinates, or database credential. Before sending any rejected POST response, the API MUST resume the request stream so an unread body cannot retain a keep-alive socket.

## Success Criteria

- **SC-001**: The installer contract proves Caddy receives only the dedicated proxy-secret environment file and that the file is root-owned `0600`.
- **SC-002**: After deployment, the Caddy service reports the proxy-secret environment as present without disclosing its value, and an internal malformed-body probe with the injected assertion reaches the API's normal `400 invalid_json` boundary rather than `403`.
- **SC-003**: Tyler reuses installed Wardriver `2.110-bss.18` and receives an upload success or a normal non-auth application response; `bss-upload/mtls-response` no longer records HTTP 403 for the repaired enrollment.
- **SC-004**: A post-deployment rejected field upload produces exactly one bounded server-side authorization-stage category per request, with no credential material in the log or HTTP response.
