# Wardriver private device sync access

## Status and authority

Source implementation for Wardriver issue #375. This package adds an access
provider; it does not establish deployment, storage provisioning, or phone
evidence. The existing owner dashboard, legacy ingestion, and private update feed
remain separate authentication boundaries.

## Observable contract

1. A protected deployment pins one group, its owner device public key, and a
   dedicated roster signing key. Unconfigured deployments fail closed. There is
   no first-caller ownership and no account registration.
2. The owner requests a private, single-use invitation using a signed device
   proof. A friend installs Wardriver, chooses a friendly name, and opens the
   invitation. The invitation pins the exact HTTPS provider, group, and roster
   signer. Device identity is lowercase SHA-256 of canonical RSA SPKI DER.
3. A challenge expires after two minutes. A proof signs that challenge, action,
   group, and all action fields using standard compact JWS RS256. An authenticated
   challenge is consumed atomically with its operation. Replay fails.
4. An invitation admits one key atomically. A different key cannot claim it;
   the admitted key can recover a lost response using a fresh challenge and the
   same invitation. The active-device cap is configurable from one through five,
   defaulting to five, matching the current phone contract. The provider endpoint
   uses canonical HTTPS on default port 443.
5. A member receives a signed, versioned roster and five-minute HTTPS user
   delegation SAS grants: group dataset reads, create-only own immutable objects,
   exact own head writes, and exact roster reads. No client can read control state,
   list the container, overwrite immutable objects, or write another device's data.
6. Members may rename themselves. Only the pinned owner may invite or revoke.
   Revocation includes an explicit accepted sequence and commit-hash cutoff;
   already issued grants expire within five minutes. The owner cannot revoke
   itself through this route.
7. Clients transfer datasets directly to Blob storage, verify signed records,
   deduplicate, and merge the local map. This provider never accepts scan bodies,
   processes maps, or receives a storage account key.
8. Invitation URLs, proofs, SAS grants, private keys, and dataset contents are
   never logged. Responses are private/no-store. Body, state, retry, membership,
   invitation, and nonce counts are bounded.

## Acceptance

All authentication/action mismatches fail before grants; concurrent invitation
claims produce one member; replay and revoked devices fail; response-loss recovery
preserves the same identity; directory SAS scopes exclude control state and peers'
writes; a stale roster writer cannot replace a newer revision. Source tests and
host checks are recorded separately from live provisioning and physical-device
proof.

A separately enabled, owner-allowlisted active device may receive a five-minute read-only development update grant after proving its dataset identity. The grant is signed by the pinned service key, scoped to the configured update-feed origin and exact artifact storage host/container, and is not a dataset or owner credential. Disabled or malformed optional configuration never grants update access. Existing independent reader credentials continue to work.
