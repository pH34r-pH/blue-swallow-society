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

The explicit `scrypt-sha256` verifier format supports migrating an existing
SHA-256 password digest without recovering the password: derive scrypt over the
32 raw digest bytes, and preprocess each login password in the same way. The
protected migration process must keep the old digest and derived verifier out
of logs. Ordinary `scrypt` remains the format for newly chosen passwords.

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

## Public entry and private shell integration

The public root becomes a journal with separate public CSS/content modules.
It never restores or fetches private state on navigation. Login opens a native
dialog, accepts the password and enters an allowlisted private destination.
A returning session is consulted only after explicit Login or private navigation.
The companion offers a single explicit Admin login action that initiates the
existing Entra owner flow; ordinary friend navigation never starts it. The
retained `/owner` fallback and legacy private APIs remain owner-only.
Password-mode configuration stays explicit until hosting cutover.

Read-only entity inspection must consume bounded, authorized shared-group
projections with stable scoped identity and evidence. It must not obtain an
owner token, reuse the owner-only entity workbench guard, or silently expose
unshared legacy data. Existing owner corrections stay Entra-only. The read-only
entity projection and UI remain to be implemented and verified.

`app/companion-loader.mjs` loads a fixed private HTML/CSS/module set through
`api/companion-ui/`. That route authorizes before filesystem access and does not
share the retained owner's asset allowlist. Private state stays in memory;
abort, expiry, lock, pagehide and failed bootstrap clear the DOM and revoke
object URLs. A BroadcastChannel sends lock notices only, never credentials.
Renewal is an explicit same-origin action. Failed server logout is reported and
retryable after immediately hiding private content.

The private shell owns Map, Encounters, Trips and Downloads routes, with
keyboard-operable panel controls and resizable desktop sidebars. Unconnected
dataset views must say unavailable, never draw synthetic observations. Downloads
renders only validated development metadata, immutable artifact links and
installation guidance; the API remains authoritative on every download.
The handoff copies a stable same-origin phone-page URL without session material;
the private deep-link login returns there. Release metadata is shown progressively,
and an explicit check reloads the current validated receipt. Each artifact link
continues to name the version and source revision the friend actually selected.

Public journal JSON uses an explicit projection of approved authored posts and
sightings. Initial production content contains no invented history. Archive,
species and post views consume that projection; private import/publication and
server-generated RSS/sitemap are the subsequent bird-history work package.

Browser acceptance must cover public-first root with existing cookies, dialog
focus/cancel, safe private deep links, wrong password, actual private asset
denial, storage/bootstrap failures, renewal, expiry, cross-tab lock and BFCache
teardown. Retained Entra tests move to the owner entry rather than forcing the
new public root back to the superseded sign-in design.

## Shared dataset adapter and worker

The [reader decision](../../docs/companion-dataset-reader.md) owns the current
authority, compatibility and bounded transport contract. Implement its read-only
same-origin adapter first, then a verifying in-memory browser worker and shared
projection. Do not connect opaque transport bytes to map rendering prematurely.
Preserve device-owned publication and the independent device access provider.

Pin exact producer protobuf schemas and their license/hash provenance under
`vendor/wardriver-wire/`. Generate static protobufjs code (8.8.1, CLI 2.7.1)
for a CSP-compatible worker without runtime code generation; retain Long values
until converting clocks/sequences to bigint or lossless presentation strings.
Use browser WebCrypto RS256/SHA-256 with exact Android protected headers,
canonical envelope reconstruction, strict budgets and original observation
bytes. Cross-check actual producer-generated golden batches on Node and Chromium.
Generated codec code alone is excluded from structural metrics; authored
verification/admission remains within those checks. Reproducibility runs in CI.

The admission store lives only in the worker's memory. Mirror `JournalBatch`
and `RoomDatasetSync` at the pinned producer revision: validate whole journal
appends before mutation; preserve per-publisher accepted commit ledgers and
cursors; atomically attach exact-byte facts/provenance/retractions. Conflicting
identities quarantine bounded competing bytes and invalidate support without
advancing that peer. Identical cross-publisher claims stay permanently ambiguous
for geometry, including after withdrawal. Signed cutoffs only tighten, retain
raw history/cursors and can undo suffix tombstones; a wrong historical cutoff
hash suppresses the peer. Membership and generation changes invalidate pending
work before publication. Bound records, raw bytes, claims, commits and quarantine
separately, with visible capacity status and no silent eviction.

The loader lazily fetches fixed private `dataset-client.mjs` and generated
`dataset-worker.js` assets after explicit Read shared data. Bundle the worker
with pinned esbuild and check reproducibility in CI. Keep authored files within
structural checks; exclude only the exact generated bundle. The loader retains
credentials; the worker requests only roster/object reads through a bounded
message bridge, never arbitrary paths or URLs. Revalidate response revision/hash,
cap streaming bytes, transfer object buffers, and ignore late results after clear
or teardown. Worker termination on Lock/expiry cancels all pending requests.

Expose progress, contributor cursors, partial/error states, Continue reading,
Cancel refresh and Clear local data independently of the future map projection.
Do not present retained-record counts as visible observations or complete corpus
coverage. Read only on explicit interaction; refresh coalesces while active and
advances fair per-peer batches without silent eviction or unbounded background work.

The first map projection selects admitted, unambiguous GNSS receiver fixes with
publisher/session/boot provenance and lossless clock strings. Exclude invalid and
out-of-Mercator coordinates, bound output to 2,000 points, and report exclusions
and truncation. A fix is a receiver location, never an emitter estimate. Do not
render it using the existing self-hosted MapLibre modules. Show receiver fixes
only, disclose optional third-party basemap requests and require an explicit
button press before fetching tiles. Worker queries require the current epoch and
generation and reject suspended or cleared state; the client invalidates pending
requests on changes, refresh, clear or teardown and bounds query time.

## Standards and validation

For a linked-backend cutover, `scripts/prepare-linked-frontend.mjs` exports the
tracked `app/` tree at an exact full commit, omits its authoring instructions,
explicitly removes the managed Node 24 API setting, and hashes every resulting
frontend file into a separate manifest. The output is a local candidate, not a
published or attested release. Deployment must pair the exact frontend source
with the qualified backend artifact and verify canonical-origin authentication
and private-data separation. The owner's 2026-11-10 Pacific direction removes
rollback planning/rehearsal from this no-users cutover; remaining feature and
physical-pilot qualification stays separate.
The semantic release workflow packages that candidate reproducibly, attests it
against the same tag and source as the OCI image, verifies both attestations and
attaches the frontend archive as a release asset. Existing releases without a
frontend asset retain their historical meaning and are not eligible for cutover.

- [Node scrypt](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)
- [Azure TableClient](https://learn.microsoft.com/en-us/javascript/api/@azure/data-tables/tableclient)

Node 24 is required. Run focused source tests, then the existing public CI suite
and real browser tests. Local/synthetic evidence is not Azure, signed-release or
physical-phone evidence. Existing open PR #120 remains independent Fleet work;
do not overwrite it or silently merge its unrelated UI.
