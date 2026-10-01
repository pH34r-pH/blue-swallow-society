# Society app map

The public browser boundary is intentionally small:

- `index.html` and `main.js` provide the Blue Swallow owner sign-in face.
- `operator/index.html`, `loader.js`, and `operator-session.mjs` redirect direct
  operator routes to the sign-in page, restore the short-lived owner session, and
  fetch the private companion shell/assets after authentication.
- `staticwebapp.config.json` maps the four companion routes and denies retired
  public paths such as `/downloads/*`; it does not authorize Functions data.
- `public-events.mjs` is retained for historical/event-surface compatibility;
  the current root source is the Microsoft owner sign-in flow.

Data flow is browser → same-origin `/api/*` → Functions auth/proxy → VM API. The
browser must not call the VM directly, include secrets, persist owner tokens in
local/session storage, or expose the private operator shell. The private loader
uses object URLs and clears them on page teardown.

Route a change to `api/owner-auth/` and `api/shared/owner-session.cjs` for owner
session behavior; to `api/_private/operator/` for the companion surface; and to
the relevant API/VM contract for data behavior. Focused checks:

```bash
node --test tests/owner-auth.test.mjs tests/owner-login.browser.mjs tests/root-login-handoff-browser.test.mjs
node --test tests/companion-navigation.test.mjs tests/companion.browser.mjs tests/ui-shell.test.mjs
git diff --check
```

Browser tests require the `api/` dependencies and Playwright setup used by
`.github/workflows/public-ci.yml`; a local pass is not hosted deployment proof.
