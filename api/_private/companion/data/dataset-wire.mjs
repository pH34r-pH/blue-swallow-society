import { W, O, Reader, ensure, integer, signed, HASH, UUID7, SOURCE, bootId, frame, decode,
  canonical, equalBytes, sha256, utf8, pick, optionalNonnegative } from './protocol.mjs';
import { signedPayload } from './signatures.mjs';
import { validateControl } from './control-records.mjs';
export const MAX_DELTA_BYTES = 1024 * 1024;
export const MAX_RECORD_BYTES = 256 * 1024;
export const MAX_ENTRIES = 512;
export const RECORD_SCOPE = 'radio-location-v1';
const HEAD_FIELDS = ['schemaVersion', 'groupId', 'publisherDeviceId', 'sequence', 'commitSha256'];
const COMMIT_FIELDS = ['schemaVersion', 'groupId', 'publisherDeviceId', 'sequence', 'previousCommitSha256', 'deltaSha256',
  'deltaSize', 'batchId', 'sessionId', 'finalPart', 'observationCount', 'eventCount', 'closedControlSequence', 'retractionCount', 'recordScope'];
const DELTA_FIELDS = ['schemaVersion', 'groupId', 'publisherDeviceId', 'batchId', 'sessionId', 'observations', 'events',
  'finalPart', 'closedControlSequence', 'retractions', 'recordScope'];
export function scope(value) {
  ensure(/^[A-Za-z0-9_-]{1,64}$/.test(value.groupId) && HASH.test(value.deviceId)); return value;
}
function matchesScope(wire, expected) {
  scope(expected); ensure(wire.groupId === expected.groupId && wire.publisherDeviceId === expected.deviceId);
}
export async function commitSlot(expected, sequence) {
  scope(expected); ensure(sequence > 0n && sequence <= (1n << 63n) - 1n);
  return sha256(utf8(`wardriver.dataset.commit-slot.v1\n${expected.groupId}\n${expected.deviceId}\n${sequence}`));
}
export async function decodeHead(expected, key, bytes) {
  const payload = await signedPayload('wardriver.dataset.head.v1', key, bytes, expected.deviceId);
  const wire = decode(W.DatasetHead, payload, 16384); matchesScope(wire, expected);
  ensure(wire.schemaVersion === 1 && integer(wire.sequence) > 0n && HASH.test(wire.commitSha256));
  canonical(W.DatasetHead, wire, HEAD_FIELDS, payload);
  return { sequence: integer(wire.sequence), commitHash: wire.commitSha256 };
}
function validateCommit(wire) {
  ensure([1, 2].includes(wire.schemaVersion) && wire.recordScope === RECORD_SCOPE);
  const sequence = integer(wire.sequence); ensure(sequence > 0n);
  ensure(sequence === 1n ? wire.previousCommitSha256 === '' : HASH.test(wire.previousCommitSha256));
  ensure(wire.deltaSize > 0 && wire.deltaSize <= MAX_DELTA_BYTES && HASH.test(wire.deltaSha256));
  ensure(/^[A-Za-z0-9_.-]{1,128}$/.test(wire.batchId) && UUID7.test(wire.sessionId));
  const counts = [wire.observationCount, wire.eventCount, wire.retractionCount];
  ensure(counts.every((n) => n >= 0 && n <= MAX_ENTRIES));
  const count = counts.reduce((sum, n) => sum + n, 0); ensure(count > 0 && count <= MAX_ENTRIES);
  validateVersion(wire);
}
function validateVersion(wire) {
  if (wire.schemaVersion === 2) {
    ensure(integer(wire.closedControlSequence) === 0n && !wire.finalPart);
    ensure(wire.eventCount === 0 && wire.retractionCount === 0 && wire.observationCount > 0);
  } else ensure(integer(wire.closedControlSequence) > 0n);
}
export async function decodeCommit(expected, key, bytes) {
  const payload = await signedPayload('wardriver.dataset.commit.v1', key, bytes, expected.deviceId);
  const wire = decode(W.DatasetCommit, payload, 16384); matchesScope(wire, expected); validateCommit(wire);
  canonical(W.DatasetCommit, wire, COMMIT_FIELDS, payload);
  return { ...pick(wire, COMMIT_FIELDS), sequence: integer(wire.sequence), closedControlSequence: integer(wire.closedControlSequence),
    commitHash: await sha256(bytes), previousSequence: integer(wire.sequence) - 1n };
}
function inspectDelta(bytes) {
  const reader = Reader.create(bytes); const scalars = new Set(); let entries = 0;
  while (reader.pos < reader.len) {
    const tag = reader.uint32(); const field = tag >>> 3; const type = tag & 7;
    if ([1, 8, 9].includes(field)) {
      ensure(type === 0 && !scalars.has(field)); scalars.add(field); reader.uint64(); continue;
    }
    ensure([2, 3, 4, 5, 6, 7, 10, 11].includes(field) && type === 2);
    const metadata = [2, 3, 4, 5, 11].includes(field);
    if (metadata) { ensure(!scalars.has(field)); scalars.add(field); }
    else { entries++; ensure(entries <= MAX_ENTRIES); }
    const length = reader.uint32(); const limit = metadata || field === 10 ? 128 : (field === 7 ? 65536 : MAX_RECORD_BYTES);
    ensure(length > 0 && length <= limit); reader.skip(length);
  }
}
function validateTime(timing) {
  ensure(timing); bootId(timing.bootEpoch);
  const captured = integer(timing.captureElapsedNs); const received = integer(timing.receivedElapsedNs); signed(timing.wallTimeMs);
  ensure(timing.sourceClock.trim()); optionalNonnegative(timing, ['uncertaintyNs', 'sourceTimestampNs']);
  if (timing.sourceClock === 'android.elapsedRealtimeNanos') ensure(captured <= received);
}
function observation(bytes, sessionId) {
  const wire = decode(O.ObservationRecord, bytes, MAX_RECORD_BYTES);
  ensure(wire.schemaVersion === 1 && UUID7.test(wire.id) && wire.sessionId === sessionId);
  ensure(SOURCE.test(wire.sourceId)); frame(wire.frameId); validateTime(wire.timing);
  ensure(['wifi', 'ble', 'cell', 'gnss', 'external'].includes(wire.payload));
  if (wire.payload === 'external') ensure(['co.blueswallow.operator.emergency.v1',
    'opendroneid.message.v1', 'opendroneid.wifi.message.v1'].includes(wire.external.schemaId));
  return { id: wire.id, sessionId, kind: wire.payload, wire, bytes: bytes.slice() };
}
function manifestMatches(commit, wire) {
  for (const name of ['schemaVersion', 'groupId', 'publisherDeviceId', 'batchId', 'sessionId', 'finalPart', 'recordScope']) {
    ensure(wire[name] === commit[name]);
  }
  ensure(integer(wire.closedControlSequence) === commit.closedControlSequence);
  ensure(wire.observations.length === commit.observationCount && wire.events.length === commit.eventCount
    && wire.retractions.length === commit.retractionCount);
}
function validateEvents(events, commit) {
  let previous = 0n;
  for (const event of events) {
    const sequence = integer(event.wire.sequence); ensure(sequence > previous && sequence <= commit.closedControlSequence);
    if (event.wire.stage === 4) ensure(sequence === commit.closedControlSequence);
    previous = sequence;
  }
  if (commit.finalPart) ensure(events.some((event) => event.wire.stage === 4 && integer(event.wire.sequence) === commit.closedControlSequence));
}
function decodeRecords(wire, commit) {
  const observations = wire.observations.map((bytes) => observation(bytes, commit.sessionId));
  const events = wire.events.map((bytes) => {
    const event = validateControl(decode(O.SessionControlEvent, bytes, 65536), commit.sessionId);
    return { id: event.id, sessionId: event.sessionId, kind: 'event', wire: event, bytes: bytes.slice() };
  });
  const retractions = wire.retractions.map((value) => {
    ensure(UUID7.test(value.id) && UUID7.test(value.targetObservationId) && value.id !== value.targetObservationId);
    return pick(value, ['id', 'targetObservationId']);
  });
  const ids = [...observations, ...events, ...retractions].map((row) => row.id);
  ensure(new Set(ids).size === ids.length); validateEvents(events, commit);
  return { observations, events, retractions };
}
export async function decodeDelta(commit, bytes) {
  ensure(bytes instanceof Uint8Array && bytes.length === commit.deltaSize && bytes.length <= MAX_DELTA_BYTES);
  ensure(await sha256(bytes) === commit.deltaSha256);
  try {
    inspectDelta(bytes); const wire = decode(W.DatasetDelta, bytes, MAX_DELTA_BYTES); manifestMatches(commit, wire);
    const records = decodeRecords(wire, commit);
    const canonicalWire = { ...pick(wire, DELTA_FIELDS), retractions: records.retractions };
    ensure(equalBytes(W.DatasetDelta.encode(canonicalWire).finish(), bytes));
    return { ...records, sessionId: commit.sessionId, batchId: commit.batchId, finalPart: commit.finalPart,
      live: commit.schemaVersion === 2, closedControlSequence: commit.closedControlSequence };
  } catch { throw new Error('invalid_dataset'); }
}
