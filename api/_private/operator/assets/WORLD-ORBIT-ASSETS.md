# Pinned orbital renderer and propagation software

Cesium npm 1.145.0 official archive SHA-256: `7e348d18dcc14608bd8b110765f2c00dfd4602c7194647fa49cd4c4a757d4ae1`. Apache-2.0 license and third-party notices are retained in cesium/LICENSE.md, ThirdParty.json and ThirdParty.extra.json. Minified Build/Cesium/index.js is copied with its upstream public ion evaluation credential replaced by an empty string; this is the sole code patch. Workers, approximateTerrainHeights and IAU2006_XYS numerical assets are unchanged. No Cesium imagery/terrain tiles or ion resource is included. Per-file size and SHA-256 are in cesium/manifest.json and checked by tests. The manifest is the private HTTP allowlist.

satellite.js npm 7.1.0 official archive SHA-256: `b812da8af116ea123f9d3763ce2fbcf7a0559c6dd1af25b0ac9da567ccf2a1b5`. MIT license retained in SATELLITE-LICENSE.md. The pure JavaScript SGP4 bundle satellite-sgp4.mjs SHA-256 is `0e450af6cc8d627b85cc966224ff699c5b8c8f461a91e86bd132c49f9d4c9964`. No WASM/threaded backend or runtime package installation is needed.

Rebuild with esbuild 0.28.2, --bundle --format=esm --minify, exporting only json2satrec from dist/io.js, propagate from dist/propagation/propagate.js, gstime from dist/propagation/gstime.js and eciToGeodetic from dist/transforms.js. Resolve these against the extracted pinned satellite.js package. Hash the result before replacement; do not fetch GP elements as part of a build.

Official sources: https://github.com/CesiumGS/cesium/tree/1.145 and https://github.com/shashwatak/satellite-js. Existing public-domain basemap provenance remains in WORLD-BASEMAP.md. Vendor software is excluded from structural complexity/clone auditing, as existing MapLibre is; all application wrappers remain audited.
