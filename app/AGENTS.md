# Society app map

The public browser boundary is intentionally small:

- `index.html`, `journal.css`, `journal-view.mjs` and `main.js` provide the
  public journal and explicit password dialog. Root navigation never restores
  a private session. Public records come only from `/api/bird-journal`.
  Only the API's `invalid_password` response is described as a rejected password;
  platform or session failures remain retryable service errors.
- `companion.html` and `companion-loader.mjs` restore viewer sessions only on
  private navigation or explicit Login, then load the isolated private shell.
  Lock, expiry, failed bootstrap and pagehide clear private DOM/object URLs.
  Explicit Read shared data loads the private client/worker; the loader keeps
  credentials and provides authorized transport. Teardown terminates that worker.
  The map loader retrieves fixed, authenticated MapLibre modules and revokes
  their object URLs on teardown; its basemap requires explicit user action.
- `owner/index.html` and `owner/main.js` retain Entra owner entry at `/owner`.
  Session restore and login start have bounded requests; a late restore cannot
  overwrite a newer login's state.
  `/owner/birds` restores an owner session and previews a chosen CSV in memory.
  It can save explicitly selected records as private drafts, but cannot publish.
  Clear, expiry and page teardown discard the in-page preview state.
- `operator/index.html`, `loader.js`, and `operator-session.mjs` redirect direct
  retained owner routes to `/owner`, restore the short-lived owner session, and
  fetch the retained owner shell/assets after authentication.
- `staticwebapp.config.json` maps viewer and retained owner routes and denies retired
  public paths such as `/downloads/*`; it does not authorize Functions data.
- `public-events.mjs` is retained for historical/event-surface compatibility.

Data flow is browser → same-origin `/api/*` → Functions auth/proxy → VM API. The
browser must not call the VM directly, include secrets, persist owner tokens in
local/session storage, or expose the private operator shell. The private loader
uses object URLs and clears them on page teardown.

Route a change to `api/companion-auth/` for viewer sessions; to `api/owner-auth/`
and `api/shared/owner-session.cjs` for owner sessions; to `api/_private/companion/`
for the viewer surface or `api/_private/operator/` for retained owner tools; and to
the relevant API/VM contract for data behavior. Focused checks:

```bash
node --test tests/society-vnext.browser.mjs tests/journal-companion-boundary.test.mjs
node --test tests/owner-auth.test.mjs tests/owner-login.browser.mjs tests/root-login-handoff-browser.test.mjs
node --test tests/companion-navigation.test.mjs tests/companion.browser.mjs tests/ui-shell.test.mjs
git diff --check
```

Browser tests require the `api/` dependencies and Playwright setup used by
`.github/workflows/public-ci.yml`; a local pass is not hosted deployment proof.
