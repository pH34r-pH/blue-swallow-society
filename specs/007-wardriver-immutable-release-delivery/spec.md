# Feature Specification: Wardriver Immutable Release Delivery

**Feature Branch**: `feat/immutable-wardriver-release`
**Created**: 2026-07-19
**Status**: Accepted
**Input**: Tyler authorized replacement of the stale, Functions-bundled Wardriver debug APK with a signed, versioned Azure release lane.

## User Scenarios & Testing

### US1 — Obtain the current approved field build (P1)

An authenticated operator must receive the current approved Wardriver release and enough provenance to verify it before installation.

**Acceptance scenarios**

1. **Given** a valid operator token and a promoted Blob manifest, **when** the operator requests metadata, **then** the response identifies the release version/code, source commit/tag, signer SHA-256, APK SHA-256, size, timestamp, and canonical API paths.
2. **Given** a valid operator token, **when** the operator requests the APK, **then** the BSS Function returns a private, no-store redirect to a five-minute HTTPS read-only URL for the exact manifest blob; it does not read or package APK bytes.
3. **Given** no token or an invalid token, **when** an artifact route is requested, **then** no manifest or Blob URL is exposed.

### US2 — Promote a reproducible signed release (P1)

A release maintainer must be able to promote a tag-produced, signed artifact without manually copying binaries into the BSS repository.

**Acceptance scenarios**

1. **Given** tag `wardriver-v2.109-bss.2`, **when** CI runs, **then** it rejects a tag/version mismatch or missing release-signing input before upload.
2. **Given** a valid signed APK, **when** CI promotes it, **then** it verifies APK signer/package/version, computes a checksum, creates an immutable artifact and manifest path, and only then updates the latest pointer.
3. **Given** an existing immutable artifact path, **when** CI retries promotion, **then** it fails rather than overwriting the bytes.

### US3 — Keep release state private but device-visible (P2)

A field device must be able to learn that a newer release exists without receiving an artifact URL or bypassing operator authentication.

**Acceptance scenarios**

1. **Given** a promoted manifest, **when** the app asks the metadata-only current-release endpoint, **then** it receives only version/name/timestamp/release notes suitable for availability comparison.
2. **Given** a newer version code, **when** Settings renders the field build identity, **then** it reports that an operator-console update is available and never downloads or installs anything.
3. **Given** the service is unavailable or its payload is malformed, **when** the app checks, **then** the installed-version presentation remains usable and no scanner behavior changes.

## Functional Requirements

- **FR-001**: Azure deployment MUST create a dedicated release storage account and private `wardriver-releases` container with public blob access disabled, TLS 1.2 minimum, blob versioning, and soft delete.
- **FR-002**: BSS runtime MUST obtain the selected release manifest from private Blob storage using a dedicated SWA app setting; it MUST not use `api/_private/downloads` or a checked-in APK fallback.
- **FR-003**: Authenticated metadata responses MUST expose complete, validated release provenance and no-store headers.
- **FR-004**: Authenticated APK requests MUST issue only a short-lived HTTPS, single-blob read SAS redirect with no public container policy.
- **FR-005**: Anonymous/invalid-token artifact requests MUST remain rejected.
- **FR-006**: The current-release endpoint MUST expose no blob path, SAS, source commit, signer fingerprint, checksum, or downloadable binary.
- **FR-007**: Operator shell release facts MUST load from authenticated metadata; no release version/hash/build type may be hard-coded in the HTML.
- **FR-008**: Wardriver release CI MUST build only signed `release` artifacts, verify package/version/signer/checksum, publish immutable blobs and manifests, and update the latest pointer only last.
- **FR-009**: Every Wardriver release MUST use a monotonically increasing Android version code. `2.109-bss.2` / `311` is the first secure-release candidate.
- **FR-010**: The Android app MUST perform a bounded metadata-only availability check and surface a newer version in Settings without background downloading or automatic installation.
- **FR-011**: The legacy debug APK and metadata MUST be removed from the BSS Function payload and Git history going forward (no new artifact commit; existing history remains immutable).

## Non-Functional Requirements

- **NFR-001**: SAS lifetime is at most five minutes; its protocol is HTTPS and permissions are read-only for one named blob.
- **NFR-002**: No release secret, connection string, keystore, or password appears in source, test fixtures, workflow output, artifact metadata, or logs.
- **NFR-003**: Private release delivery preserves the existing operator-token boundary and public-cover separation.
- **NFR-004**: The service produces an explicit 503 configuration/release-unavailable response instead of serving a stale artifact.

## Success Criteria

- **SC-001**: A promoted tag generates a signed versioned blob plus manifest and a matching latest pointer without a manual binary copy.
- **SC-002**: The operator metadata/API checksum equals the promoted APK checksum and is traceable to one source commit and signer.
- **SC-003**: Operator APK delivery never causes Functions to contain or buffer an APK body.
- **SC-004**: A device can distinguish installed code `310` from advertised code `311` and directs the operator to the authenticated update lane.
- **SC-005**: No public Blob listing/read and no anonymous artifact access succeeds.

## Assumptions and exclusions

- The release publisher workload identity receives `Storage Blob Data Contributor` only on the release storage account.
- The first secure certificate differs from the legacy debug signer. Its install requires a one-time uninstall/reinstall; future same-certificate releases upgrade normally.
- This feature excludes Play Store/MDM and silent updates.
