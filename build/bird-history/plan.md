---
artifact: implementation-plan
revision: 1
acceptance: candidate-review
---

# Bird-history implementation plan

This plan owns the technical choices for the private bird-history import. Behavior and acceptance live in the feature specification; requirements are referenced by ID. The earlier plan in `specs/032-bird-history/plan.md` stays as history, and open work stays in `specs/032-bird-history/tasks.md` and issue #122.

## Implementation targets and direct path

**Component and consumers.** `api/_lib/bird-owner-request.js`, `bird-export-preview.js`, `bird-reconciliation.js`, `bird-snapshot-store.js`, `bird-draft-import.js` and `bird-publication-plan.js`, with the Functions `api/bird-import-preview/index.js` and `api/bird-import-commit/index.js`, implement BH-FR-001 through BH-FR-013. The real consumers are the owner page `app/owner/birds.mjs`, which calls both routes, and any future publication step, which will call `planBirdPublication`.

**Current and target implementation.** The implementation is Node.js CommonJS (Node 24, as `api/package.json` requires) running as Azure Functions. CSV parsing uses `csv-parse` in synchronous mode. Draft storage uses `@azure/storage-blob` with `@azure/identity` managed identity. This is the accepted implementation decision; no port is planned.

**Reuse.** `csv-parse` supplies strict quoting, byte-order-mark handling and the record size limit. `node:crypto` supplies SHA-256, HMAC and constant-time comparison. The Azure SDK supplies conditional blob writes by ETag.

**Direct path and state.** A request passes `authorizeRequest` first, which checks the authentication mode, the owner session, the method and query string, the exact origin and the content type, and only then reads and decodes the body. Preview parses the export in memory, optionally reads the snapshot and returns a reconciliation plan; it holds no state after the response. Save re-parses the export and re-reads the snapshot, checks the digest in constant time, merges the selected rows and writes one conditional blob update. All durable state is the single snapshot blob. Publication planning is a pure function of the snapshot, the current publication, the actions and a secret. The handler factories take their authorizer, authentication mode, environment and store as parameters so tests can substitute them; the production defaults are fixed at build time.

**Layer dispositions.**

| Layer | Disposition | Duty |
| --- | --- | --- |
| `bird-owner-request.js` | Retain | One shared authorization and request-shape gate for both routes (BH-FR-001, BH-FR-002). |
| `bird-export-preview.js` | Retain | Strict parse, validation and provisional identity (BH-FR-004 to BH-FR-006). |
| `bird-reconciliation.js` | Retain | Pure, non-deleting comparison with a saved history (BH-FR-008). |
| `bird-snapshot-store.js` | Retain | The only storage boundary, with revision and ETag concurrency (BH-FR-009). |
| `bird-draft-import.js` | Retain | Digest binding and selected-row merge (BH-FR-010, BH-FR-011). |
| `bird-publication-plan.js` | Retain | Pure sanitized publication projection, not yet connected (BH-FR-012). |
| Route handlers | Retain | Status mapping and redaction (BH-FR-003, BH-FR-013). |

**Objective and preserved acceptance.** Preserve every requirement. Real-export verification, durable publication, unpublication recovery and the owner interface remain open work in `specs/032-bird-history/tasks.md`.

**Unresolved decisions and local discretion.** The provisional checklist and species key is not a verified stable identity. The publication secret is not provisioned, and rotating it needs a migration plan that preserves unpublication. Implementation tasks may choose private helper names and internal structure within the interfaces below.

## Public interface

Other code relies on these routes, shapes and names.

- **Routes.** `POST /api/bird-import-preview` and `POST /api/bird-import-commit`, anonymous at the Functions binding level; authorization is enforced in code. The owner page calls them from `/owner/birds`.
- **Preview request.** `{"csvBase64": STRING}`. **Preview response (200).** `version`, `format` (`ebird-personal-csv-candidate`), `source`, `candidates`, `rejected`, `summary` (`rows`, `candidates`, `rejected`, `ambiguous`), `coverage` (`unverified-export-format`), `publishes` (`false`) and `comparison`. `comparison` is `{"status": "not_configured"}` or `{"status": "available", "revision", "plan", "digest", "changes"}`. A candidate carries `row`, `provisionalKey`, `submissionId`, `commonName`, `scientificName`, `observedOn`, `count`, `countKind` (`exact`, `presence` or `unknown`), `privateFields`, `publication` (`draft`) and `identity` (`provisional` or `ambiguous`). A rejected row carries `row` and `reason`.
- **Commit request.** `{"csvBase64", "revision", "digest", "selectedRows"}`. **Commit response (200).** `{"revision", "imported", "publication": "draft"}`.
- **Errors.** `{"error": CODE}`. Codes and statuses: `owner_required` 403; `method_not_allowed` 405; `origin_forbidden` 403; `unsupported_media_type` 415; `invalid_request`, `invalid_export_size`, `invalid_export_encoding`, `invalid_export_csv`, `unsupported_export` and `invalid_bird_selection` 400; `bird_snapshot_conflict` 409; `preview_unavailable` and `import_unavailable` 503. Responses carry `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
- **Configuration.** `BLUE_SWALLOW_AUTH_MODE` (`entra` or `password` for owner access), `BLUE_SWALLOW_PUBLIC_ORIGIN`, `BSS_BIRD_HISTORY_ENABLED` (`true` to enable storage), `BSS_BIRD_HISTORY_ACCOUNT`, `BSS_BIRD_HISTORY_CONTAINER` and optional `BSS_BIRD_HISTORY_MANAGED_IDENTITY_CLIENT_ID`.
- **Snapshot.** One blob, `private/bird-history/snapshot-v1.json`, at most 16 MiB: `{"version": 1, "revision": INTEGER, "records": [...]}`. Each record has exactly `row`, `provisionalKey`, `submissionId`, `commonName`, `scientificName`, `observedOn`, `count`, `countKind`, `privateFields`, `publication` and `identity`.
- **Module exports.** `previewBirdExport(bytes)`, `planBirdReconciliation(snapshot, preview)`, `prepareDraftImport(bytes, snapshot)`, `applyDraftImport(store, bytes, request)`, `fingerprintDraft`, `changeDetails`, `createBirdSnapshotStore`, `config`, `validateSnapshot`, `planBirdPublication(snapshot, current, actions, {secret, now})`, and from the Functions `createHandler` and `readInput`.
- **Inbound dependency.** `planBirdPublication` and its tests rely on `projectPublicJournal(value)` exported by `api/bird-journal`, whose behavior is outside this specification.

## Prior-art decisions

`csv-parse` replaces a hand-written CSV parser because quoting, byte-order marks and size limits are easy to get wrong. Conditional writes by ETag and create-only for the first revision follow the standard optimistic-concurrency pattern for blob storage. HMAC with a stable secret keeps public IDs unlinkable to the draft key while remaining stable across publications. No code is copied.
