# Anonymous entity workbench (#44)

Status: source implementation; activation, owner-auth integration, UI and deployment remain separate.

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
owner-gated HTTP integration and a keyboard/browser-tested workbench. Do not close #44 here.
