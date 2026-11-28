---
schema_version: 1
document_id: blue-swallow-society/bird-history
role: feature
feature_id: bird-history
revision: 1
target_status: mature-complete-product
approval_status: proposed
artifact_acceptance: candidate-review
delivery_status: designed-only
delivery_evidence: []
qualifiers: [living-spec-paradigm, brownfield-characterized, spec-kit-mapped]
---

# Private bird-history import

This feature is the living form of `specs/032-bird-history/`, which stays in place as retained history. It characterizes the behavior of the owner-only import, draft reconciliation and publication planning that exists today. The owner interface, the public bird journal feed and real-export validation are outside this specification.

## Product description

The site owner can import a personal eBird export privately, review which records are added, changed, duplicate or rejected, and save selected records as drafts. Every imported record is a draft. Nothing is published by importing. A planner can turn explicitly approved drafts into a sanitized public projection and can remove selected records from it; the planner changes nothing by itself.

Only the owner can import. A password viewer, an anonymous caller or a caller presenting conflicting credentials cannot import, preview, save, publish or read private locations, notes or account details. A partial export never implies deletion. Presence-only counts, unknown counts and exact counts stay distinct. The actual owner's export format is unverified, so the supported columns are a candidate layout.

## Actors and acceptance scenarios

| Story | Actor and outcome | Independent acceptance scenarios |
| --- | --- | --- |
| BH-US1 | The owner previews an export without changing anything | AS1: an authenticated owner who submits a valid export receives every candidate record as an unpublished draft with its private fields, the rejected rows with reasons and a summary. AS2: nothing is stored or published by a preview. AS3: an anonymous caller, a viewer or a caller with conflicting credentials is denied before the request body is read. |
| BH-US2 | The owner compares an export with saved drafts | AS1: with draft storage configured, each candidate is classified as added, changed, unchanged or ambiguous, changed fields show before and after values, and existing records missing from the export are counted and never deleted. AS2: omitted optional columns never erase saved private fields. AS3: if storage fails, the comparison is refused and an empty history is never assumed. |
| BH-US3 | The owner saves selected rows as drafts | AS1: only explicitly selected added or changed rows are saved, as drafts, and unselected records and saved private fields are preserved. AS2: a changed export, a changed saved history, a replayed request, an ambiguous or unchanged row, or a racing writer saves nothing. |
| BH-US4 | The owner plans a sanitized publication | AS1: an explicit publish action copies only approved public fields; coordinates, comments, raw export and checklist identifiers never appear and public IDs are not derivable from drafts. AS2: an unpublish action removes only the selected record and keeps unrelated published records. AS3: unknown counts, conflicting or unknown actions and malformed public state are refused. |

## Functional requirements

| ID | Required observable behavior |
| --- | --- |
| BH-FR-001 | Import preview and draft save accept only an authenticated owner. A request with no credential, a password-viewer credential or conflicting credentials is denied before its body is read, and a deployment whose authentication mode is not an owner mode is denied with `owner_required`. |
| BH-FR-002 | Preview and save accept only `POST` with no query string, the exact configured public origin and a JSON content type. Other methods or a query string return 405 `method_not_allowed`, a wrong or missing origin returns 403 `origin_forbidden`, and another content type returns 415 `unsupported_media_type`. |
| BH-FR-003 | A preview body has exactly one field, `csvBase64`, holding canonical padded base64 whose decoded size is between 1 byte and 10 MiB; a raw body larger than the encoded bound is refused. A save body has exactly the fields `csvBase64`, `revision`, `digest` and `selectedRows`. Any other shape, non-canonical base64 or size violation returns 400 with `invalid_request` or `invalid_export_size`. |
| BH-FR-004 | An export is UTF-8, optionally with a byte-order mark, and strict CSV with quoted commas and newlines. It has at most 100,000 data rows and no record over 64 KiB. The header has the required columns `Submission ID`, `Common Name`, `Scientific Name`, `Count` and `Date` and may add `Time`, `Location`, `Latitude`, `Longitude`, `State/Province`, `Country`, `Checklist Comments` and `Species Comments`; empty, duplicate or oversized header names and missing required columns are unsupported. Failures report `invalid_export_size`, `invalid_export_encoding`, `invalid_export_csv` or `unsupported_export`. |
| BH-FR-005 | A row is a candidate only if its submission ID is `S` followed by 1 to 20 digits (any letter case), its common name is 1 to 120 characters, its scientific name is 1 to 160 characters, its date is a real calendar day in `YYYY-MM-DD` form and its count is valid. A count of `X` is presence-only, an empty count is unknown, and a positive whole number of up to nine digits without leading zeros is exact. Any other row is rejected with its row number and the reason `invalid_required_value`; no count or date is ever guessed. |
| BH-FR-006 | Every candidate is a draft with a provisional identity. The provisional key is the SHA-256 of the upper-cased submission ID and the lower-cased scientific name, so keys ignore letter case. Candidates sharing a key in one export are all marked ambiguous and never merged; different submissions stay distinct. A preview reports that it publishes nothing and that the export format coverage is unverified, with counts of rows, candidates, rejected rows and ambiguous candidates. |
| BH-FR-007 | A preview has no persistent side effect on durable or public state, and every response is private and not cacheable. |
| BH-FR-008 | Reconciliation compares candidates with a saved history without changing either. It classifies each candidate as add, change, unchanged or ambiguous and lists the changed fields. Optional columns missing from an export never erase saved private fields. Existing records missing from the export are counted and the plan states that nothing is deleted. A malformed saved history or one with duplicate keys is refused. The plan always requires review and writes nothing. |
| BH-FR-009 | Saved drafts live in one versioned snapshot in a dedicated private store. Storage is available only when it is explicitly enabled and configured with valid account and container names. An absent snapshot reads as an empty history at revision 0. A read validates the exact structure, keys and contents. A write must carry the next revision and the current version tag, is create-only for the first revision and conditional afterwards, and fails as a conflict if anything changed. A write can never remove an existing record or an existing private field. Storage failures are reported without details. |
| BH-FR-010 | When draft storage is enabled, a preview from an authorized owner also reads the latest snapshot and reports the reconciliation plan, the snapshot revision, before and after values for each changed field, and a SHA-256 digest that binds the exact export, snapshot and plan. A storage failure refuses the preview with 503 `preview_unavailable`. When storage is disabled the preview reports that comparison is not configured. |
| BH-FR-011 | A save re-reads the export and the snapshot and proceeds only if the revision and the digest still match. It accepts an explicit list of 1 to 1,000 distinct row numbers, each at least 2, each planned as an added or changed record. It merges those rows as drafts, keeps every unselected record and every saved private field, and writes conditionally. It returns the new revision, the number imported and `publication: draft`. A stale revision, a changed export, a replay or a racing writer returns 409 `bird_snapshot_conflict`; an invalid selection, including ambiguous or unchanged rows, returns 400 `invalid_bird_selection`; a storage failure returns 503 `import_unavailable`. A save never publishes. |
| BH-FR-012 | Publication planning takes validated drafts, the current public publication and explicit actions, and returns the new publication without writing it. It needs 1 to 1,000 actions with distinct draft keys, each publish action carrying a place of at most 120 characters with no surrounding space or control characters, and a secret key of 32 to 128 bytes. A published record copies only the species, common and scientific names, observation date, count, the source `eBird` and the chosen place; a presence-only count publishes as no count. Public IDs are keyed hashes of the draft key, so a different secret yields different IDs. Unknown counts, conflicting or unknown actions, an unpublish of an unpublished record and malformed existing public state are refused as `invalid_bird_publication`. An unpublish removes only the selected record and unrelated published records remain. |
| BH-FR-013 | An error response contains only a fixed error code. It never contains the submitted content, an exception message, a private field or a storage detail. |

## Success criteria

| ID | Observable measure |
| --- | --- |
| BH-SC-001 | Every independent case in the bird-history test contract passes. |

## Boundaries

This feature does not verify the owner's real export format or Merlin coverage, authenticate to eBird or any account, display or paginate records in the owner interface, publish to the public journal, provision the publication secret, or recover from a failed publication. The owner interface at `/owner/birds` and the public journal feed at `/api/bird-journal` are outside this specification and remain unspecified until they are onboarded.
