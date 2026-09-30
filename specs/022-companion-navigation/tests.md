# Validation

- Node route tests: all four paths preserve filters/selection; unsupported destinations rejected; release card belongs to Devices; experiment tabs absent.
- Existing root and VM suites retain API/private boundary and experiment source coverage; archived markup tests explicitly use the archived file.
- `node --test tests/companion.browser.mjs` uses pinned Playwright and Chromium with the real private asset/shell handlers and authenticated memory bootstrap. At mobile width it covers navigation, Back, query preservation, manifest refresh/failure, disabled downloads, fixture APK download and anonymous shell denial. It is not Entra login or physical Android acceptance.
- CI installs the pinned package browser and runs the browser test in a dedicated mandatory-success workstream before merge. Local Chromium can be selected with PLAYWRIGHT_CHROMIUM_EXECUTABLE.
