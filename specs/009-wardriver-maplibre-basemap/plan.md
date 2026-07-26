# Plan: Wardriver MapLibre Basemap

## Implementation approach

1. Keep the dedicated Wardriver Blob account's ordinary anonymous access disabled. Keep the release, checksum-pinned toolchain, and verified input containers private; during protected manual publication, prove OIDC data-plane access, validate the pre-staged private toolchain and Washington source, then enable its `$web` static-website resource as the sole public read-only basemap path.
2. Produce a MapLibre v8 style from `basemap/style.template.json`. The checked-in template has no remote tile origin and declares source `maxzoom: 12`; publication generates no tiles above zoom 12 so clients overscale the bounded static source rather than issuing unbounded high-zoom tile requests. Publication renders a generation-specific BSS static-website tile base into the style.
3. On protected manual dispatch, prove the OIDC principal can read the existing private `wardriver-releases` container before it does any work; then download the pre-staged private `wardriver-basemap-toolchain/planetiler/v0.10.2` JAR and `wardriver-basemap-inputs/geofabrik/washington` PBF, verify their fixed SHA-256 values and source-provenance records, enable `$web`, render vector MBTiles on Java 21, extract gzip XYZ PBF objects, and publish provenance plus immutable tiles.
4. Compile signed Wardriver `bss.15+` with `WIGLE_BSS_FORCE_MAPLIBRE=true` and the BSS static-website style endpoint. Ignore old renderer/style preferences on all MapLibre surfaces.
5. Deploy the BSS infrastructure and publish the first source generation before creating a device candidate. Do not publish an APK or mutable release manifest before physical acceptance.

## Storage and cache contract

| Object | Access | Mutability | Cache |
|---|---|---|---|
| `wardriver-releases/*` | authenticated/SAS | immutable release objects | existing release policy |
| `wardriver-basemap-toolchain/planetiler/v0.10.2/{planetiler.jar,planetiler-provenance.json}` | OIDC only | immutable checksum-pinned toolchain inputs | no public delivery |
| `wardriver-basemap-inputs/geofabrik/washington/{washington.osm.pbf,washington-provenance.json}` | OIDC only | immutable checksum-pinned OSM source input | no public delivery |
| `$web/wardriver-basemap/v1/generations/<id>/tiles/*` | public named static-website object | immutable | `public, max-age=31536000, immutable` |
| `$web/wardriver-basemap/v1/generations/<id>/basemap-provenance.json` | public named static-website object | immutable | `public, max-age=31536000, immutable` |
| `$web/wardriver-basemap/v1/style.json` | public named static-website object | versioned current pointer | `no-store` |
| `$web/wardriver-basemap/v1/basemap-provenance.json` | public named static-website object | versioned current pointer | `no-store` |

No Function handles a tile request. This prevents application-level location logging and a hot tile proxy. Azure platform access behavior remains subject to the deployed platform account policy.

## Rollout sequence

1. Merge infrastructure/style/publisher source after review.
2. Deploy BSS infrastructure, stage the verified private Planetiler toolchain with its source provenance, and verify `style.json` is absent until a signed publication intentionally creates it.
3. Run one protected Washington basemap publication. Verify public style and sample tile headers, provenance, attribution, and no anonymous release-object access.
4. Merge the Android policy. Build a signed `bss.15+` candidate after the BSS style exists.
5. Perform physical Android acceptance. Only then create the immutable tag, SHA-256 receipt, and current-release promotion.
