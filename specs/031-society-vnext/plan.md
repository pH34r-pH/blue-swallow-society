# Society vNext implementation plan

Use the existing plain JS, MapLibre, Azure Functions and private-source release
architecture. No Sites hosting migration or framework rewrite is required.

## Implementation order

1. Add isolated password-session verification, durable revocation/renewal and
   explicit companion authorization. Preserve existing owner APIs. Add a browser
   development-download facade reusing the existing immutable receipt validator.
2. Implement the public journal, explicit login and a separately loaded vNext
   shell; preserve owner step-up and legacy routes as labeled advanced views.
3. Define and implement the browser dataset reader against Wardriver's current
   wire/projection contracts, then Map/Encounters/Trips and parity fixtures.
4. Implement private bird import, preview, publication and public projections.
5. Exercise integrated UI, hosting and private artifact delivery, then physical
   friend installation and sharing. Record actual evidence in tasks.md.

## Authentication boundaries

`api/_lib/viewer-session.js` owns fixed-cost scrypt and purpose-bound tokens;
`viewer-session-store.js` uses the existing Azure Tables dependency with explicit
timeouts and conditional updates. `companion-auth.js` is the only guard accepting
viewer sessions. Existing `operator-auth` remains owner/legacy-only, preventing
accidental access to retained owner data and experiments.

`api/companion-auth/{action}` provides login/session/renew/logout. The runtime
configuration uses `BLUE_SWALLOW_VIEWER_PASSWORD_SCRYPT`,
`BLUE_SWALLOW_VIEWER_SESSION_KEY`, `BLUE_SWALLOW_VIEWER_SESSION_EPOCH`,
`BLUE_SWALLOW_VIEWER_SESSION_STORAGE_CONNECTION_STRING` and optional
`BLUE_SWALLOW_VIEWER_SESSION_TABLE` (default `viewerSessions`). The shared group
is bound to the configured `BSS_WARDRIVER_SYNC_GROUP_ID`, or no group if absent.
Changing it invalidates sessions. The service must provision its private table
before activation; application startup never creates resources.

The browser download facade reads current metadata or an exact immutable
version/source artifact with `wardriver-development-store`; it never reuses the
production validator or discloses the machine-feed bearer.

## Standards

- [Node scrypt](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)
- [Azure TableClient](https://learn.microsoft.com/en-us/javascript/api/@azure/data-tables/tableclient)

Node 24 is required. Run focused source tests, then the existing public CI suite
and real browser tests. Local/synthetic evidence is not Azure, signed-release or
physical-phone evidence. Existing open PR #120 remains independent Fleet work;
do not overwrite it or silently merge its unrelated UI.
