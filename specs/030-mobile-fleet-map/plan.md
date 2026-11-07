# Implementation plan

Extend the buildless Society companion with `fleet-state.mjs`, `fleet-view.mjs`,
and scoped `fleet.css`. Reuse its private asset allowlist, loader, route
controller, design tokens, and owner request headers. A bounded SVG edge layer
and semantic HTML node buttons provide the small topology view without adding
React, a second application framework, a graph database, or a graph editor.
The previously evaluated React Flow and Cytoscape options remain appropriate
only if layout/graph-editing needs outgrow this deliberately small read-only map.

The overview lays out resource groups and repositories in a stable portrait
composition. A selected repository shows a bounded neighborhood and recent issue
satellites; paging and explicit counts expose overflow. A bottom sheet provides
issue details, metrics, freshness, and connection evidence. A text alternative
supports assistive technology without becoming the default phone experience.

`api/operator-fleet/` reuses `requireOwnerRead` and the installed Azure Blob and
identity packages. `BSS_FLEET_SNAPSHOT_BLOB_URL` is protected runtime
configuration, never a browser field. Use managed identity, a bounded deadline,
a 512-KiB body ceiling, 80 nodes, 200 edges, 240 issues, and strict references.
The configured snapshot is an integration seam for existing private collectors;
producer automation, new grants, provisioning, and deployment are separate work.

Update the narrow source maps and `docs/current-source-map.md`. Preserve dated
audits and the runtime/authentication cutover constraints. Validate focused
contracts first, followed by applicable root source regressions. A separate
review preview may reuse the existing private Fleet Atlas Site with synthetic
test data; it is not the Society production deployment or another resource.
