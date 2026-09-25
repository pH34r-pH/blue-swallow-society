# Society Node 24 upgrade — source and deployment boundaries

## Decision (2026-09-25)

The owner explicitly selected Node 24 for Society and its tests. This supersedes
the earlier #63 review recommendation to preserve Node 22 for Functions and split
root tests across versions. Both native packages now require Node 24; `.nvmrc`
is the shared CI selection. Keep service/profile ownership separate, not separate
Node majors. Do not weaken engines or delete tests to obtain a pass.

## Source implementation and verification

`api/package.json` and its lockfile root metadata target `>=24.0.0 <25`, matching
the existing Cybermap engine and `.nvmrc`. Dependency versions, integrity hashes
and transitive package engines are unchanged. Both public CI jobs consume
`.nvmrc`, check the actual process version and native manifest/lock agreement
before installation, and use `npm ci --engine-strict --ignore-scripts`.

The existing root suite, including authentication/privacy/source contracts, and
the Cybermap API suite remain intact. The pre-existing three optional Obscura
browser exclusions are unchanged. The requirements validator uses the accepted
public Long Haul revision; no candidate-supplied installer or credential is added.

## Deployment is NOT established by a source test

`app/staticwebapp.config.json` declares the desired `node:24` API runtime. It is
not evidence that Azure Static Web Apps accepted it or that the deployed service
changed. The current deployment workflow is manually dispatched; do not deploy
this revision to production until the managed-API target is qualified.

As checked 2026-09-25, Microsoft's Azure Functions version documentation lists
Node 24, but its separate Static Web Apps configuration table lists managed Node
runtimes only through 22. General Functions support does not prove managed SWA
support. Confirm target support and perform a non-production runtime/auth-route
smoke before promotion. If the service rejects Node 24, retain the Node 24 source
target and resolve the hosting boundary with the infrastructure owner; do not
silently fall back to Node 22 or weaken package requirements.

Primary references:
- https://learn.microsoft.com/en-us/azure/static-web-apps/configuration#platform
- https://learn.microsoft.com/en-us/azure/static-web-apps/languages-runtimes
- https://learn.microsoft.com/en-us/azure/azure-functions/functions-versions

Track remaining managed-runtime qualification under Society #61 and the private
Wardriver deployment owner. No Azure deployment, hosting-plan migration, new
resource, database change, credential rotation or private-data export is part of
this source upgrade. Record actual CI and deployment results separately.
