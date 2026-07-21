# Test Design: Wardriver Immutable Release Delivery

## Test matrix

| Test | Level | Covers | Procedure | Expected result | Planned path |
|---|---|---|---|---|---|
| TST-001 | Node unit | FR-002–FR-005, NFR-001/004 | Invoke protected routes with injected store and anonymous, conventional bearer, explicit BSS header, signed cookie, and invalid proxy-injected bearer combinations. | Anonymous requests reject; a valid operator credential survives a stale or SWA-injected competing credential; valid metadata is private/no-store; APK is a bounded HTTPS read redirect, not bytes. | `tests/operator-downloads-api.test.mjs` |
| TST-002 | Node unit | FR-002–FR-004 | Feed malformed manifest/config and invalid blob path cases to the release store. | Explicit unavailable/config error; no legacy file read or arbitrary SAS. | `tests/operator-downloads-api.test.mjs` |
| TST-003 | Node unit | FR-006, FR-010 | Invoke metadata-only route with a release-store double. | Only version/name/published notes; no blob/source/checksum/signer/download path. | `tests/wardriver-release-current-api.test.mjs` |
| TST-004 | static/API shell | FR-007, NFR-003 | Inspect operator shell/script. | No hard-coded release version/hash/debug build or static APK filename; authenticated metadata drives facts. | `tests/operator-shell-download.test.mjs` |
| TST-005 | static IaC | FR-001, NFR-002 | Inspect/compile Bicep and workflow configuration. | Dedicated private TLS storage account/container, versioning/soft delete, runtime setting wire-up without outputting the secret. | `tests/wardriver-release-delivery-config.test.mjs` |
| TST-006 | workflow static | FR-008–FR-009, NFR-002 | Inspect Wardriver release workflow/Gradle contract. | Tag/version check, release signing requirement, immutable upload before pointer, signer/checksum manifest fields. | `tests/wardriver-release-workflow.test.mjs` in Wardriver |
| TST-007 | JVM unit | FR-010, SC-004 | Compare installed/advised version codes and malformed payloads. | Only strictly greater advertised code reports update; failures leave installed display unchanged. | `BssReleaseUpdateCheckerTest.java` |
| TST-008 | integration/manual | SC-001–SC-005 | Deploy storage/runtime, run an approved tag and retrieve metadata/download on a field device. | Blob/API bytes/checksum/signer/provenance agree; no anonymous/container read; secure migration installs. | release receipt + Azure/GitHub evidence |

## Traceability

| Requirement | Tests |
|---|---|
| FR-001 | TST-005, TST-008 |
| FR-002–FR-005 | TST-001, TST-002, TST-008 |
| FR-006 | TST-003 |
| FR-007 | TST-004 |
| FR-008–FR-009 | TST-005, TST-006, TST-008 |
| FR-010 | TST-003, TST-007 |
| FR-011 | TST-001, TST-004, TST-008 |
| NFR-001–NFR-004 | TST-001–TST-006 |
| SC-001–SC-005 | TST-007, TST-008 |

## TDD sequence

1. Add BSS `TST-001`–`TST-005` before replacing the current file-backed handler; observe RED against the legacy Function payload.
2. Add Wardriver `TST-006`–`TST-007` before Gradle/workflow/update-checker implementation; observe release configuration/version comparison RED.
3. Implement the smallest store/route, signing/promotion, and comparator/UI changes to GREEN.
4. Run owning suites, Bicep validation, `git diff --check`, and Graphify refresh.
5. Retain GitHub run ID, immutable blob URI/version IDs, manifest checksum, and device-install evidence for `TST-008`.
