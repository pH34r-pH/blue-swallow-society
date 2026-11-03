# Wardriver private device sync access

## Source and operational boundary

This access provider supports the device-owned datasets in Wardriver issue #375.
It establishes membership and issues brief Blob capabilities. Phones upload,
deduplicate, pull peers, verify signatures, and incrementally maintain their own
map. The provider never accepts observation payloads or processes maps.

The source contract is
[`specs/029-wardriver-device-sync-access/`](../specs/029-wardriver-device-sync-access/spec.md).
The [current source map](current-source-map.md) distinguishes implementation from
deployment. Protected settings, a qualified Node 24 host, live Azure authorization,
and physical phone acceptance are separate operational gates. Wardriver's retained
Node 22 managed-SWA promoter cannot deploy the current Society Node 24 source.

## Initial owner and friend handoff

1. Install Wardriver, choose a friendly device name, and use its Settings action
   to copy the device setup public key. The private Android Keystore key remains
   on the phone. Provision that public SPKI as the owner key; do not grant
   ownership to the first requester.
2. Provision the service settings below, including a separate service roster
   signer. The owner authorizes this signer through protected deployment; the
   service does not hold the owner's private key.
3. In that protected provisioning environment, run
   `node scripts/wardriver-sync-owner-setup.mjs > owner-setup.json`. The output
   contains public setup metadata and a `configurationUrl`; it never contains
   the signer private key or storage credentials. Keep the setup file with the
   operator's configuration, outside the repository and CI logs.
4. Open its `wardriver://configure?endpoint=...&group=...&key=...` link on the
   owner phone. Fields are percent-encoded. The app pins the exact HTTPS endpoint,
   group, and signer, then requests a challenge and signed `/grants`. Only the
   configured owner succeeds before any invitations exist. Possession of the
   setup URL alone grants no membership. Save enrollment only after success.
5. The enrolled owner signs `/invite`. Its response includes an `inviteUrl`:
   `wardriver://invite?endpoint=...&group=...&key=...&token=...`. Share this link
   privately with one friend. The friend installs the app first, chooses a
   friendly name, and opens the invitation; the app enrolls using its own key.
6. Subsequent grant renewal needs only that device key. The app must refuse
   silent endpoint, group, or signer changes for an already enrolled device.

An invitation defaults to one day and may be requested for 300–604800 seconds.
It is usable by one key. After admission, the same key and invitation can recover
a lost enrollment response even after invitation expiry. Losing the app's key is
a new identity requiring a new invitation; it does not transfer ownership of the
old dataset. Service-signer rotation requires an explicit owner-coordinated pin
and roster migration, not automatic trust of a newly returned key.

## Protected deployment settings

The route is disabled unless `BSS_WARDRIVER_SYNC_ENABLED` is exactly `true` and
every required setting validates. These settings belong in protected deployment
configuration, never APK resources, public manifests, or source control.

| Setting | Contract |
| --- | --- |
| `BSS_WARDRIVER_SYNC_ENABLED` | `true` only after provisioning; absent means disabled |
| `BSS_WARDRIVER_SYNC_GROUP_ID` | `[A-Za-z0-9_-]{1,64}`, stable for the group |
| `BSS_WARDRIVER_SYNC_ENDPOINT` | Canonical HTTPS URL on default port 443 ending `/api/wardriver-sync`; omit explicit port, query, fragment, and userinfo |
| `BSS_WARDRIVER_SYNC_ACCOUNT_NAME` | Azure public-cloud storage account name |
| `BSS_WARDRIVER_SYNC_CONTAINER` | One existing private Blob container for this group |
| `BSS_WARDRIVER_SYNC_OWNER_PUBLIC_KEY_SPKI` | Canonical base64url RSA public SPKI DER from the owner phone |
| `BSS_WARDRIVER_SYNC_ROSTER_PRIVATE_KEY_PEM` | Protected PKCS#8 RSA service signing key, distinct from owner key |
| `BSS_WARDRIVER_SYNC_OWNER_NAME` | Optional initial owner name; defaults to `Owner device` |
| `BSS_WARDRIVER_SYNC_MAX_DEVICES` | Optional active membership cap, 1–5; defaults to 5 |
| `BSS_WARDRIVER_SYNC_MANAGED_IDENTITY_CLIENT_ID` | Optional user-assigned managed identity client UUID; otherwise system identity |

Assign the provider's managed identity **Storage Blob Data Contributor** on the
group container, and **Storage Blob Delegator** on the storage account for
`generateUserDelegationKey`. Keep the container anonymous access disabled and
Shared Key access disabled where compatible with other account consumers. No
storage account key or connection-string fallback exists in this provider.
Azure's [user delegation documentation](https://learn.microsoft.com/en-us/rest/api/storageservices/create-user-delegation-sas)
describes the intersection between the delegating identity and SAS permissions.

Control metadata is `_control/wardriver-sync-state.json`, public group metadata
is the signed `group.json`, and datasets are under `devices/<deviceId>/`.
Clients cannot read `_control/` because read grants cover only `devices/` and
the exact roster blob. Conditional ETag writes serialize membership, invitation
consumption, and replay nonces in the private control object. A later authenticated
request repairs an interrupted public roster publication without rolling its
revision back.

## Wire format

All routes are POST JSON to the exact configured origin. Clients must disable
redirect following for proof and capability requests. Requests are limited to
16 KiB; responses are `Cache-Control: private, no-store`. The APIs accept neither
owner cookies, platform identity headers, nor private-update-feed reader tokens.

### Challenge and device proof

`/challenge` accepts:

```json
{"version":1,"publicKeySpki":"<canonical base64url DER SPKI>"}
```

It returns `version`, `groupId`, `deviceId`, `challenge`, `expiresAt` (epoch
seconds), and `rosterPublicKeySpki`. The signed challenge is valid for 120 seconds
and needs no Blob access. Its JSON payload is:

```json
{
  "version": 1,
  "groupId": "<configured group>",
  "audience": "<exact configured endpoint>",
  "deviceId": "<lowercase SHA256 of device SPKI DER>",
  "nonce": "<32 random bytes, base64url>",
  "issuedAt": 1800000000,
  "expiresAt": 1800000120
}
```

Challenge protected header is `alg: RS256`,
`typ: wardriver.sync.challenge.v1`, and `kid` equal to the service signer's
lowercase SPKI SHA-256. Device and service keys are RSA 2048 or 4096 with exponent
65537. All signatures use SHA-256 / PKCS#1 v1.5 and standard compact JWS.

Every other route accepts `{"proof":"<compact JWS>"}`. The phone's protected
header is exactly `alg: RS256`, `typ: wardriver.sync.request.v1`, and
`kid: <deviceId>`. Its JSON payload contains:

```json
{
  "version": 1,
  "groupId": "<configured group>",
  "action": "enroll",
  "publicKeySpki": "<device public SPKI>",
  "challenge": "<server signed challenge>",
  "invitation": "<private invitation token>",
  "displayName": "Friendly phone"
}
```

The proof signs every action field. The action must match the route. Server
challenge timestamps avoid dependence on the phone's wall clock. Each challenge
can authorize one successful state transaction; obtain a fresh challenge after
an expired, replayed, or response-loss retry.

| Route/action | Additional signed fields | Authorization |
| --- | --- | --- |
| `enroll` | `invitation`, `displayName` | Valid single-use invite or same-key admission recovery |
| `grants` | None | Active member; pinned owner is seeded |
| `invite` | Optional `expiresInSeconds` | Pinned active owner |
| `rename` | `displayName` | Active member changes its own name |
| `revoke` | `targetDeviceId`, `acceptedThrough` | Pinned active owner; cannot revoke itself |

Names are nonempty, trimmed, at most 64 UTF-16 code units, without control or
bidirectional override characters. `acceptedThrough` is
`{"sequence":N,"commitHash":"<64 lower hex>"}`; use sequence zero and a null
hash to retain no commits. The owner chooses this cutoff from verified client
state. It is immutable once revoked. The service does not download or interpret
dataset heads to choose it. Integer values must fit JSON's safe integer range.

### Successful enrollment and grants

`enroll` and `grants` return:

```json
{
  "version": 1,
  "groupId": "<group>",
  "deviceId": "<device fingerprint>",
  "displayName": "Friendly phone",
  "roster": "<compact signed roster>",
  "rosterPublicKeySpki": "<pinned service public key>",
  "expiresAt": 1800000300,
  "storage": {
    "containerUrl": "<exact HTTPS container URL without SAS>",
    "readUrl": "<container>/devices?<read prefix SAS>",
    "createUrl": "<container>/devices/<self>/objects?<create prefix SAS>",
    "headUrl": "<container>/devices/<self>/head.json?<exact head SAS>",
    "rosterUrl": "<container>/group.json?<exact read SAS>"
  }
}
```

The SDK generates five-minute HTTPS **user delegation** grants with these exact
scopes; paths are derived from the authenticated device identity:

| Capability | Permission | Resource / depth | Client behavior |
| --- | --- | --- | --- |
| Group datasets | `r` | `sr=d`, `sdd=1` | Append a roster member's relative dataset path before the query |
| Own immutable objects | `c` | `sr=d`, `sdd=3` | Append the object's fixed hash key; create with `If-None-Match: *` |
| Own mutable head | `cw` | `sr=b` | Use exact URL; conditional ETag update after durable objects |
| Group roster | `r` | `sr=b` | Use exact URL; verify JWS before applying |

There are no container listing, deletion, peer write, or immutable overwrite
grants. Readers derive paths from the signed roster and commit protocol. Azure's
[prefix scope documentation](https://learn.microsoft.com/en-us/rest/api/storageservices/create-user-delegation-sas#user-delegation-sas-support-for-prefix-scoped-or-directory-scoped-access-blob-storage-and-data-lake-storage-only)
supports `sr=d` for flat Blob namespaces with authorization version 2020-02-10
or later. The pinned Node Blob SDK 12.33.0 exposes `isDirectory`; this service
uses authorization version 2024-11-04. Azure's
[Put Blob permission contract](https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob#permissions)
requires write permission to overwrite, while create permission suffices for a
new object. Validate these denials against the intended live account before
operational acceptance; a fake storage unit test cannot prove cloud enforcement.

`invite`, `rename`, and `revoke` return the common identity and signed roster
fields. `invite` additionally returns `invitation`, `expiresAt`, `endpoint`, and
`inviteUrl`; it does not grant storage access. Revocation stops future grants and
publishes the signed cutoff. An in-flight or already issued grant can remain
usable for its five-minute lifetime. Previously downloaded data is not erased by
revocation; clients apply the explicit accepted cutoff when reconciling maps.

### Signed roster

Protected header is `alg: RS256`, `typ: wardriver.sync.roster.v1`, and service
signer fingerprint `kid`. JSON payload contains `version:1`, `groupId`, increasing
`revision`, `ownerDeviceId`, and `devices` sorted by fingerprint. Each entry
contains `deviceId`, `publicKeySpki`, `displayName`, and `status` (`active` or
`revoked`). Revoked entries additionally carry `acceptedThrough`. `group.json`
contains `{"version":1,"roster":"<compact JWS>"}`.

Clients pin the invitation/configuration signer, verify signature/type/group,
check every full public key against its fingerprint, and persist the highest
accepted roster revision. Reject lower revisions or changed contents at the same
revision. The provider retains at most 32 identities and 32 live invitation
records; exceeding these limits requires explicit owner maintenance rather than
unbounded control-state growth.

### Errors and retries

Errors are `{"error":{"code":"..."}}`, never exception details or credentials.

| HTTP | Codes | Client behavior |
| --- | --- | --- |
| 400 / 413 | `invalid_request`, `request_too_large` | Correct the payload; do not retry unchanged |
| 401 | `invalid_proof`, `challenge_expired` | Verify key/configuration; get a fresh challenge for expiry |
| 403 | `not_member`, `owner_required`, `invitation_invalid` | Do not treat denied access as enrollment |
| 404 / 405 | `route_not_found`, `device_not_found`, `method_not_allowed` | Correct route, method, or target |
| 409 | `challenge_used`, `invitation_used`, `group_full`, `owner_protected`, `cutoff_conflict` | Fresh challenge for replay; other conflicts need the indicated owner action |
| 429 / 503 | `rate_limited`, `sync_unavailable` | Persist local work and retry with backoff and a fresh challenge |

## Evidence

Focused checks:

```bash
node --test tests/wardriver-sync-auth.test.mjs tests/wardriver-sync-api.test.mjs
node --test tests/node-runtime-contract.test.mjs tests/wardriver-development-api.test.mjs tests/wardriver-development-store.test.mjs
git diff --check
```

Tests use generated synthetic keys and a conditional-write Blob fake. They cover
cryptographic type/action/group binding, canonical keys, concurrent invite claims,
replay, lost responses, roster publication repair/races, member and owner
authorization, revocation, bounded state, redacted errors, and actual SDK-generated
SAS path/permission/depth/expiry. Actual host and deployment evidence belongs in
the task record; none of these unit checks substitutes for live storage or phone
acceptance.

Source validation on 2026-11-03 passed 21 focused checks and all 353 public source
tests on Node 24.22.1. Functions Core Tools 4.16.0 / runtime 4.1054.250.26428
loaded the actual binding: six disabled actions returned 503, a synthetic
configured challenge returned a verifiable RS256 JWS, and an invalid proof
returned 401. The local host used an isolated configuration with only the
extension bundle omitted because its download was network-blocked. Local storage
health remained unconfigured. These HTTP probes establish route loading and
authentication behavior, not full unchanged-host or deployed Azure acceptance.
