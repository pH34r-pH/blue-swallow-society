# Feature Specification: Private vNext update feed

**Created**: 2026-11-03
**Status**: Implementing
**Input**: The owner requested pipeline-built private Wardriver updates and a
downloadable matching Flipper extension, with automatic Android update discovery.

## Scope and authority

This development channel serves only `co.blueswallow.wardriver.vnext`. It is
separate from the approved production release contract in specification 007.
Production package, release-tag, operator-session, and storage-path checks remain
unchanged. The existing Society Functions host supplies the HTTP boundary; this
feature does not provision hosting or assert that current source is deployed.

## User scenarios

### US1 — Subscribe to private development updates

Given a configured private reader credential and a published development release,
an authorized client receives an HTML page with exactly one versioned APK link.
The page also offers matching FAP and provenance links. Obtainium can extract the
Android version code from the stable APK path and check for future updates.

### US2 — Download one immutable release

Given a valid reader credential, a request containing a version code, source SHA,
and approved file name resolves that release's immutable `release.json`. It then
returns a new HTTPS read-only SAS for that exact APK or FAP. A concurrent latest
pointer change cannot silently change the requested version. Receipt requests
return validated JSON without a SAS. HEAD responses contain no response body.

### US3 — Reject unauthorized or inconsistent state

Missing, incorrect, or malformed bearer credentials cannot read private storage
or obtain release metadata. Missing configuration, signer mismatch, malformed
manifests, unknown artifacts, and storage failures produce bounded errors without
credentials, storage connection strings, or stale artifact fallback.

## Requirements

- **FR-001**: GET and HEAD at `/api/wardriver-development/index.html` require the
  dedicated read-only bearer credential on every request. Browser owner sessions,
  cookies, query-string credentials, and platform principal headers do not grant
  access to this channel.
- **FR-002**: The server stores only the credential's SHA-256 digest in
  `BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_SHA256`. A newly provisioned credential
  must contain at least 32 random bytes. Removing or replacing the digest revokes
  the previous credential without affecting owner authentication. Optional
  `BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_HASHES` maps reader labels to independent
  digests, with at most 16 readers including the owner bootstrap. This supports
  individual update-read revocation; it grants no upload or shared-map access.
- **FR-003**: The channel has explicit development storage configuration and a
  pinned `BSS_WARDRIVER_DEVELOPMENT_SIGNER_SHA256`; it never falls back to
  production settings or arbitrary request-supplied storage paths.
- **FR-004**: The current manifest is
  `wardriver/development/vnext/latest.json`. Immutable release files are under
  `wardriver/development/vnext/releases/<versionCode>/<sourceCommit>/`.
- **FR-005**: A manifest must identify schema 1,
  `wardriver-vnext-development-release`, `private-vnext`, the vNext package, and
  development build type. APK and extension names, hashes, sizes, source identity,
  publication time, signer, and Blob paths must validate before use.
- **FR-006**: Versioned requests resolve their immutable manifest, verify its
  identity matches the request, and allow only its APK, listed FAPs, or
  `release.json`. Arbitrary paths and files cannot obtain a SAS.
- **FR-007**: New grants expire five minutes after issuance, authorize only read
  access to one blob, and require HTTPS. Functions never buffer APK or FAP bytes.
- **FR-008**: All responses use private/no-store caching. The HTML uses fixed
  same-origin paths, escapes display text, and exposes no credential or SAS.
- **FR-009**: The existing production route and validators remain unchanged.
- **FR-010**: Publication comes from the private Wardriver pipeline. Android APK
  signing continuity and client-side installer consent remain necessary; the
  feed does not manufacture a signing key or guarantee unattended installation.

## Acceptance evidence

Focused Node tests must exercise authorization before any storage operation,
bounded manifest reads, exact signer/path validation, pointer races, authenticated
APK/FAP grants, expiry, receipt/HEAD behavior, and unchanged production checks.
Live deployment, real credentials, published artifacts, and physical Android or
Bluetooth installation require separate evidence and must not be inferred from
these tests.

- **FR-011**: Authenticated GET/HEAD at `/api/wardriver-development/current.json` returns the validated current release receipt as private, no-store JSON, with no SAS or reader credential. HEAD has no body. Existing HTML and immutable versioned routes are unchanged.
