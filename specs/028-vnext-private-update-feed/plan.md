# Implementation Plan: Private vNext update feed

## Source layout

- `api/wardriver-development/` owns the GET/HEAD Function binding and handler.
- `api/_lib/wardriver-development-auth.js` validates only the dedicated bearer
  against a configured SHA-256 digest using a constant-time comparison.
- `api/_lib/wardriver-development-store.js` validates the shared publication
  receipt, reads bounded manifests, and generates single-blob SAS grants with the
  existing Azure Storage SDK.
- `tests/wardriver-development-api.test.mjs` and
  `tests/wardriver-development-store.test.mjs` exercise behavior with synthetic
  runtime credentials and injected storage clients.
- The existing Functions image smoke test resolves both the index and nested
  download binding in the real HTTP host, confirming the unconfigured channel
  fails closed before publication.

## Configuration

The runtime requires `BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_SHA256`,
`BSS_WARDRIVER_DEVELOPMENT_SIGNER_SHA256`,
`BSS_WARDRIVER_DEVELOPMENT_STORAGE_CONNECTION_STRING`, and
`BSS_WARDRIVER_DEVELOPMENT_CONTAINER`. No production-setting fallback is allowed.
The connection must point to an existing private release account authorized for
SAS generation. The separate CI archive account, which disables Shared Key, is
not interchangeable with this runtime configuration.

The read token authorizes only this development route. Provision its hash through
the protected runtime configuration and provide the clear credential to the
owner through an authenticated channel. Do not commit or print either a real
credential or its digest. Credential rotation is operational, not an API feature.
For several devices, `BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_HASHES` accepts a JSON
object mapping non-sensitive reader labels to digests. Verification checks all
configured digests without an early match return. Up to 16 total readers are
accepted; removing one entry revokes only that reader. Upload identities and map
sharing remain separate contracts.

## Publication contract

`latest.json` and each immutable `release.json` contain the same manifest bytes.
The private publisher validates and uploads immutable artifacts first, then
conditionally updates the latest pointer. The API checks schema/kind/channel,
package/build identity, version code in `1..2100000000`, a safe bounded version
name, a full lowercase source SHA, run/attempt identity, UTC publication time,
and the configured APK signer. APK names are
`wardriver-vnext-<versionCode>.apk`; listed extension FAPs share the release
prefix. Additional publication evidence can be ignored by the reader.

Versioned download routes use an immutable manifest rather than the current
pointer, preventing a check/download race. A fixed route prefix and strict
identifier grammar prevent request-driven arbitrary Blob reads. Manifest bodies
are limited to 128 KiB and reads have a ten-second abort deadline; only validated
JSON is returned as a receipt.

## Client integration

Configure Obtainium's HTML source with the stable index URL, the private bearer
header, a version-code extraction expression, and version-code comparison. The
index contains one APK candidate, avoiding a user selection during background
updates. A first approved install/update through Obtainium and Android's unknown
source permission are still required. The FAP is also bundled in the APK and is
installed onto the Flipper through Wardriver's Bluetooth flow.

## Deployment boundary

Current Society main requires Node 24. Its `functions-release.yml` workflow builds
and publishes a versioned OCI Functions image. Wardriver's retained managed-SWA
promoter intentionally supports only Node 22 and cannot deploy current main.
This change does not bypass that gate or create hosting. Deployment must use a
qualified current runtime path, with its source/image identity, protected
configuration, and authenticated/anonymous probes recorded separately.
