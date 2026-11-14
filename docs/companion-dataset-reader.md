# Companion shared-dataset reader

Status: implementation in progress, 2026-11-10; #42 under spec 031.
Producer source reviewed at Wardriver `2b5a526bac6cf2914c967fa61a185b4ff3db70e8`:
`DeviceDatasetWire.kt`, `DeviceDatasetSync.kt`, `device_sync.proto` and
`specs/036-vnext/shared-map-design.md`. Source compatibility is not Android/browser
parity or deployed convergence evidence.

## Published-producer alignment check — 2026-11-14 UTC

The private development manifest observed on 2026-11-14 identified Wardriver
`0.5-dev-ci.189.2`, source `5e0a17e3ecf4cfbb4632e0e8bb2b2985bbf427d9`
and release run `43523623825-2`. The live Society backend validated that
manifest and retrieved its APK with matching size and SHA-256. This is not a
browser-download or physical-device acceptance result, and later publication
can change the current release.

Compared with the pinned `2b5a526` producer, that published source leaves
`device_sync.proto` and `DeviceDatasetWire.kt` unchanged but adds optional
callback-loss accounting fields to `ControlSourceState` in `observations.proto`.
A synthetic closed-batch regression in `tests/dataset-wire.test.mjs` verifies
that the current reader accepts representative unknown nested fields and
retains the original event bytes. The fields remain opaque to the pinned
decoder: their semantics are not validated or displayed. This focused result is
not evidence of complete Android/browser parity, every newer producer change,
or live shared-map convergence; those gates remain open.

## Decision and authority

Use a same-origin, read-only transport adapter and an in-memory browser worker.
The adapter returns bounded exact bytes from the configured group's existing
private Blob container. It does not ingest scans, compute a hosted map, create a
device identity, sign a roster or issue a storage capability. The worker must
verify publisher signatures, canonical envelopes, sequence/hash links and record
semantics before admitting anything to a generation. Transport success alone
never authorizes a rendered observation.

The password session must name the configured group. An Entra owner may read that
same group through this route, but the adapter never reads the retained Cybermap
corpus. Existing device invitation/write/head and update-feed APIs are unchanged.
Use a dedicated managed identity with read access to this one container. No
private signing key or account key is required by this adapter.

The adapter verifies the pinned service-signed `group.json` roster and compares
it with the current validated control-state roster projection. Missing state,
invalid signature, stale publication or conflicting revision fails closed.
Control-state invitations and request receipts never leave the server. Every
object read binds to the exact roster revision and signed-roster hash; a changed
roster during a read returns a retryable conflict instead of old-generation bytes.
The worker must also reject a lower revision or a changed same-revision roster.

## Transport contract

- `GET /api/companion-datasets/roster` returns version 1, configured group,
  public signer pin, exact signed roster, roster revision and SHA-256 of that
  signed roster. HEAD checks the same authority and omits the body.
- `POST /api/companion-datasets/object` accepts only JSON with `version: 1`,
  `revision`, `rosterSha256`, `deviceId` and `object`. The object is exactly
  `head` or a lowercase SHA-256 identifier. The server constructs the path;
  clients cannot supply a URL, container, group, prefix, SAS or arbitrary path.
- The member must appear in the verified roster. Revoked contributors' retained
  immutable objects remain readable, as in Android group-read scope; their
  mutable head is unnecessary and denied. Their signed accepted-through cutoff
  controls admission in the worker, including undoing later tombstones.
- Success returns exact opaque bytes with no-store headers and the bound roster
  revision/hash. Missing objects return 404; roster changes return 409;
  unavailable/invalid authority returns 503. Errors contain no raw payloads,
  SDK URLs, keys or private exception details.
- Bound heads to 16 KiB and other objects to 1 MiB, control/roster to 128 KiB,
  JSON requests to 1 KiB, and each complete storage operation to eight seconds.
  Limit concurrent storage requests per process to two. No listings or writes.

The transport, wire codec and bounded admission worker are implemented. The shell
loads them only on explicit Read shared data and reports refresh progress; map
and history projections remain unfinished. A hash-shaped object name is not
proof of a content hash: commit slots use domain-separated names.

## Compatibility and generation contract

| Source | Initial reader policy |
| --- | --- |
| Signed roster v1 | Pinned RS256 service authority; current group/member/cutoff projection |
| Signed head v1 | Exact Android protected header, canonical protobuf and publisher identity |
| Observation commits/deltas v1 | Closed-session parts, retained exact observation/event bytes |
| Observation commits/deltas v2 | Live observation-only parts; no fabricated Stop or event coverage |
| `radio-location-v1` facts | Supported Wi-Fi/BLE/cell/GNSS and three declared external schemas |
| Retractions and membership cutoff | Publisher-scoped suppression; retain raw history and commit ledger |
| Repeated UUID / conflicting bytes | Preserve claims; exclude disputed or cross-publisher geometry |
| Evidence slots / artifact-dependent records | Unsupported initially; do not call the whole corpus complete |
| Old Cybermap/PostGIS | Separate owner-only legacy surface; no merge or migration |

Envelope unknown fields are rejected where Android canonicalization rejects
them. Exact original observation bytes, including retained unknown fields, must
remain available for identity comparison; never decode/re-encode them as identity.
JavaScript unsafe integer clocks/sequences must use bigint or lossless strings.

Bootstrap is incremental in a worker with bounded object, record, byte and time
budgets, separate per-publisher cursors and an accepted-commit ledger. Ordinary
viewport/filter changes query the admitted in-memory projection without fetching
the full history again. Publication, admission and projection progress are shown
separately. Interrupted work cannot publish a mixed generation as complete.
Ordinary additions retain usable prior geometry while replacement computes;
withdrawals, cutoffs and conflicts immediately suppress unsafe support. Private
data is memory-only by default and cleared on Lock/expiry/page teardown.

Geometry must derive from canonical observations with publisher/session/boot
clock separation. Begin with receiver fixes and raw encounter/trip facts; port
fixed Wi-Fi estimates only with Android golden parity, and never label capture
coordinates as transmitter locations. Shared identity and supported geometry,
freshness and incompleteness feed Map/Encounters/Trips and the inspector.

## Protected configuration

Enable explicitly with `BSS_WARDRIVER_VIEWER_DATASET_ENABLED=true`. Reuse the
configured `BSS_WARDRIVER_SYNC_GROUP_ID`, `_ACCOUNT_NAME`, `_CONTAINER` and
`_OWNER_PUBLIC_KEY_SPKI`; pin the separate public roster signer through
`BSS_WARDRIVER_VIEWER_DATASET_ROSTER_PUBLIC_KEY_SPKI`. Optionally select the
read-only identity using `BSS_WARDRIVER_VIEWER_DATASET_MANAGED_IDENTITY_CLIENT_ID`.
Changing the group also invalidates viewer sessions. Never copy actual public
identity pins, private datasets or credentials into public issue examples.

## Wire verification checkpoint

`api/_private/companion/data/` verifies publisher SPKI fingerprints, RS256 exact
head/commit headers, canonical protobuf envelopes, signed scope/count/size/hash,
retained observation bytes and supported control-event policy semantics. It
retains Long/bigint clocks without numeric rounding. Unsupported versions or
records fail the whole batch rather than silently dropping rows.

Static protobufjs code is generated from byte-pinned upstream schemas; see
[`vendor/wardriver-wire/README.md`](../vendor/wardriver-wire/README.md) for the
license, reproducibility and actual Kotlin producer fixture procedure. Node
tests and a real Chromium worker with unsafe-eval prohibited consume the same
golden bytes. Source authority is Wardriver `DatasetWire`, `Observation`,
`SessionEvent`, `Identity` and their generated protobuf classes at the pinned
revision. The implementation uses [protobufjs static generation](https://github.com/protobufjs/protobuf.js#code-generation)
and browser WebCrypto, with no bespoke crypto or general protobuf parser.

## Admission and browser worker checkpoint

The authored `roster`, `journal`, `admission-state`, `admission` and `reader` modules
now admit verified shared history in memory. They follow the pinned producer's
`JournalBatch`, `RoomDatasetSync` and `DatasetStorage` source contracts, with whole
journal planning, accepted commit ledgers, exact-byte identity and per-publisher
claims. Conflicts suppress disputed support immediately and retain bounded competing
bytes without advancing that publisher. Identical claims from multiple publishers
remain permanently ambiguous for geometry. Signed cutoffs only tighten; history
and cursors remain intact, and invalidated suffix tombstones stop suppressing their
targets. A pending cutoff verifies at its exact tip; a conflicting known hash
suppresses that publisher.

Default memory caps are 50,000 records, 64 MiB original bytes, 100,000 claims,
20,000 accepted commits and a separate 512-record/4 MiB quarantine. These are
logical retained-data budgets, not a total JavaScript heap guarantee. Each refresh
limits 24 object reads, 8 MiB transferred bytes, four commits per publisher and
20 seconds. Fair continuation avoids starving a peer after budget exhaustion.
No cursor rewinds, silent eviction, persistent storage or automatic refresh loop.

A reproducible esbuild bundle runs under the site's CSP without unsafe-eval. The
private loader keeps the session token; `dataset-client.mjs` bridges only bounded
same-origin roster/object requests and checks response revision/hash. The worker
receives transferred bytes and returns status, not canonical record objects. A
malformed roster or observed authority change suspends visible support; ordinary
outage leaves the last accepted state partial. Clear discards private state, and
Lock/expiry/page teardown terminates the worker and aborts requests.

The UI distinguishes accepted batches and retained records from rendered facts.
Map, Encounters and Trips still show unavailable projections. Independent evidence
streams and derived estimates are explicitly outside initial coverage. Tests
include actual Kotlin v1/v2 bytes in the integrated worker, but full Android Room
admission/projection golden parity and live convergence remain open.

## Remaining evidence and integration

Synthetic transport tests must exercise actual guard denial before storage,
cross-group/path denial, current signed roster matching, revocation races,
oversized/partial streams, outage and deadlines. Node and Chromium tests now cover real
Android-generated golden bytes, canonical JWS/protobuf failures, monotonicity,
forks, duplicate/conflicting identity, retraction/cutoff and cancellation. Dense
benchmarks, actual storage permissions and multi-client convergence remain #124.
