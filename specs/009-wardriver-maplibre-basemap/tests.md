# Tests: Wardriver MapLibre Basemap

| Requirement | Test / evidence | Status |
|---|---|---|
| R1 | `tests/wardriver-basemap-delivery-config.test.mjs`; `az bicep build infra/main.bicep` | implemented locally |
| R2 | Style-template static contract; render-script canary with BSS Blob URL | implemented locally |
| R3 | Publication workflow static contract checks versioned generation path, cache headers, provenance output | implemented locally |
| R4 | Workflow static contract checks manual dispatch, OIDC data-plane preflight before source download, checksum verification, Java 21 | implemented locally |
| R5 | Wardriver `MapLibreReleaseContractTest` and `ReleasePromotionContractTest` | implemented locally; candidate build pending |
| R6 | Physical device receipt for render/markers/location/outage/lifecycle/update | pending |

## Local canary

Planetiler `v0.10.2` was checksum-verified and run against its Monaco download fixture with Java 21. The extractor emitted 246 gzip PBF tiles across zoom 0–14 and confirmed `water` and `transportation` source layers. The rendered style referenced only the supplied BSS Blob URL.
