# Test Design: Wardriver Release-Probe Verification

## Test matrix

| Test | Level | Covers | Procedure | Expected result | Path |
|---|---|---|---|---|---|
| TST-019-01 | Node unit | FR-001–003, NFR-001–003 | Invoke the full handler with missing, wrong, and configured-but-empty headers while release storage configuration is absent. | `403` for invalid callers, `503` for absent setting, no store construction/read. | `tests/wardriver-release-probe-api.test.mjs` |
| TST-019-02 | Node unit | FR-004–006/009, NFR-001/003 | Invoke the authorized handler with a validated bss.26-shaped release-store double; project legacy manifests that omit acceptance mode or use the historic version-only artifact name; mutate tag/file/blob identity; and stream an oversized manifest body. | Exact private/no-store allowed-key projection, including blob name and accepted mode; legacy projection exposes `acceptanceMode: null` and retains the version-only artifact name; inconsistent identity and bodies over 128 KiB fail closed; no SAS/download/session fields. | `tests/wardriver-release-probe-api.test.mjs` |
| TST-019-03 | Node unit/static | FR-002/003/005 | Invoke the full handler with a valid header and a non-GET method against an injected release-store factory; inspect route source. | `405` occurs before the factory is called; timing-safe comparator and bounded header present; no `createDownloadUrl`, `generateBlobSAS`, or APK branch. | `tests/wardriver-release-probe-api.test.mjs` |
| TST-019-04 | Node regression | FR-006, SC-004 | Run the current-release and operator-download suites with the new manifest projection. | Existing public redaction/operator token behavior unchanged. | existing tests |
| TST-019-05 | static workflow | FR-008, NFR-002 | Inspect the canonical Society deployment workflow. | It validates the Society repository secret, writes only the named SWA setting, and never echoes the value. | `tests/wardriver-release-delivery-config.test.mjs` |
| TST-019-06 | live deployment | SC-002–003 | Configure paired protected values, call live probe anonymously and with the designated header, then run bss.26 promotion. | Anonymous `403`; authenticated response equals the promoted manifest; no APK request. | deployment/release receipt |

## Traceability

| Requirement | Tests |
|---|---|
| FR-001–003 | TST-019-01, TST-019-03 |
| FR-004–006 | TST-019-02, TST-019-04 |
| FR-009 | TST-019-02 |
| FR-007 | TST-019-06 |
| FR-008 | TST-019-05 |
| NFR-001–003 | TST-019-01–005 |
| NFR-004 | TST-019-03, TST-019-06 |
| SC-001–004 | TST-019-01–006 |

## TDD sequence

1. Add TST-019-01–003 and observe the missing route/projection fail.
2. Implement the smallest secret gate, projection, manifest compatibility, and Function binding that turns the focused suite green.
3. Add TST-019-05 before modifying deployment secret wiring; observe RED.
4. Implement the smallest secret gate, projection, manifest compatibility, Function binding, and deployment setting that turn the focused suites green.
5. Run TST-019-04 before any deployment/configuration write.
6. Treat TST-019-06 as a separate release receipt; never replace it with a unit-test claim.
