# Test Design: Operator Download Navigation Repair

| ID | Level | Requirement | Expected evidence |
|---|---|---|---|
| TST-001 | Node route | FR-002–FR-006 | A valid explicit BSS header plus the exact download-URL `Accept` media type returns a private/no-store JSON URL with no APK body and no redirect. |
| TST-002 | Node route | FR-003, FR-007 | Ordinary APK requests retain a 302; anonymous or platform-bearer-only requests disclose no SAS URL. |
| TST-003 | client source | FR-001, FR-002, FR-005, NFR-001–003 | The APK handler prevents anchor navigation, uses the explicit BSS header and exact `Accept`, validates the Blob URL, navigates with `location.replace`, and does not write the session token to a cookie/query/persistent store. |
| TST-004 | live | SC-001–002 | Active SWA reports `2.110-bss.18` / `327`, rejects anonymous artifact requests, and an authorized operator download returns the promoted immutable APK. |

## TDD sequence

1. Add TST-001 and TST-003. Run them against current source; each must fail because no download-URL representation or header-authenticated navigation exists.
2. Add TST-002 only if an existing redirect/auth test does not already cover it.
3. Implement the narrow handler and client changes.
4. Re-run the focused tests, then `node --test tests/*.test.mjs`, configuration checks, and live acceptance.
