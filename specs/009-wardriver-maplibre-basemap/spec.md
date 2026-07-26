# Specification: Wardriver MapLibre Basemap

**Branch**: `feat/wardriver-maplibre-basemap`
**Date**: 2026-07-26
**Status**: implementation; publication blocked on deployment and device acceptance

## Authority and scope

This specification owns observable basemap behavior for Wardriver `bss.15+`.

- `bss.14` is immutable. This work does not alter its renderer, APK, tag, or release manifest.
- A signed `bss.15+` release uses MapLibre. A persisted Google/FOSS preference must not select a different renderer or style.
- The basemap is served from Blue Swallow Azure Blob Storage. The Android client contains no Maps credential and no tile-provider credential.
- The initial approved source package is the Geofabrik Washington OpenStreetMap extract. Its published provenance identifies the exact source hash, Planetiler hash, source commit, tile generation, and style hash.

## Requirements

### R1 — Public named basemap objects; private APK objects

The existing Wardriver storage account shall expose one `wardriver-basemap` container with Blob-level public read access. It shall not permit anonymous container listing. The existing `wardriver-releases` container shall remain `publicAccess: 'None'`.

### R2 — Client style endpoint

The BSS deployment shall output a style endpoint of this form:

```text
https://<storage-account>.blob.core.windows.net/wardriver-basemap/v1/style.json
```

The style shall reference only versioned BSS Blob tile URLs. It shall contain OpenStreetMap attribution, no client credential, and no third-party runtime tile origin.

### R3 — Immutable tiles, mutable style pointer

A tile generation shall use a source/renderer/commit-derived prefix. Tiles and generation provenance are immutable and cacheable for one year. `v1/style.json` and `v1/basemap-provenance.json` are versioned Blob pointers with `Cache-Control: no-store`.

### R4 — Source and publication controls

Publication shall run only by manual GitHub Actions dispatch in the protected `wardriver-basemap-publication` environment. The job shall use OIDC with a scoped `Storage Blob Data Contributor` role and must prove that data-plane access before it downloads or renders a tile generation. It shall verify the Geofabrik sidecar SHA-256 and Planetiler release SHA-256 before generation. It shall not accept an arbitrary input URL.

### R5 — Android renderer policy

The signed `bss.15+` build contract shall set `WIGLE_BSS_FORCE_MAPLIBRE=true` and an HTTPS BSS style URL. The build shall fail when the force flag has no valid HTTPS style URL. The renderer policy shall override migrated preferences in every map/search/detail entry point.

### R6 — Failure and boundary behavior

When the BSS style or tile service is unavailable, the app shall retain existing MapLibre failure handling and show no Google basemap fallback. A release cannot be promoted until a physical Android device proves: style render, DeFlock markers and inspection, location-unavailable state, outage/recovery behavior, lifecycle return, and signed-update installation.

## Acceptance evidence

1. Bicep validation proves the public Blob-only basemap container and private release container.
2. The manual workflow verifies source/toolchain checksums, emits provenance, uploads named objects through OIDC, and reads a public style plus sample tile without listing.
3. The Android release contract proves `bss.15+` MapLibre selection without a Maps secret.
4. A physical device receipt is required before tag/promotion.
