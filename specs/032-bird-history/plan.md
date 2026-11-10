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

The unconnected reconciliation planner compares a candidate preview with a
versioned snapshot without mutating either. It reports additions, unchanged
records, field-level changes, ambiguous duplicate identities and the number of
existing records absent from the export. Missing records never cause deletion;
omitted optional columns never erase known private fields. Composite identity
is provisional and all actions require review. A changed species name may alter
the key and must not be treated as a known correction automatically.

The `/owner/birds` page restores an Entra owner session, sends a selected file to
the preview endpoint, and displays a bounded sample and summary as text. It
clears on request, expiry and page teardown; no source file or preview is stored.
The sample limit is explicit and does not represent a full record review.
