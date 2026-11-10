# Companion shared-dataset reader

Status: implementation in progress, 2026-11-10; #42 under spec 031.
Producer source reviewed at Wardriver `2b5a526bac6cf2914c967fa61a185b4ff3db70e8`:
`DeviceDatasetWire.kt`, `DeviceDatasetSync.kt`, `device_sync.proto` and
`specs/036-vnext/shared-map-design.md`. Source compatibility is not Android/browser
parity or deployed convergence evidence.

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

Only the transport is implemented first. It remains unused by the shell until
worker verification/admission is implemented and tested. A hash-shaped object
name is not proof of a content hash: commit slots use domain-separated names.

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

## Remaining evidence

Synthetic transport tests must exercise actual guard denial before storage,
cross-group/path denial, current signed roster matching, revocation races,
oversized/partial streams, outage and deadlines. Worker tests must add real
Android-generated golden bytes, canonical JWS/protobuf failures, monotonicity,
forks, duplicate/conflicting identity, retraction/cutoff and cancellation. Dense
benchmarks, actual storage permissions and multi-client convergence remain #124.
