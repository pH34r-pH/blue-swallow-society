# Implementation Plan: Wardriver Immutable Release Delivery

**Branch**: `feat/immutable-wardriver-release` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

## Summary

Replace the Functions-bundled debug APK with a private Azure Blob release account. BSS Functions read a private `latest.json` manifest, protect operator metadata/download routes with the existing token gate, and issue a five-minute per-blob SAS redirect. Wardriver CI produces release-signed APKs, deterministic provenance manifests, immutable blob objects, and a final latest-pointer promotion. Android compares the metadata-only current-release view in Settings; it never downloads or installs an update.

## Technical context

- **BSS runtime:** Node 22 Azure Static Web Apps Functions, CommonJS, `@azure/storage-blob`.
- **Infrastructure:** Bicep under `infra/`; one dedicated Standard_LRS storage account and private blob container.
- **Release publisher:** GitHub Actions OIDC; `az storage blob upload --auth-mode login`; account-scoped Blob Data Contributor only.
- **Runtime credentials:** `BSS_WARDRIVER_RELEASE_STORAGE_CONNECTION_STRING` plus `BSS_WARDRIVER_RELEASE_CONTAINER` and `BSS_WARDRIVER_RELEASE_MANIFEST_BLOB` SWA app settings. The connection string is dedicated to this release-only account and never appears in source.
- **Download behavior:** Function validates operator token then returns 302 to a `r`, HTTPS-only SAS URL with a five-minute expiry. Navigating an anchor avoids a cross-origin fetch/CORS dependency.
- **Manifest paths:** immutable artifact/manifest under `wardriver/releases/<versionName>/<commit>/`; mutable pointer only at `wardriver/releases/latest.json`.

## Security decisions

| Decision | Rationale |
|---|---|
| Dedicated private release account | Limits runtime storage credentials to APK/manifest material only. |
| No Functions fallback | Prevents stale binary resurrection. Missing/malformed manifest is an explicit 503. |
| Blob redirect after operator authentication | Keeps BSS gate while avoiding Functions APK memory/bundle limits. |
| OIDC uploader, no storage key in CI | Upload authority is short-lived and role-scoped. |
| New release certificate | Default Android debug key is publicly reproducible and cannot sign a trusted release. |
| Metadata-only device route | App can report freshness without gaining an artifact URL or operator credential. |

## Source layout

```text
blue-swallow-society/
├── api/
│   ├── _lib/wardriver-release-store.js
│   ├── operator-downloads/index.js
│   ├── wardriver-release-current/{index.js,function.json}
│   └── package.json
├── infra/
│   ├── main.bicep
│   └── modules/wardriver-release-storage.bicep
├── .github/workflows/deploy-static-web-app.yml
├── tests/operator-downloads-api.test.mjs
├── tests/wardriver-release-current-api.test.mjs
└── specs/007-wardriver-immutable-release-delivery/

blue-swallow-wardriver/
├── .github/workflows/android.yml
├── wiglewifiwardriving/build.gradle
├── wiglewifiwardriving/src/main/java/.../bss/BssReleaseUpdateChecker.java
└── wiglewifiwardriving/src/test/java/.../bss/BssReleaseUpdateCheckerTest.java
```

## Verification plan

1. RED/GREEN Node tests for authorization, manifest validation, metadata redaction, and SAS redirect construction with injected local release-store doubles.
2. Static infrastructure/workflow tests inspect private-account, required settings, signing, immutable-upload, and promotion ordering contracts.
3. RED/GREEN JVM tests cover version-code comparison and malformed/unavailable current-release results without Android network/device dependencies.
4. Validate Bicep, run focused Node and Gradle suites, build signed release only when keystore inputs exist, then run Graphify updates in both repositories.
5. Deployment acceptance: create storage, configure SWA settings, release tag, compare Blob/API checksum/provenance, and complete controlled device migration.

## Rollout and rollback

- Deploy BSS infrastructure/runtime before publishing the first tag. Until a manifest is promoted, operator delivery returns an explicit unavailable response rather than stale debug bytes.
- Generate and store a new release keystore in repository secret storage; never use the legacy debug signer for release.
- Existing debug installs require one uninstall/reinstall for the first secure release. Subsequent releases install as updates.
- Roll back a bad release by promoting the last validated immutable manifest as `latest.json`; never overwrite an artifact object.
