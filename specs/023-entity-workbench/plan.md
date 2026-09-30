# Plan

Use existing Node 24 ES modules, pg, PostgreSQL migration transactions and node:test.
Extend cyber_entities with companion state/hypothesis/assertion tables; retain canonical
cyber_entities device IDs and entity_observations links. No new framework or registry.
Use bounded transaction timeouts and one advisory lock for low-volume operator edits/model
refresh; optimistic per-cluster revisions reject stale tabs. Keep corrections in a separate
JSON projection and store before/after values in append-only assertion records.

New src/entity-*.mjs modules and migration 0007 are inert until explicit integration. Do not
edit server.mjs, postgres-store.mjs, main.js or auth routes owned by the integration task.
The handler factory requires separate injected exact-owner read and mutation verifiers and defaults to denial; actor
identity never comes from body/header parsing in these modules. No startup migration runner.
Tests use synthetic fixtures in an isolated disposable PostGIS database only.

The optional isolated private UI module uses an injected same-origin request adapter and native
keyboard-accessible forms; it is not asset-allowlisted or mounted by the shared shell.
