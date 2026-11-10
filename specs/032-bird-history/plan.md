# Bird-history implementation plan

Cornell's [personal export instructions](https://support.ebird.org/en/support/solutions/articles/48000838205-download-ebird-data)
describe a spreadsheet download; they do not establish an authenticated personal
history API or the owner's exact columns. Start with a private, bounded preview
of a candidate CSV layout and verify the actual export privately before calling
the format supported. Use `csv-parse` for strict CSV quoting, BOM handling and
record size limits. Reject malformed UTF-8, headers, oversized input and malformed
CSV. Do not return private rows through anonymous routes or log their content.

The preview retains private fields only in memory and defaults every candidate
to draft. The checklist/species composite key is provisional: duplicates are
flagged ambiguous, never silently merged. Actual stable identity and correction
semantics require private export validation. Preview does not store or publish.
An owner-only import/reconciliation store, approval UI, sanitized publication,
unpublication, recovery and account feasibility checks remain required.
