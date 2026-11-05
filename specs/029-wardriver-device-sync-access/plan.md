# Implementation plan

Follow the existing Node 24 CommonJS Azure Functions layout. Use maintained `jose`
compact JWS and Node RSA key parsing, `@azure/identity` managed identity, and
`@azure/storage-blob` user delegation SAS. Pin the Blob SDK to 12.33.0, whose
`isDirectory`/`directoryDepth` support emits prefix grants for flat Blob namespaces.

Implement `api/wardriver-sync/{index.js,function.json}` and focused
`api/_lib/wardriver-sync-{auth,store}.js`. One group container holds datasets under
`devices/`, the public signed `group.json`, and inaccessible control metadata at
`_control/wardriver-sync-state.json`. Conditional ETag writes serialize invitation
claiming, proof consumption, membership, and roster revisions. Conditional public
roster publication reconciles from the latest control revision after interruption.

The pinned owner authorizes the deployed roster signer; the owner's private key
never leaves its device. Invitations carry the public signer pin. All client
proofs use RSA 2048/4096, SHA-256, PKCS#1 v1.5, compact JWS, and canonical base64url
SPKI DER. No bespoke signature encoding or alternative authentication fallback.

The service grants `r` on the `devices` prefix, `c` on the authenticated device's
`objects` prefix, `cw` on that device's exact `head.json`, and `r` on exact
`group.json`, with HTTPS and five-minute expiry. No caller supplies grant paths.
Managed identity requires container data access and account-scoped user delegation
key permission. The container remains private; Shared Key fallback is forbidden.

Document the client wire contract and protected provisioning inputs in
`docs/wardriver-device-sync-access.md`; reconcile API and current source maps.
Run focused crypto, route, and concurrent state tests, then existing API/runtime
regressions. Use a real Functions host when local tooling is available; record
tooling, Node/runtime, or cloud configuration blockers explicitly.

Issue a purpose-typed RS256 update-read grant only after successful active-member authorization and an explicit device allowlist check. Validate issuer, audience, exact claims and lifetime at the private development endpoint before storage access. Keep update access optional and isolate configuration failure from dataset grants.
