import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { publisherKey } from '../api/_private/companion/data/signatures.mjs';
import { W, O, Reader, sha256, utf8, base64url } from '../api/_private/companion/data/protocol.mjs';
import { decodeHead, decodeCommit, decodeDelta, commitSlot } from '../api/_private/companion/data/dataset-wire.mjs';
const { Writer } = createRequire(new URL('../api/package.json', import.meta.url))('protobufjs/minimal');
const fixture = JSON.parse(await readFile(new URL('./fixtures/dataset-wire/producer-golden.json', import.meta.url)));
const bytes = (value) => Buffer.from(value, 'base64');
const goldenKey = await publisherKey(fixture.publicKeySpki, fixture.deviceId);
const goldenCommit = await decodeCommit(fixture, goldenKey, bytes(fixture.live.commit));
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
const scope = { groupId: 'synthetic-test', deviceId: await sha256(spki) };
const key = await publisherKey(spki.toString('base64url'), scope.deviceId);
function signed(type, payload, header = { alg: 'RS256', typ: type }) {
  const input = `${base64url(utf8(JSON.stringify(header)))}.${base64url(payload)}`;
  return Buffer.from(`${input}.${sign('RSA-SHA256', Buffer.from(input), pair.privateKey).toString('base64url')}`);
}
function headWire(changes = {}) {
  return { schemaVersion: 1, groupId: scope.groupId, publisherDeviceId: scope.deviceId, sequence: 1,
    commitSha256: 'a'.repeat(64), ...changes };
}
function commitWire(changes = {}) {
  const wire = W.DatasetCommit.decode(Buffer.from(bytes(fixture.live.commit).toString().split('.')[1], 'base64url'));
  return { ...wire, groupId: scope.groupId, publisherDeviceId: scope.deviceId, ...changes };
}
async function changedDelta(change, rawChange) {
  const wire = W.DatasetDelta.decode(bytes(fixture.live.delta)); change?.(wire);
  const data = rawChange ? rawChange(W.DatasetDelta.encode(wire).finish()) : W.DatasetDelta.encode(wire).finish();
  const commit = { ...goldenCommit, deltaSize: data.length, deltaSha256: await sha256(data),
    observationCount: wire.observations.length, eventCount: wire.events.length, retractionCount: wire.retractions.length };
  return decodeDelta(commit, data);
}

test('actual Wardriver JVM producer golden v1/v2 signatures, hashes, records and clocks decode exactly', async () => {
  assert.equal(fixture.synthetic, true); assert.equal(fixture.producerCommit, '2b5a526bac6cf2914c967fa61a185b4ff3db70e8');
  const live = await decodeDelta(goldenCommit, bytes(fixture.live.delta));
  assert.equal(goldenCommit.sequence, 1n); assert.equal(goldenCommit.commitHash, fixture.live.commitHash);
  assert.equal(live.live, true); assert.equal(live.finalPart, false);
  assert.deepEqual(live.observations.map((row) => row.id), [fixture.wifiId, fixture.gnssId]);
  assert.equal(live.observations[0].wire.timing.captureElapsedNs.toString(), fixture.captureElapsedNs);
  assert.ok(BigInt(fixture.captureElapsedNs) > BigInt(Number.MAX_SAFE_INTEGER));
  assert.deepEqual([...live.observations[0].bytes.slice(-3)], [0x98, 0x06, 0x07]);
  const original = W.DatasetDelta.decode(bytes(fixture.live.delta)).observations[0];
  assert.deepEqual(live.observations[0].bytes, original);
  assert.equal(live.observations[1].wire.gnss.latitudeDeg, 0);
  const commit = await decodeCommit(fixture, goldenKey, bytes(fixture.closed.commit));
  const closed = await decodeDelta(commit, bytes(fixture.closed.delta));
  assert.equal(commit.sequence, 2n); assert.equal(commit.previousCommitSha256, goldenCommit.commitHash);
  assert.equal(closed.live, false); assert.equal(closed.finalPart, true); assert.equal(closed.events.length, 3);
  assert.deepEqual(closed.retractions, [{ id: fixture.retractionId, targetObservationId: fixture.wifiId }]);
  assert.deepEqual(await decodeHead(fixture, goldenKey, bytes(fixture.closed.head)), { sequence: 2n, commitHash: fixture.closed.commitHash });
  const expected = createHash('sha256').update(`wardriver.dataset.commit-slot.v1\n${scope.groupId}\n${scope.deviceId}\n1`).digest('hex');
  assert.equal(await commitSlot(scope, 1n), expected);
});

test('JWS requires exact type/header, canonical base64, publisher binding and a valid RSA signature', async () => {
  const payload = W.DatasetHead.encode(headWire()).finish();
  const good = signed('wardriver.dataset.head.v1', payload);
  assert.equal((await decodeHead(scope, key, good)).sequence, 1n);
  const badSignature = Buffer.from(good); badSignature[badSignature.length - 5] ^= 1;
  const invalid = [badSignature, Buffer.concat([good, Buffer.from('\n')]), Buffer.alloc(16385),
    signed('wardriver.dataset.commit.v1', payload),
    signed('wardriver.dataset.head.v1', payload, { typ: 'wardriver.dataset.head.v1', alg: 'RS256' }),
    signed('wardriver.dataset.head.v1', payload, { alg: 'RS256', typ: 'wardriver.dataset.head.v1', kid: scope.deviceId }),
    Buffer.from(good.toString().replace('.', '=.'))];
  for (const value of invalid) await assert.rejects(decodeHead(scope, key, value), /invalid_dataset/);
  await assert.rejects(decodeHead({ ...scope, groupId: 'other' }, key, good), /invalid_dataset/);
  await assert.rejects(decodeHead({ ...scope, deviceId: fixture.deviceId }, key, signed('wardriver.dataset.head.v1',
    W.DatasetHead.encode(headWire({ publisherDeviceId: fixture.deviceId })).finish())), /invalid_dataset/);
  await assert.rejects(publisherKey(fixture.publicKeySpki, scope.deviceId), /invalid_dataset/);
});

test('canonical head and commit envelopes reject unknown fields, versions, duplicates and unsafe unsigned sequences', async () => {
  for (const changes of [{ schemaVersion: 2 }, { sequence: 0 }, { commitSha256: '' }, { sequence: { low: 0, high: -2147483648, unsigned: true } }]) {
    await assert.rejects(decodeHead(scope, key, signed('wardriver.dataset.head.v1', W.DatasetHead.encode(headWire(changes)).finish())), /invalid_dataset/);
  }
  const encoded = W.DatasetHead.encode(headWire()).finish();
  for (const suffix of [[0x98, 0x06, 0x07], [0x08, 0x01]]) {
    await assert.rejects(decodeHead(scope, key, signed('wardriver.dataset.head.v1', Uint8Array.from([...encoded, ...suffix]))), /invalid_dataset/);
  }
  for (const changes of [{ schemaVersion: 3 }, { recordScope: 'future' }, { eventCount: 1 }, { finalPart: true },
    { closedControlSequence: 1 }, { observationCount: 0 }, { observationCount: 513 }, { sequence: 2 },
    { previousCommitSha256: 'a'.repeat(64) }, { deltaSize: 1048577 }, { sessionId: 'not-a-v7' }]) {
    await assert.rejects(decodeCommit(scope, key, signed('wardriver.dataset.commit.v1', W.DatasetCommit.encode(commitWire(changes)).finish())), /invalid_dataset/);
  }
});

test('delta framing, retained bytes and manifest are independently verified before admission', async () => {
  await assert.rejects(decodeDelta(goldenCommit, bytes(fixture.live.delta).subarray(1)), /invalid_dataset/);
  for (const suffix of [[0x98, 0x06, 0x07], [0x08, 0x02], [0x32, 0]]) {
    await assert.rejects(changedDelta(null, (data) => Uint8Array.from([...data, ...suffix])), /invalid_dataset/);
  }
  await assert.rejects(changedDelta((wire) => { wire.observations = Array(513).fill(wire.observations[0]); }), /invalid_dataset/);
  await assert.rejects(changedDelta((wire) => { wire.observations.push(wire.observations[0]); }), /invalid_dataset/);
  await assert.rejects(changedDelta((wire) => { wire.groupId = 'other'; }), /invalid_dataset/);
  await assert.rejects(changedDelta((wire) => { wire.finalPart = true; }), /invalid_dataset/);
  const data = bytes(fixture.live.delta); const corrupted = Buffer.from(data); corrupted[corrupted.length - 1] ^= 1;
  await assert.rejects(decodeDelta(goldenCommit, corrupted), /invalid_dataset/);
});

test('unsupported observations and invalid source clocks do not become partial successful batches', async () => {
  for (const alter of [
    (row) => { row.schemaVersion = 2; }, (row) => { row.id = 'not-a-v7'; }, (row) => { row.sourceId = 'invalid source'; },
    (row) => { row.timing.sourceClock = ''; }, (row) => { row.timing.captureElapsedNs = row.timing.receivedElapsedNs.add(1); },
    (row) => { row.frameId = ''; }, (row) => { row.timing.bootEpoch = 'not-a-uuid'; },
    (row) => { row.payload = 'imu'; row.imu = { sensorType: 'synthetic' }; },
    (row) => { row.payload = 'external'; row.external = { schemaId: 'unshared.schema', payload: new Uint8Array([1]) }; },
  ]) {
    await assert.rejects(changedDelta((wire) => {
      const row = O.ObservationRecord.decode(wire.observations[0]); alter(row); wire.observations[0] = O.ObservationRecord.encode(row).finish();
    }), /invalid_dataset/);
  }
});

test('closed batch validates control outcomes, ordering, final Stop and publisher-scoped retraction identities', async () => {
  const commit = await decodeCommit(fixture, goldenKey, bytes(fixture.closed.commit));
  async function alter(change) {
    const wire = W.DatasetDelta.decode(bytes(fixture.closed.delta)); change(wire);
    const data = W.DatasetDelta.encode(wire).finish();
    return decodeDelta({ ...commit, deltaSize: data.length, deltaSha256: await sha256(data),
      eventCount: wire.events.length, retractionCount: wire.retractions.length }, data);
  }
  for (const mutation of [
    (wire) => { wire.events.reverse(); }, (wire) => { wire.events.pop(); },
    (wire) => { wire.retractions[0].targetObservationId = wire.retractions[0].id; },
    (wire) => { const event = O.SessionControlEvent.decode(wire.events[2]); event.outcome = 'intent'; wire.events[2] = O.SessionControlEvent.encode(event).finish(); },
    (wire) => { const event = O.SessionControlEvent.decode(wire.events[0]); event.policy.batteryPercent = -1; wire.events[0] = O.SessionControlEvent.encode(event).finish(); },
  ]) await assert.rejects(alter(mutation), /invalid_dataset/);
});

test('new callback-loss fields stay opaque and retained in control-event bytes', async () => {
  const commit = await decodeCommit(fixture, goldenKey, bytes(fixture.closed.commit));
  const wire = W.DatasetDelta.decode(bytes(fixture.closed.delta));
  const event = O.SessionControlEvent.decode(wire.events[0]);
  const source = O.ControlSourceState.encode({ sourceId: 'ble', kind: 'BLE', health: 'HEALTHY', availability: 'AVAILABLE' }).finish();
  // Fields 28 and 29 are nested CallbackLossAccounting messages in the newer producer.
  const accounting = Writer.create().uint32(8).uint64(1).uint32(16).uint64(2).finish();
  const extendedSource = Buffer.concat([Buffer.from(source), Buffer.from(Writer.create().uint32(226).bytes(accounting).uint32(234).bytes(accounting).finish())]);
  const policy = O.CapturePolicyDecision.encode(event.policy).finish();
  const extendedPolicy = Buffer.concat([Buffer.from(policy), Buffer.from(Writer.create().uint32(82).bytes(extendedSource).finish())]);
  const withoutPolicy = O.SessionControlEvent.encode({ ...event, policy: null }).finish();
  const extendedEvent = Buffer.concat([Buffer.from(withoutPolicy), Buffer.from(Writer.create().uint32(82).bytes(extendedPolicy).finish())]);
  wire.events[0] = extendedEvent;
  const data = W.DatasetDelta.encode(wire).finish();
  const result = await decodeDelta({ ...commit, deltaSize: data.length, deltaSha256: await sha256(data) }, data);
  assert.deepEqual(Buffer.from(result.events[0].bytes), extendedEvent);
  assert.equal(result.events[0].wire.policy.sources[0].sourceId, 'ble');
  assert.equal(Object.hasOwn(result.events[0].wire.policy.sources[0], 'callbackLoss'), false);
});

test('generated wire decoder uses lossless long values and strict protobuf UTF-8', () => {
  assert.equal(Reader.create(new Uint8Array([1])).uint64().toString(), '1');
  assert.throws(() => O.ObservationRecord.decode(new Uint8Array([0x12, 1, 0xff])));
});
