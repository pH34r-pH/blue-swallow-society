# Bird-history validation

Use synthetic rows only. Exercise UTF-8/BOM, Unicode, quoted commas/newlines,
presence-only and unknown counts, invalid dates/counts, duplicate candidate
identities, different checklists, malformed quoting, invalid encoding, headers
and size bounds. Preview must not mutate public or durable state. Later cover
owner guard denial, idempotence, correction reconciliation, draft isolation,
explicit publication/unpublication, partial exports, recovery and all public
feeds. Real account/export validation requires separate authorized evidence.

The preview endpoint must deny unauthenticated, viewer, legacy and conflicting
credentials before touching the body; require exact Origin and method/content
type; bound and validate canonical base64; redact errors; and never write state.
Browser coverage must exercise owner sign-in, private preview, safe text rendering,
clear and exclusion of previewed records from the public journal.
Reconciliation tests cover unchanged reimport, field corrections, ambiguous
duplicates, absent snapshot records, omitted optional fields and invalid snapshots.
Snapshot storage tests use a fake Blob client to exercise initial create,
conditional updates, racing writers, invalid/truncated data, missing records,
field retention and redacted storage errors. Live storage remains unverified.
Owner preview tests cover a configured snapshot comparison, unconfigured status,
authorization before storage, redacted outages and the rendered summary.
Draft commit tests cover explicit selection, changed CSV or snapshot, ambiguous
or duplicate rows, retry after success, owner and origin denial, retention and
redacted failures. No commit publishes a record.
Browser coverage includes paginated selection, before/after review, successful
draft save and stale-revision rejection without a public-journal change. Changing
files clears old selection; cancelling an in-flight save reports uncertainty.
