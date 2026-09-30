# Anonymous entity workbench (#44)

Status: integrated source with synthetic end-to-end validation; live migration/deployment remain separate; explicit Web edit authorization is implemented in source.

An exact-owner authenticated operator can inspect anonymous clusters, create and label them,
correct device membership, reject associations, split, merge and undo. These are assertions,
never identification of a person. Original observations and machine hypotheses remain immutable.
Public/DeFlock sources cannot contribute evidence or membership. Unknown confidence remains null.

Every mutation records verified actor, database time, reason, evidence IDs, affected entity IDs,
expected revisions and idempotency key. Identical replay returns the original result; changed
content under the same key and stale revisions return 409. Split/merge affect at most two
clusters and 100 devices per cluster. Undo compensates one event only while every affected
cluster still has that event's resulting revision. It never overwrites intervening work.
Old IDs remain resolvable as tombstones/aliases. Model refresh increments the revision and
preserves corrections while requesting review. List, detail and model consumers use the
same projection, with measured evidence, machine hypothesis and operator assertion separate.

Full #44 acceptance still requires longitudinal scoring/evaluation, offline sync wiring,
production scoring and offline synchronization; HTTP/private UI are integrated and browser tested in source. Do not close #44 here.

An owner starts with read-only Web access. Choosing Enable editing performs a same-origin POST
with a valid owner session and starts incremental Entra authorization for Entities.Write on the
configured Society API. State, nonce and PKCE bind the callback to that session. Only validated
ID/API tokens with Owner.Read and Entities.Write enable correction controls. Cached token claims
alone cannot elevate a read-only session. Cancellation, denied scopes, wrong owner/nonce and
provider failure preserve a valid read-only session; expiry/logout require a new sign-in.
Live registration, grants/provider acceptance and physical deployment remain separate.
