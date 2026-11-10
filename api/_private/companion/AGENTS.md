# Society vNext companion map

This is the viewer-safe Vector Edge surface. `api/companion-ui/` serves only its
fixed HTML/CSS/module allowlist after the asynchronous companion guard checks
authority. `app/companion-loader.mjs` owns memory-only sessions, private object
URLs, expiry, renewal, cross-tab lock and page teardown.

`shell.html` and `theme.css` own desktop/phone layout. `main.mjs` owns route
activation, keyboard/pointer panel resize and the development download card.
Map, Encounters and Trips currently show explicit unavailable states; they do
not read the old owner's Cybermap corpus or manufacture observations.

Data integration must preserve current device-dataset signatures, scope,
revisions and withdrawal semantics. Never substitute a device identity or
broaden the retained owner guard. The download card calls the browser facade;
it never receives a machine update-feed credential.

`data/` contains the browser-compatible protobuf/JWS verification modules.
`vendor/wire.cjs` is generated from byte-pinned upstream schemas by
`scripts/build-companion-wire.mjs`; never edit generated output manually.
The schema module is not served directly. `dataset-worker.js` bundles the authored
reader/admission code and pinned runtime through `scripts/build-companion-worker.mjs`;
never edit that generated asset. It and `dataset-client.mjs` are private allowlisted
assets, loaded only after Read shared data. The client uses the loader's authorized
request function; credentials never cross the worker message boundary. Lock/expiry
terminates the worker and aborts transport. No persistent cache is used.

`roster.mjs`, `journal.mjs`, `admission*.mjs` and `reader.mjs` verify signed membership,
retain bounded exact-byte facts/claims/cursors, quarantine conflicts, apply sticky
cutoffs and orchestrate bounded cancellable refresh. The shell exposes progress and
clear/refresh controls only. Map/history projection and full Android Room parity
remain unfinished. Keep original record bytes and lossless clocks.
`receiver-projection.mjs` supplies bounded unambiguous receiver fixes. The
worker query requires the current epoch and generation and rejects suspended or
cleared state. The private client rejects stale, timed-out and teardown-racing
queries. The map interface does not consume this query yet.

```bash
node --test tests/journal-companion-boundary.test.mjs tests/society-vnext.browser.mjs
node scripts/build-companion-wire.mjs --check
node scripts/build-companion-worker.mjs --check
node --test tests/dataset-wire.test.mjs tests/dataset-admission.test.mjs tests/dataset-reader.test.mjs tests/dataset-client.test.mjs
node --test tests/dataset-wire.browser.mjs tests/dataset-reader.browser.mjs
```
