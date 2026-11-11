import { ensure, HASH, unbase64, sha256, utf8, text } from './protocol.mjs';
import { publisherKey } from './signatures.mjs';
const MAX_ROSTER_BYTES = 128 * 1024;
function exact(value, names) {
  ensure(value && typeof value === 'object' && !Array.isArray(value));
  ensure(Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name)));
}
function revision(value) { ensure(Number.isSafeInteger(value) && value > 0); return value; }
function cutoff(row) {
  if (row.status === 'active') { ensure(row.acceptedThrough === undefined); return null; }
  ensure(row.status === 'revoked'); const value = row.acceptedThrough; exact(value, ['sequence', 'commitHash']);
  ensure(Number.isSafeInteger(value.sequence) && value.sequence >= 0);
  ensure(value.sequence === 0 ? value.commitHash === null : typeof value.commitHash === 'string' && HASH.test(value.commitHash));
  return { sequence: BigInt(value.sequence), commitHash: value.commitHash || '' };
}
async function member(row) {
  exact(row, row.status === 'revoked'
    ? ['deviceId', 'publicKeySpki', 'displayName', 'status', 'acceptedThrough'] : ['deviceId', 'publicKeySpki', 'displayName', 'status']);
  ensure(typeof row.deviceId === 'string' && HASH.test(row.deviceId));
  ensure(typeof row.displayName === 'string' && row.displayName.length <= 64 && row.displayName.trim() === row.displayName && row.displayName.length > 0);
  ensure(!/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(row.displayName));
  const acceptedThrough = cutoff(row); const key = await publisherKey(row.publicKeySpki, row.deviceId);
  return Object.freeze({ deviceId: row.deviceId, publicKeySpki: row.publicKeySpki, displayName: row.displayName,
    active: row.status === 'active', acceptedThrough, key });
}
async function verifySignature(envelope) {
  ensure(typeof envelope.roster === 'string' && envelope.roster.length <= MAX_ROSTER_BYTES);
  const parts = envelope.roster.split('.'); ensure(parts.length === 3);
  const signerId = await sha256(unbase64(envelope.rosterPublicKeySpki, 1024));
  const key = await publisherKey(envelope.rosterPublicKeySpki, signerId);
  const header = JSON.parse(text(unbase64(parts[0], 512))); exact(header, ['alg', 'typ', 'kid']);
  ensure(header.alg === 'RS256' && header.typ === 'wardriver.sync.roster.v1' && header.kid === signerId);
  const payload = unbase64(parts[1], MAX_ROSTER_BYTES); const signature = unbase64(parts[2], 512);
  ensure(signature.length === Math.ceil(key.algorithm.modulusLength / 8));
  ensure(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, utf8(`${parts[0]}.${parts[1]}`)));
  ensure(await sha256(utf8(envelope.roster)) === envelope.rosterSha256);
  return JSON.parse(text(payload));
}
function envelopeScope(envelope, pin, previous) {
  exact(envelope, ['version', 'groupId', 'revision', 'rosterSha256', 'roster', 'rosterPublicKeySpki']);
  ensure(envelope.version === 1 && envelope.groupId === pin.groupId && envelope.rosterPublicKeySpki === pin.rosterPublicKeySpki);
  ensure(typeof pin.groupId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(pin.groupId)); revision(envelope.revision);
  if (!previous) return;
  ensure(previous.groupId === pin.groupId && previous.rosterPublicKeySpki === pin.rosterPublicKeySpki);
  ensure(envelope.revision >= previous.revision);
  if (envelope.revision === previous.revision) ensure(envelope.rosterSha256 === previous.rosterSha256 && envelope.roster === previous.roster);
}
export async function verifyRoster(envelope, pin, previous = null) {
  try {
    envelopeScope(envelope, pin, previous); const payload = await verifySignature(envelope);
    exact(payload, ['version', 'groupId', 'revision', 'ownerDeviceId', 'devices']);
    ensure(payload.version === 1 && payload.groupId === pin.groupId && payload.revision === envelope.revision);
    ensure(Array.isArray(payload.devices) && payload.devices.length > 0 && payload.devices.length <= 32);
    const members = new Map();
    for (const row of payload.devices) { const value = await member(row); ensure(!members.has(value.deviceId)); members.set(value.deviceId, value); }
    ensure(members.get(payload.ownerDeviceId)?.active);
    return Object.freeze({ ...envelope, ownerDeviceId: payload.ownerDeviceId, members });
  } catch { throw new Error('invalid_roster'); }
}
