# Feature Specification: Wardriver Release-Probe Verification

**Feature Branch**: `fix/wardriver-release-probe`
**Created**: 2026-08-01
**Status**: Proposed
**Input**: bss.26 direct-current promotion needs evidence from a live, authenticated Society route without placing an operator token, passcode, SAS, or APK-download authority in CI.

## User Scenarios & Testing

### US1 — Verify the promoted release through a bounded service identity (P1)

A Wardriver release publisher must verify the live Society-selected manifest after it updates `latest.json`, using a credential that can read release provenance only.

**Acceptance scenarios**

1. **Given** no `X-Blue-Swallow-Release-Probe` header or a non-matching header, **when** a caller requests `GET /api/wardriver-release/probe`, **then** the Function returns `403`, constructs no release store, reads no manifest, and exposes no Blob path, SAS, APK, or release metadata.
2. **Given** the release-probe setting is absent or invalid, **when** any caller requests the route, **then** the Function returns an explicit `503` unavailable response without constructing the release store.
3. **Given** the protected release-probe secret exactly matches the request header, **when** the current manifest is valid, **then** the Function returns `200`, private/no-store headers, and the complete validated release identity: schema, name, package/version/build identity, byte size, APK/signing hashes, source commit/tag, build-run ID, timestamp, notes, immutable blob name, and acceptance mode.
4. **Given** a valid release-probe request, **when** the route responds, **then** it returns no SAS, download URL, operator-token material, APK bytes, or private storage credential.
5. **Given** a non-GET request with a valid probe header, **when** the route is invoked, **then** it returns `405` before it constructs or reads the release store.

### US2 — Preserve the public and operator boundaries (P1)

The new probe must add no install path and must not weaken public current-release or operator delivery behavior.

**Acceptance scenarios**

1. **Given** a public availability check, **when** `/api/wardriver-release/current` is called, **then** it retains its redacted device-safe payload.
2. **Given** anonymous access to `/api/operator-downloads/wardriver/metadata` or `/apk`, **when** it is requested, **then** the existing operator-token boundary continues to reject it.
3. **Given** a release-probe secret, **when** it is leaked or revoked, **then** it cannot request an APK because the probe route has no download branch and is not accepted by the operator-download route.

## Functional Requirements

- **FR-001:** The Society shall expose `GET /api/wardriver-release/probe` as a dedicated, secret-authenticated release-provenance endpoint.
- **FR-002:** The route shall require the exact `X-Blue-Swallow-Release-Probe` value to match `BSS_WARDRIVER_RELEASE_PROBE_SECRET` with a length-bounded timing-safe comparison.
- **FR-003:** The route shall reject an absent/invalid request header with `403` before release-store construction; an absent/invalid configured secret shall return `503` before release-store construction; and a valid-secret non-GET request shall return `405` before release-store construction.
- **FR-004:** A successful route response shall derive its payload only from a validated current manifest and shall include the full release identity required by bss.26 promotion verification, including `blobName` and optional `acceptanceMode`.
- **FR-005:** The route shall expose no SAS, signed URL, APK bytes, operator session, passcode, storage credential, or generic operator-download behavior.
- **FR-006:** `validateManifest` shall retain a valid `acceptanceMode` when present and preserve compatibility with previously promoted manifests that omit it.
- **FR-007:** The Wardriver promotion workflow shall use this probe secret only for a post-pointer metadata equality check; it shall not use the secret to request an APK or call an operator route as an authenticated user.
- **FR-008:** The canonical Society deployment workflow shall validate and set `BSS_WARDRIVER_RELEASE_PROBE_SECRET` as an SWA app setting without logging its value; the matching Wardriver protected environment secret remains the only CI consumer.

## Non-functional Requirements

- **NFR-001:** Responses use `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- **NFR-002:** The probe secret is never committed, logged, included in test fixtures, retained in artifacts, or returned by the API. The canonical Society deployment workflow carries it only from a Society repository secret into the SWA app setting; Wardriver receives the matching value only as a protected `wardriver-release` GitHub environment secret.
- **NFR-003:** The probe secret authorizes read-only manifest metadata only. It is not an operator token, passcode, SAS, storage credential, or APK-download credential.
- **NFR-004:** No public/cover UI link, JavaScript bundle, or Android client shall reference the probe endpoint.

## Success Criteria

- **SC-001:** Automated Node contracts prove failure paths occur before release-store construction and prove secret-authenticated output contains exact complete manifest identity with no download capability.
- **SC-002:** The deployed route rejects anonymous requests and returns the current manifest identity only for the designated protected probe header.
- **SC-003:** bss.26 promotion compares the deployed probe identity with its generated manifest after publishing the current pointer.
- **SC-004:** Existing public current-release redaction and operator-download contracts remain green.

## Authority and exclusions

- This feature is service-to-service release evidence. It does not replace the authenticated operator update workflow or the required post-publication physical acceptance.
- This feature does not add a public artifact path, background APK installation, an Azure storage key to CI, or a passcode/operator-session secret to GitHub Actions.
- The accepted release-probe secret has a single correction path: rotate the Society app setting and GitHub protected environment secret together, then verify anonymous denial and authenticated metadata equality before a release tag is promoted.
