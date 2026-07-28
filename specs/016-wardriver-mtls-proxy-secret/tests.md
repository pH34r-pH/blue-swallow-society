# Test Design: Wardriver mTLS Proxy Secret Delivery

| ID | Level | Requirement | Expected evidence |
|---|---|---|---|
| TST-001 | Installer contract | FR-001–FR-004 | The installer creates a private temporary Caddy secret file under `umask 077`, writes it with root-only permissions, atomically renames it, installs a Caddy-only systemd drop-in, reloads systemd, and restarts Caddy. |
| TST-002 | Installer security contract | FR-002–FR-006 | The Caddy drop-in does not consume `/etc/bss/cybermap-api.env`; no secret literal is embedded; the mTLS Caddy assertion overwrite and client-auth rules remain present. |
| TST-003 | Live configuration | SC-002 | Remote read-only checks report API and Caddy active, API secret present, Caddy proxy-secret environment present, and no secret value is emitted. |
| TST-004 | Live boundary | SC-002 | An internal loopback malformed-body request carrying the Caddy assertion returns normal `400 invalid_json`, proving the proxy assertion reaches the API; no batch is stored. |
| TST-005 | Physical device | SC-003 | Existing bss.18 uploads through its selected KeyChain identity without HTTP 403. |
| TST-006 | API unit contract | FR-007 | mTLS batch and viewport routes classify absent ordinary credentials, invalid or unconfigured proxy assertions, and rejected `(device_id, certificate fingerprint)` tuples with one of the three bounded diagnostic categories. Every client response remains the established generic `403`; test records contain no header, fingerprint, device identifier, secret, batch, or viewport-coordinate values and suppress an untrusted error diagnostic. An early rejected POST resumes its unread request stream before responding. Existing token-gated requests with no mTLS assertion remain unchanged. |
| TST-007 | Live field correlation | SC-004 | A new Tyler retry is correlated with one server-side diagnostic category per failed request, without emitting client identity or credential material. |

## TDD Sequence

1. Expand `mtls-installer-contract.test.mjs` for TST-001 and TST-002; run it against current source and observe failure because no Caddy-only environment file or service drop-in exists.
2. Implement only the dedicated-file and systemd-drop-in provisioning changes.
3. Re-run TST-001/TST-002, then the complete Cybermap and repository Node suites.
4. Deploy and collect TST-003/TST-004 receipts. Tyler supplies the required physical TST-005 receipt.
5. After a post-deployment `403`, add TST-006 RED contracts for sanitized authorization-stage logging, then implement and verify them before a bounded live TST-007 retry.
