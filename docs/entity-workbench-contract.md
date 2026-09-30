# Entity workbench integration contract

Source extension for Society #44 with scoped VM/Functions routes and private shell integration.
Migration application and live deployment remain separate. No live data, settings, registration, grants or deployment are part of this work.

## Shared authorization and dispatch

`createEntityApiAdapter({store})` in `vm/cybermap-api/src/entity-api-adapter.mjs` calls the
canonical `api-access-token.cjs` validator and uses its immutable principal. List/detail require
`Owner.Read`; preview/mutate require `Entities.Write`. Actor is exactly validated
`principal.operatorId` (`tid + ':' + oid`). `Observations.Upload`, transitional read proofs,
application sessions and caller actor/principal headers cannot authorize corrections. Trusted
server tests may inject `verifyApiAccessToken`; request input cannot replace the validator.
See [common-api-auth-contract.md](common-api-auth-contract.md) for issuer/audience/owner/scope
checks and token lifetime. Logout does not revoke a copied API access token before expiry.

`createEntityRequestHandler({store})` in `entity-http.mjs` is an optional dispatch callback for
POST `/api/v1/entities/{list|detail|preview|mutate}`. It accepts JSON input up to 64 KiB,
rejects URL queries/other methods, returns private no-store JSON and maps bounded errors.
The server accepts optional entityStore injection; main constructs PostgresEntityStore on the
existing pool. Readiness requires migration 0007 when entities are wired. The same-origin
Functions adapter is POST `/api/cybermap/entities/{operation}` and revalidates API tokens before
proxying. Web sessions require a server-cached delegated API token with the operation scope;
legacy sessions/read proofs never grant access. No migration is run automatically.

`createEntityService({store, authorizeOwner, authorizeMutation})` is the lower-level trusted
service seam. Callbacks must verify exact owner and their respective operation scope before
returning `{exact_owner: true, actor_id}`. Missing mutation callback always denies preview/write,
even when read verification succeeds. Never wire this lower-level seam to unverified JSON.
The VM adapter accepts delegated API tokens. The Functions Web-session adapter preserves the
existing exact-origin checks and revalidates its server-cached delegated token for Entities.Write.

## Store and command shapes

`PostgresEntityStore({pool})` exposes `list(input)`, `detail(input)`,
`preview({actor_id, command})`, `mutate({actor_id, command})`. These are internal methods,
not authentication boundaries. Trusted machine code may call
`publishHypothesis({entity_id, expected_revision, version, device_ids, evidence_ids,
confidence, algorithm})`; there is deliberately no public model-write operation.

All correction commands contain `{action, entity_id, expected_revisions, idempotency_key,
reason, evidence_ids}` plus action fields:

| Action | Additional fields |
| --- | --- |
| create | device_ids, optional label; new entity expected revision 0 |
| label | label (text or null), labels (up to 20 tags) |
| membership | add, remove device ID arrays |
| reject | device_ids |
| split | new_entity_id with expected revision 0, device_ids proper subset |
| merge | source_entity_id and its expected revision |
| undo | assertion_id and expected revisions for all affected entities |

Commands affect at most two entities, each with at most 100 devices and 200 linked evidence
IDs. IDs are existing canonical cyber_entities device IDs and observations IDs; public/DeFlock
context is excluded. Unknown confidence and observation time remain null. Labels remain explicit
operator assertions. Immutable machine versions and assertions are separately inspectable.
Every assertion records database time, verified actor, reason/evidence/affected IDs, expected
revisions, before/after operator state and replay receipt. Original observations remain immutable.
Undo appends compensation only when the event's resulting revisions are still current. It cannot
rewind through intervening edits/model refreshes; an undo event can itself be compensated.
Merged/undone-created IDs remain resolvable tombstones with aliases/history. Model refresh retains
membership overrides/rejections and marks corrections for review; retired IDs reject refresh.

Preview validates/executes the same transaction then rolls back. Confirmation uses the same
command and expected revisions. Exact replay returns its original receipt; changed-key content
and stale revisions return 409. A preview never bypasses optimistic checks.

List supports search by operator label/tag or stable signature, device, modality, time range,
minimum confidence, review state, whitelisted sort/direction, limit 1–100 and offset 0–10000.
Detail uses independently bounded history/evidence/hypothesis pages with next_offset. Consumers
use this same machine/operator/effective-membership projection for later offline model wiring.

## Isolated private UI

`api/_private/operator/assets/entity-workbench.mjs` exports
`mountEntityWorkbench(root, {request})`. The injected request function maps `(operation,input)`
to the authorized same-origin adapter. The module/client are allowlisted private assets and mounted in the existing Entities tab. It has filters/pagination, evidence/history, reason/preview/confirm controls and
exact-key replay after uncertain confirmation failure. Chromium tests exercise keyboard/mobile,
empty/error/stale states and safe text. The private shell integration is tested through Functions, VM and real isolated PostGIS.
The ordinary Web login requests only Owner.Read. Explicit Enable editing acquisition extends
the existing owner-auth callback; see [entity-edit-authorization.md](entity-edit-authorization.md).
Read-only cache intent receives api_scope_denied for previews/writes even with a broader token.
Direct scoped API bearers and explicitly scoped cached tokens are supported. No live Microsoft
login/consent or deployed workbench is claimed.

#44 stays open: longitudinal scoring/precision-recall evaluation, offline synchronization,
Live grants/provider acceptance and separately approved live deployment remain.
