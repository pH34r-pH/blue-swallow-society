# Implementation Plan: Wardriver Release-Probe Verification

**Branch**: `fix/wardriver-release-probe` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

## Summary

Add a narrow Society Function route for release-CI provenance verification. The route accepts one dedicated header, compares it against a runtime-only secret with `crypto.timingSafeEqual`, then reads the already-selected `latest.json` through the existing validated release store. It returns complete manifest identity only; it has no blob-SAS, APK, or operator-session path.

## Technical context

- **Runtime:** Node 22 Azure Static Web Apps Functions, CommonJS.
- **Route:** `api/wardriver-release-probe/index.js` with `GET /api/wardriver-release/probe`.
- **Authentication:** `X-Blue-Swallow-Release-Probe` equals runtime `BSS_WARDRIVER_RELEASE_PROBE_SECRET`; both values are length-bounded before `crypto.timingSafeEqual`.
- **Payload:** a new `toReleaseProbeMetadata()` projection from the existing validated manifest. It includes exact release identity and immutable `blobName`, plus optional `acceptanceMode`; it excludes SAS/download paths and all credentials.
- **Configuration:** the canonical Society deployment workflow validates and writes the Society repository secret to the SWA app setting; the protected Wardriver environment holds the matching consumer secret. Neither is source or test data.
- **Consumer:** Wardriver promotion checks the route only after immutable object read-back and current-pointer publication.

## Implementation sequence

1. Add the feature authority artifacts and RED Node route contracts.
2. Extend manifest validation to retain a constrained optional `acceptanceMode` field, cap the manifest body at 128 KiB, and bind source tag, permitted current/legacy artifact name forms, and immutable blob path to version/commit identity. Keep omitted acceptance mode compatible with bss.25 and older immutable manifests.
3. Add `toReleaseProbeMetadata()` with exactly the fields needed for manifest equality and no delivery capability.
4. Add the Function route and binding. Check configured probe secret, then method, before creating the release store. This prevents unauthenticated traffic from revealing route behavior and prevents even authorized non-GET traffic from loading release-storage credentials.
5. Add a static deployment-workflow contract, then wire the Society repository secret through the canonical deployment workflow into the SWA app setting without printing it.
6. Run the focused Node contract RED/GREEN loop and current/operator regression suites.
7. Deploy the Society source through its canonical main push workflow after the Society repository secret exists. Set the matching protected Wardriver environment secret without emitting either value.
8. Verify live anonymous denial and a secret-authenticated bss.25 metadata response without requesting an APK. Then enable the bss.26 workflow gate.

## Source layout

```text
blue-swallow-society/
├── api/
│   ├── _lib/wardriver-release-store.js
│   └── wardriver-release-probe/
│       ├── function.json
│       └── index.js
├── tests/wardriver-release-probe-api.test.mjs
└── specs/019-wardriver-release-probe/
    ├── spec.md
    ├── plan.md
    ├── tests.md
    └── tasks.md
```

## Security decisions

| Decision | Rationale |
|---|---|
| Separate probe secret | A release verifier needs a stable machine identity; it must not inherit operator/API delivery authority. |
| Timing-safe, bounded exact comparison | Avoids value-dependent comparison timing and pathological input allocation. |
| Authenticate before store construction | Unauthorized traffic cannot distinguish storage configuration/state or trigger private manifest reads. |
| Complete metadata only after probe authentication | Hash/signer/blob provenance is needed for CI equality but remains outside public cover surfaces. |
| No download capability in code | The route cannot mint a SAS or trigger an APK transfer even with a valid probe secret. |
| Compatibility for omitted acceptance mode | Existing current bss.25 manifests remain readable before bss.26 becomes current. |

## Verification sequence

1. `node --test tests/wardriver-release-probe-api.test.mjs`
2. `node --test tests/wardriver-release-probe-api.test.mjs tests/wardriver-release-current-api.test.mjs tests/operator-downloads-api.test.mjs`
3. `node --test tests/*.test.mjs`
4. `git diff --check`; static source scan for secret/public-download regressions; `graphify update .`
5. Post-deploy: anonymous `403`, authenticated metadata identity without APK/SAS, then Wardriver tag promotion evidence.
