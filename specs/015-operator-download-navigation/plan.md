# Implementation Plan: Operator Download Navigation Repair

**Branch**: `fix/wardriver-download-navigation-token` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

## Root cause

`35ead6c` intentionally removed Function cookie grants because SWA suppresses their `Set-Cookie` delivery. It preserved header-authenticated fetches for the operator shell and private assets, but left `handleOperatorDownload` as a direct anchor navigation. Browser navigation cannot add `X-Blue-Swallow-Operator-Token`; SWA injects an unrelated `Authorization` bearer, which BSS correctly rejects as `Invalid operator session token.`

## Approach

1. Add a dedicated, exact `Accept` representation to `api/operator-downloads/index.js` for a verified APK request. It returns a no-store JSON body containing the existing five-minute, HTTPS/read-only Blob SAS URL instead of a redirect.
2. Keep the ordinary APK request response as the existing `302` redirect; do not alter metadata response shape, manifest validation, SAS construction, or Blob permissions.
3. Replace the operator APK anchor handoff in `api/_private/operator/assets/main.js` with a header-authenticated no-store fetch. Validate the returned Blob URL with the same HTTPS/Blob/read-only conditions, then use `window.location.replace()` immediately. Do not store the URL or session token.
4. Add RED/GREEN API and client-source contracts, then run the full Node suite, Graphify update, source-security scan, deployment CI, anonymous live gate, and an authorized live download.

## Files

- `api/operator-downloads/index.js`
- `api/_private/operator/assets/main.js`
- `tests/operator-downloads-api.test.mjs`
- `tests/operator-shell-download.test.mjs`

## Security boundary

The operator token remains session-scoped and travels only in the same-origin request header. The release URL remains a bounded Blob SAS that is already the browser redirect target. The Function never reads APK bytes. No Function cookie is reintroduced.