# Plan

Use existing Node 24 ES modules, pg, PostgreSQL migration transactions and node:test.
Extend cyber_entities with companion state/hypothesis/assertion tables; retain canonical
cyber_entities device IDs and entity_observations links. No new framework or registry.
Use bounded transaction timeouts and one advisory lock for low-volume operator edits/model
refresh; optimistic per-cluster revisions reject stale tabs. Keep corrections in a separate
JSON projection and store before/after values in append-only assertion records.

Parent transferred shared integration ownership after history PR96. Wire entityStore through
main/server and expose scoped Functions POST routes, with private asset allowlist/loader/shell
integration. No startup migration runner or live auth/deployment configuration. Existing auth
login flow remains unchanged until explicit edit-scope coordination.
The handler factory requires separate injected exact-owner read and mutation verifiers and defaults to denial; actor
identity never comes from body/header parsing in these modules. No startup migration runner.
Tests use synthetic fixtures in an isolated disposable PostGIS database only.

The optional isolated private UI module uses an injected same-origin request adapter and native
keyboard-accessible forms; it is now asset-allowlisted and mounted only through the private shell.

The isolated API adapter reuses the merged common api-access-token.cjs validator with Owner.Read
and Entities.Write. The HTTP dispatch is mounted through the entityStore seam and tested end to end.
