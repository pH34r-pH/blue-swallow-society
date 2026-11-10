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
Generated code is not served by the shell asset allowlist. The wire decoder
has actual Kotlin-producer and Chromium-worker evidence; admission, membership
cutoffs/conflicts, refresh orchestration and map projection remain subsequent
work before the shell can use it. Keep original record bytes and lossless clocks.

```bash
node --test tests/journal-companion-boundary.test.mjs tests/society-vnext.browser.mjs
node scripts/build-companion-wire.mjs --check
node --test tests/dataset-wire.test.mjs tests/dataset-wire.browser.mjs
```
