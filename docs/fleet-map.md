# Private Fleet map

Fleet is a read-only graphical view inside Society at /operator/fleet.
The implementation and acceptance contract is
[specs/030-mobile-fleet-map](../specs/030-mobile-fleet-map/spec.md).
This page describes source behavior, not a deployed service.

## Interaction

The phone layout starts with hardware, repositories, and Azure resources on a
portrait graph. Directed edges distinguish build, deploy, and ingest
relationships. A repository opens a focused neighborhood and its most recently
updated issues as graph nodes. Selecting an issue or resource opens a detail
sheet while retaining the map. A text alternative exposes the same records.

The 24-hour, seven-day, and 30-day windows filter issue updates, not creation or
completion dates. Completed closures remain distinct from other closures.
An issue closure is not deployment evidence. Bounded graph and issue pages show
their counts; omitted nodes are not implied absent from the complete snapshot.

Health comes from the producer's observation time and freshness deadline.
Missing observations are unknown, expired observations are stale, and an
intentionally stopped resource is distinct from a failure. A snapshot refresh
does not renew health evidence. The view refreshes only while active and visible,
aborts reads when left, and clears private content when authorization is lost.

## Existing Society boundary

The public route serves the existing operator loader. The Fleet shell, modules,
and CSS are delivered through the existing private asset allowlist.
GET /api/operator-fleet requires Entra mode and Society's owner-read checks
before storage configuration or reads. Device sync credentials, development
update readers, and legacy passcodes do not authorize this endpoint.

The route uses the installed Azure Blob and identity packages. It reads one
server-configured snapshot with managed identity:

| Protected setting | Purpose |
|---|---|
| BSS_FLEET_SNAPSHOT_BLOB_URL | Exact HTTPS URL of a snapshot in existing private Azure Blob storage; no SAS or request-provided source |
| BSS_FLEET_MANAGED_IDENTITY_CLIENT_ID | Optional existing user-assigned identity; omit for the existing system-assigned identity |

This source change does not configure either setting or add a storage account,
identity, access grant, database, collector schedule, or hosting resource.
The backend keeps only its SDK client, reads the Blob on each authorized request,
and returns private/no-store responses. Reads have a five-second deadline and a
512-KiB byte ceiling. Failures are redacted.

## Snapshot contract

The bss.fleet.v1 schema has producer generatedAt, up to 16 source states,
80 nodes, 200 directed edges, and 240 issues. Nodes are repositories, hardware,
or Azure resources. Optional health contains state, observedAt, freshUntil,
and up to eight metrics. Issues retain stateReason and updatedAt.
The normalizer rejects duplicate IDs, dangling references, malformed times,
invalid URLs, and unbounded values; it drops extra producer fields.

Private inventory and issue content must be supplied by an authorized producer
outside this public repository and its artifacts. The synthetic fixture under
tests/fixtures supports testing only. Runtime code never falls back to it.

The integration seam permits existing private inventory and GitHub collectors to
publish a minimized snapshot. Choosing and configuring that producer remains
operational work. Collection frequency determines how current the dashboard is;
repeatedly fetching one old Blob does not make the dashboard live.

## Acceptance boundary

The focused source tests are:

    node --test tests/fleet-state.test.mjs tests/operator-fleet-api.test.mjs
    node --test tests/companion-navigation.test.mjs tests/companion-tabs.test.mjs tests/operator-shell-api.test.mjs tests/ui-shell.test.mjs tests/operator-session-boundary.test.mjs
    git diff --check

Society's current source requires Node 24. The retained Wardriver managed-SWA
publisher accepts Node 22; the separately qualified same-source Functions OCI
path, owner identity/consent, runtime linkage, and rollback acceptance remain
existing hosting work. See the
[current source map](current-source-map.md),
[owner API contract](common-api-auth-contract.md), and
[public CI handoff](public-ci-handoff.md).

Live Fleet acceptance requires the qualified existing Society deployment, a real
producer snapshot, storage-read authorization, correct-owner success and
wrong-owner denial, and an exact-source deployment record. A local browser check
or private synthetic design preview is not that evidence.
