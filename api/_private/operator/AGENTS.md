# Private companion surface map

`shell.html` is the authenticated companion dashboard markup. `app/operator/loader.js`
owns private asset boot; `assets/main.js` owns view teardown; `companion-tabs.mjs`
owns route activation and lifecycle transitions, while `companion-navigation.mjs` maps `godeye →
travels`, `entities → entities`, `world → world`, and `devices → devices`.

Important relationships:

- `travels-view.mjs`/`travels-state.mjs` call `/api/cybermap/history` and render
  capture evidence; they must not infer emitter position or complete trips.
- `godeye-*`, `wigle.mjs`, and `travels-map.mjs` render bounded owner context;
  `godeye-live-feed.mjs` owns the bounded viewport response preparation, while
  current GPS is sent to a same-origin POST proxy.
- `entity-client.mjs`/`entity-workbench.mjs` call the four entity operations.
  Reads use the owner-read boundary; preview/mutate remain disabled until the
  explicit Entra editing scope is granted. Optimistic revision and idempotency
  checks are part of the UI contract.
- `world-*` renders public aggregate context and epoch-bounded propagated orbital
  predictions, not personal or live tracking evidence.
- `vision*.mjs` is parser/controller support only. The current shell has no
  browser AR tab; actual camera/ARCore/LiteRT behavior belongs to Wardriver.

All files in this directory are delivered through `api/operator-assets` after
the shell request grants the session. Do not add direct public static imports,
network endpoints, secrets, raw observation payloads, or synthetic runtime data.

Focused checks:

```bash
node --test tests/companion-navigation.test.mjs tests/companion.browser.mjs tests/travels.browser.mjs tests/ui-shell.test.mjs
node --test tests/entity-workbench.browser.mjs tests/entity-integration.browser.mjs tests/vision-freshness.test.mjs
git diff --check
```
