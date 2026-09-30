# Entity workbench integration contract

Source-only extension for Society #44; no HTTP routes or migration activation are installed.
The entity work is isolated from the owner-Entra/shell integration task.

`createEntityService({ store, authorizeOwner, authorizeMutation })` returns `handle(request)`.
`authorizeOwner(request)` must verify the exact configured owner through trusted middleware,
and return `{ exact_owner: true, actor_id: <stable verified subject> }`. It must never derive
that result from unverified client JSON, a display name, or a forwarded actor header. Missing
verifier or missing/invalid owner context denies every operation. The service accepts an
already bounded/parsed request `{ operation, input }`; the adapter must cap HTTP bodies at
64 KiB and apply the existing same-origin/session/CSRF policy before invoking it.

Operations: `list`, `detail`, `preview`, `mutate`. Store methods: `list(input)`, `detail(input)`,
`preview({actor_id, command})`, `mutate({actor_id, command})`. Trusted model code may call
`publishHypothesis({entity_id, expected_revision, version, device_ids, evidence_ids,
confidence, algorithm})`; this is deliberately not a service operation.

Mutation command: `{ action, entity_id, expected_revisions, idempotency_key, reason,
evidence_ids, ...action fields }`. Allowed actions: create, label, membership, reject,
split, merge, undo. Actor/time/provenance are server-owned. A preview executes the same
validation and transaction, then rolls back; confirmation sends the same command to mutate.
A preview is not authorization to bypass revision checks. Errors expose bounded code/status.

HTTP wiring is reserved for the parent integration task. Recommended private same-origin
adapter uses POST bodies for queries to keep labels/signatures out of URL/access logs.
Do not expose routes until exact-owner verification is connected and denial tests pass.
Do not claim UI or offline model synchronization complete from this store alone.

## Mutation authorization proposal for parent review (not implemented)

Following Society #94, owner-read proof is READ ONLY. The factory has a separate
`authorizeMutation(request)` callback for preview/mutate, with no fallback to the read
callback. Leave it absent until the parent chooses the hosting/auth topology. Legacy mode
must never supply an actor. The verified actor is exactly `tid + ':' + oid` from the
Functions owner session or a separately validated delegated access token.

Proposed narrow standard-token boundary if Functions continues proxying VM writes: use a
separate approved API resource audience and delegated write scope, with exact issuer,
audience, expiry and immutable owner tenant/object validation at the VM. A read scope,
service credential, owner-read proof, ID token, or caller actor header cannot grant writes.
Functions first calls requireOperatorToken and retains exact-origin protection for cookie
writes. App grants/audience/scope provisioning and route wiring require parent decision;
this domain code defines none. Avoid adding another signing-key protocol to this feature.

Parent's finalized code-only scope contract: `Owner.Read` for list/detail and
`Entities.Write` for preview/mutate (supersedes tentative Entities.Read). The future token
adapter receives immutable `{tenantId, objectId, operatorId, scopes}` and checks the required
operation scope before constructing `{exact_owner: true, actor_id: principal.operatorId}`.
The single Society resource uses v2 audience equal to API client ID and application ID URI
`api://<API_CLIENT_ID>`. Required signature/issuer/audience/lifetime/owner validation stays in
the shared adapter, never in this store. `Observations.Upload` alone cannot access entities.
No grants or registration are created by this change. Standard API token lifetime is distinct
from the five-minute application session and 30-second transitional read proof; logout does
not revoke a previously issued API token before its expiry.

## Isolated private UI module

`api/_private/operator/assets/entity-workbench.mjs` exports
`mountEntityWorkbench(root, {request})`. The injected request function maps
`(operation, input)` to the future owner-gated same-origin adapter. No endpoint, asset
allowlist, shell import or navigation link is added here. Do not serve this module publicly.
It has list filters/pagination, detail/evidence/history, preview/confirm/reason controls,
and reuses the same idempotency key on an uncertain confirmation retry. Integration remains
blocked on the final shared adapter and private shell work; this module is not a live UI.
