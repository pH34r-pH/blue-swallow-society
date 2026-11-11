import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { W, sha256, utf8, base64url } from '../../api/_private/companion/data/protocol.mjs';
import { publisherKey } from '../../api/_private/companion/data/signatures.mjs';
import { decodeCommit, decodeDelta } from '../../api/_private/companion/data/dataset-wire.mjs';
import { verifyRoster } from '../../api/_private/companion/data/roster.mjs';
export const golden = JSON.parse(await readFile(new URL('./dataset-wire/producer-golden.json', import.meta.url)));
export const groupId = golden.groupId;
export const id = () => randomUUID().replace(/^(.{14})./, (_, prefix) => `${prefix}7`);
export function compact(pair, type, payload, kid) {
  const header = { alg: 'RS256', typ: type, ...(kid ? { kid } : {}) };
  const input = `${base64url(utf8(JSON.stringify(header)))}.${base64url(payload)}`;
  return utf8(`${input}.${sign('RSA-SHA256', Buffer.from(input), pair.privateKey).toString('base64url')}`);
}
export async function publisher() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' }); const deviceId = await sha256(spki);
  return { pair, deviceId, publicKeySpki: spki.toString('base64url'), key: await publisherKey(spki.toString('base64url'), deviceId) };
}
export async function publication(who, previous = { sequence: 0n, commitHash: '' }, changes = {}) {
  const deltaWire = W.DatasetDelta.decode(Buffer.from(golden.live.delta, 'base64'));
  Object.assign(deltaWire, { publisherDeviceId: who.deviceId, batchId: id() }, changes);
  const deltaBytes = W.DatasetDelta.encode(deltaWire).finish();
  const commitWire = { schemaVersion: deltaWire.schemaVersion, groupId, publisherDeviceId: who.deviceId,
    sequence: Number(previous.sequence + 1n), previousCommitSha256: previous.commitHash,
    deltaSha256: await sha256(deltaBytes), deltaSize: deltaBytes.length, batchId: deltaWire.batchId, sessionId: deltaWire.sessionId,
    finalPart: deltaWire.finalPart, observationCount: deltaWire.observations.length, eventCount: deltaWire.events.length,
    closedControlSequence: deltaWire.closedControlSequence, retractionCount: deltaWire.retractions.length, recordScope: deltaWire.recordScope };
  const commitBytes = compact(who.pair, 'wardriver.dataset.commit.v1', W.DatasetCommit.encode(commitWire).finish());
  const commit = await decodeCommit({ groupId, deviceId: who.deviceId }, who.key, commitBytes);
  const headBytes = compact(who.pair, 'wardriver.dataset.head.v1', W.DatasetHead.encode({ schemaVersion: 1, groupId,
    publisherDeviceId: who.deviceId, sequence: commitWire.sequence, commitSha256: commit.commitHash }).finish());
  return { commit, delta: await decodeDelta(commit, deltaBytes), deltaBytes, commitBytes, headBytes,
    tip: { sequence: commit.sequence, commitHash: commit.commitHash } };
}
export async function rosterFixture(owner, peers = []) {
  const service = await publisher();
  const pin = { groupId, rosterPublicKeySpki: service.publicKeySpki };
  const devices = [owner, ...peers].map((p, i) => ({ deviceId: p.deviceId, publicKeySpki: p.publicKeySpki,
    displayName: `Synthetic ${i}`, status: 'active' }));
  async function envelope(revision = 1, mutate = () => {}) {
    const payload = { version: 1, groupId, revision, ownerDeviceId: owner.deviceId, devices: structuredClone(devices) }; mutate(payload);
    const roster = new TextDecoder().decode(compact(service.pair, 'wardriver.sync.roster.v1', utf8(JSON.stringify(payload)), service.deviceId));
    return { version: 1, ...pin, revision, roster, rosterSha256: await sha256(utf8(roster)) };
  }
  return { pin, service, envelope, verify: async (revision = 1, mutate, previous) => verifyRoster(await envelope(revision, mutate), pin, previous) };
}
export function revoke(payload, who, tip) {
  const row = payload.devices.find((entry) => entry.deviceId === who.deviceId);
  row.status = 'revoked'; row.acceptedThrough = { sequence: Number(tip.sequence), commitHash: tip.commitHash || null };
}
