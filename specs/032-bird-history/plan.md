# Bird-history implementation plan

Cornell's [personal export instructions](https://support.ebird.org/en/support/solutions/articles/48000838205-download-ebird-data)
describe a spreadsheet download; they do not establish an authenticated personal
history API or the owner's exact columns. Start with a private, bounded preview
of a candidate CSV layout and verify the actual export privately before calling
the format supported. Use `csv-parse` for strict CSV quoting, BOM handling and
record size limits. Reject malformed UTF-8, headers, oversized input and malformed
CSV. Do not return private rows through anonymous routes or log their content.

`POST /api/bird-import-preview` requires an Entra owner session, exact Origin,
JSON containing only canonical base64 CSV, and a 10 MiB decoded limit. Legacy
operator and password-viewer sessions cannot use it. Errors contain no input or
exception text; responses are private and no-store. The endpoint is a preview,
with no persistent side effects. The preview retains private fields only in memory and defaults every candidate
to draft. The checklist/species composite key is provisional: duplicates are
flagged ambiguous, never silently merged. Actual stable identity and correction
semantics require private export validation. Preview does not store or publish.
An owner-only import/reconciliation store, approval UI, sanitized publication,
unpublication, recovery and account feasibility checks remain required.

The reconciliation planner compares a candidate preview with a
versioned snapshot without mutating either. It reports additions, unchanged
records, field-level changes, ambiguous duplicate identities and the number of
existing records absent from the export. Missing records never cause deletion;
omitted optional columns never erase known private fields. Composite identity
is provisional and all actions require review. A changed species name may alter
the key and must not be treated as a known correction automatically.

A snapshot adapter uses a dedicated private Blob container, a
managed identity and a single versioned JSON blob capped at 16 MiB. It requires
`BSS_BIRD_HISTORY_ENABLED=true`, `BSS_BIRD_HISTORY_ACCOUNT` and
`BSS_BIRD_HISTORY_CONTAINER`; optional
`BSS_BIRD_HISTORY_MANAGED_IDENTITY_CLIENT_ID` selects an identity. It does not
create resources or issue credentials. Read validates exact snapshot structure,
record keys and content. Write checks the current revision and ETag, then uses
create-only or conditional upload; concurrent changes fail. Rows and existing
optional fields cannot disappear through this adapter. The owner commit service
builds selected draft updates, enforces authorization and handles conflicts;
this adapter alone does not approve or publish anything.

When storage is enabled, owner preview reads the latest snapshot and reports the
non-mutating plan and revision. A storage failure denies the preview rather than
assuming an empty history. When disabled, the preview states that comparison is
unavailable. Preview includes a SHA-256 fingerprint of the exact CSV, snapshot
and plan. `POST /api/bird-import-commit` re-parses the CSV, re-reads the snapshot,
requires that fingerprint and revision, and accepts only an explicit bounded set
of unambiguous added/changed rows. It preserves omitted rows and optional fields,
then performs a conditional draft-only write. A stale preview or racing write
returns a conflict. This fingerprint binds a review to inputs; it is not an
authentication credential. The owner interface displays paginated rows, shows
before/after values for changes, and commits only individually selected rows.
It clears preview state on commit, uncertainty, cancellation, expiry or teardown;
after an unconfirmed write the owner must preview again before retrying.
Selecting another file discards the old review. The file control is disabled
while a request is active; interrupting a save reports that it may have completed.

The `/owner/birds` page restores an Entra owner session, sends a selected file to
the preview endpoint, and displays paginated records and summary as text. It
retains the CSV only in memory for a possible selected draft commit and clears it
on request, expiry and page teardown. It does not publish records.

The unconnected publication planner builds an explicit publish/unpublish
projection from validated drafts and the current publication. It copies only
approved public fields, accepts a separately chosen public place and never
copies coordinates, comments, raw export or checklist IDs. Public sighting IDs
use a stable independent secret HMAC key, preventing simple reversal of the
provisional checklist/species key. That key is not configured or provisioned
yet; rotation requires an explicit migration strategy to preserve unpublication.
Unknown counts are rejected until the journal can display them distinctly from
presence-only sightings. The planner itself performs no writes. Public storage,
owner approval UX, conditional publication, unpublish and recovery remain open.
