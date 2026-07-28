# Feature Specification: Operator Download Navigation Repair

**Feature Branch**: `fix/wardriver-download-navigation-token`
**Created**: 2026-07-28
**Status**: Accepted corrective release
**Input**: Tyler reported that a successful operator login reaches the console but APK navigation returns `Invalid operator session token.`

## Incident

The deployed operator shell can authenticate `fetch` calls with `X-Blue-Swallow-Operator-Token`. The APK control was an anchor navigation that cannot attach that header. The current SWA deployment does not preserve the Function cookie grant used by the former navigation path. Its platform bearer is therefore the only credential observed by the Function and fails BSS signature verification.

## User Scenario & Acceptance

### US1 — Download an approved Wardriver APK after operator login (P1)

An authenticated operator selects the Wardriver APK control and receives the exact immutable release without making the APK public.

1. **Given** an unexpired BSS operator session in browser session storage, **when** the operator selects the APK control, **then** the browser makes a same-origin no-store request with the explicit BSS operator header and requests a download URL representation.
2. **Given** a verified request for that representation, **when** the release manifest is valid, **then** the Function returns a five-minute, HTTPS-only, read-only URL for the one immutable APK blob in a no-store JSON body; it does not return APK bytes.
3. **Given** that response, **when** the browser validates the URL shape, **then** it replaces the current navigation with that URL. The BSS session token is never placed in a URL, DOM attribute, persistent browser store, service-worker cache, or static asset.
4. **Given** an anchor navigation without a valid BSS credential, **when** it reaches the Function through SWA, **then** it remains fail-closed and exposes no manifest or Blob URL.

## Functional Requirements

- **FR-001**: The APK control MUST not rely on a Function-set browser cookie for authorization.
- **FR-002**: The client MUST request the download-URL representation with `X-Blue-Swallow-Operator-Token` and a dedicated `Accept` media type.
- **FR-003**: Only the APK artifact and only that dedicated representation MAY return a JSON download URL; ordinary APK requests retain the existing redirect contract.
- **FR-004**: The Function MUST verify the existing operator token before it creates a SAS URL.
- **FR-005**: The client MUST reject a non-HTTPS, non-Azure-Blob, non-read-only, or non-HTTPS-protocol URL before navigation.
- **FR-006**: The implementation MUST preserve private/no-store headers and Functions MUST not proxy or buffer APK bytes.
- **FR-007**: Anonymous, injected-platform-bearer-only, expired, and malformed requests MUST not disclose an artifact URL.

## Non-functional Requirements

- **NFR-001**: The only URL query credential is the existing short-lived Blob SAS issued after BSS authorization; the BSS operator token never enters a query string.
- **NFR-002**: No cookie, localStorage, IndexedDB, or service-worker cache is added for the operator token.
- **NFR-003**: Existing metadata fetch behavior remains header-authenticated and no-store.

## Success Criteria

- **SC-001**: A live authenticated operator can download `2.110-bss.18` without `Invalid operator session token.`
- **SC-002**: The live public current-release metadata remains `2.110-bss.18` / code `327`, while anonymous operator artifact requests fail closed.
- **SC-003**: Unit and browser-source contracts prove the explicit-header handoff and reject token query/cookie persistence.