# Tests

Validate finite strict filters, interval/page bounds, cursor tampering/filter mismatch, microsecond ties, paging and personal-source exclusion. Test SQL parameters/read-only timeout/rollback, null/zero projection and absence of raw identifiers. Test direct endpoint denial and exact stable selection.

Deterministic controller and Chromium flows cover empty/error/stale, racing loads, page/selection, reload/Back, keyboard, mobile overflow and map/list fallback using synthetic fixtures only. Run focused, root, VM, Chromium and exact-head CI before merge. Do not claim live data, applied migration or measured production latency.
