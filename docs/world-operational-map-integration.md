# World #91 integration handoff

Base: Society `1bb156b599ed353a1f1f151930b6846baae9689e`. This change owns isolated World modules, assets, route wrappers and tests only. Parent/entity owner applies shared edits after reconciling their current branch. No deployment, new identities/scopes/keys or DB writes are part of this handoff.

## Interfaces

- Browser `GET /api/world/context`, no query/body, cookie-backed owner session through `requireOwnerRead` or validated API bearer. Both must yield a validated `Owner.Read` principal and API access token. Legacy/proof-only access fails closed.
- Function calls existing common API transport `POST /api/v1/world/context` with body `{}` and delegated bearer only. VM route validates Owner.Read directly before reading public snapshots; it never accesses an observation/entity store.
- `createWorldService({ fetchImpl, now })` exposes `read()` and explicit `refresh(sourceId)`. Read never calls providers. `createWorldAcquisition(service).start()/stop()` owns bounded five-minute acquisition of USGS and NWS only.
- Process-local cache is intentionally non-durable and lost on restart. Run a single acquisition instance per outbound IP; replicas need a coordinated cache before activation. Provider URLs are fixed; no browser/private coordinate or RF data is transmitted. No fixture fallback.
- `createWorldView({ root, getHeaders })` exposes `activate()/deactivate()/destroy()`. It lazy-loads the existing MapLibre 6 globe only on explicit Show globe. Public ground context has no actual-altitude satellite implementation.

## Exact small shared integration edits (apply by parent)

1. `api/operator-assets/index.js`: add these entries to `ASSET_MANIFEST` under the existing owner asset guard:

```js
'world-view.mjs': { file: 'world-view.mjs', contentType: 'application/javascript; charset=utf-8' },
'world-state.mjs': { file: 'world-state.mjs', contentType: 'application/javascript; charset=utf-8' },
'world-map.mjs': { file: 'world-map.mjs', contentType: 'application/javascript; charset=utf-8' },
'world.css': { file: 'world.css', contentType: 'text/css; charset=utf-8' },
'world-land.geojson': { file: 'world-land.geojson', contentType: 'application/geo+json; charset=utf-8' },
```

2. `api/_private/operator/shell.html`: inside `#world-tab`, add `<section data-world-view aria-label="World operational public context"></section>`. The existing DeFlock aggregate ledger can remain below it as separately labelled aggregate context. Do not move personal map/observations into this mount.

3. `api/_private/operator/assets/main.js`:

```js
import { createWorldView } from './world-view.mjs';
let worldView;
// in initTabDefaults, alongside travelsView construction:
const worldRoot = document.querySelector('[data-world-view]');
if (worldRoot && !worldView) worldView = createWorldView({ root: worldRoot, getHeaders: () => buildOperatorHeaders() });
// in setActiveTab, before changing active tab:
if (state.activeTab === 'world' && nextTabKey !== 'world') worldView?.deactivate();
// after setTabAria and activeTab assignment:
if (nextTabKey === 'world') worldView?.activate();
// add worldView?.destroy() to pagehide/logout/session-teardown alongside travelsView.
```

4. `vm/cybermap-api/src/server.mjs`: add an optional `worldRoute = null` dependency to both `createCybermapApiServer` and `createRequestHandler`; forward it when constructing the request handler. Within its existing try/catch, before other route dispatch, call:

```js
if (worldRoute && await worldRoute(request, response, new URL(request.url, 'http://localhost'))) return;
```

The hook maps common API validation failures to the existing IngestError type for the server catch. No legacy fallback. The route is standalone and performs its own direct Owner.Read validation.

5. `vm/cybermap-api/src/main.mjs` (host lifecycle owner applies; do not start during tests/deploy):

```js
import { createWorldService } from './world-service.mjs';
import { createWorldRoute } from './world-route.mjs';
import { createWorldAcquisition } from './world-acquisition.mjs';
const worldService = createWorldService();
const worldAcquisition = createWorldAcquisition(worldService);
// pass worldRoute: createWorldRoute({ service: worldService }) to createCybermapApiServer
// inside existing listening callback, only when explicitly configured for the single host:
if (process.env.BSS_WORLD_PUBLIC_FEEDS_ENABLED === 'true') worldAcquisition.start();
// in shutdown before server.close:
worldAcquisition.stop();
```

Default unconfigured acquisition shows truthful `unavailable` sources; this PR does not activate production collection. It does not register timers/services, write databases, or deploy.

## Acceptance boundaries

Implemented: existing USGS normalizer reuse, bounded NWS alert adapter, source/event/update/fetch times, explicit freshness/failure/expiry, predicted alerts and historical expired alerts, opt-in ground layers, PNW/WA/US/global preset filters, accessible 50-row pages/details, lazy local globe, list fallback, isolated common-API route wrappers and synthetic tests.

Pending: shared shell/asset/server mounting by parent; acquisition host activation and durable/multi-instance storage; EONET/GDACS provider qualification (existing normalizers reused in World normalization export); existing DeFlock aggregate transport remains separate; satellite epoch/SGP4/actual-altitude support plus durable 2-hour/non-200 stop policy; ADSB.lol production/license steps, AISStream license/backend relay, OpenSky agreement, paid FR24, WSDOT key/terms, optional reported-news layer. No item in this list is presented as completed live integration.
