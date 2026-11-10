import test from 'node:test';
import assert from 'node:assert/strict';
import { golden, publisher, publication, rosterFixture, revoke, id } from './fixtures/dataset-reader.mjs';
import { verifyRoster } from '../api/_private/companion/data/roster.mjs';
import { createAdmissionStore } from '../api/_private/companion/data/admission.mjs';
import { W, O } from '../api/_private/companion/data/protocol.mjs';
import { validateNext } from '../api/_private/companion/data/journal.mjs';
const owner = await publisher(); const a = await publisher(); const b = await publisher();
const authority = await rosterFixture(owner, [a, b]);
const empty = { sequence: 0n, commitHash: '' };
async function setup(limits) { const store = createAdmissionStore(limits); store.applyRoster(await authority.verify()); return store; }
const admit = (store, packet) => store.admit(store.roster(), store.cursor(packet.commit.publisherDeviceId), packet.commit, packet.delta);
const rows = (store, options) => [...store.observations(options)];

test('roster pins signer/group and verifies exact signed membership, monotonic revision and same-revision identity', async () => {
  const first = await authority.verify(); assert.equal(first.members.size, 3);
  const envelope = await authority.envelope();
  for (const changes of [{ groupId: 'other' }, { rosterPublicKeySpki: a.publicKeySpki }, { rosterSha256: 'a'.repeat(64) },
    { revision: 2 }, { roster: envelope.roster.replace(/^./, 'x') }]) {
    await assert.rejects(verifyRoster({ ...envelope, ...changes }, authority.pin), /invalid_roster/);
  }
  const next = await authority.verify(2, (payload) => { payload.devices[1].displayName = 'Renamed'; }, first);
  await assert.rejects(verifyRoster(envelope, authority.pin, next), /invalid_roster/);
  await assert.rejects(authority.verify(2, (payload) => { payload.devices[1].displayName = 'Different'; }, next), /invalid_roster/);
  for (const mutate of [
    (p) => p.devices.push(p.devices[1]), (p) => { p.devices[1].deviceId = b.deviceId; },
    (p) => { p.devices[1].status = 'revoked'; }, (p) => { p.devices[0].status = 'revoked'; p.devices[0].acceptedThrough = { sequence: 0, commitHash: null }; },
    (p) => { p.devices[1].displayName = 'bad\nname'; },
  ]) await assert.rejects(authority.verify(2, mutate), /invalid_roster/);
});

test('whole-batch admission retains exact bytes, advances once and rejects stale/out-of-order/forked work', async () => {
  const store = await setup(); const first = await publication(a);
  assert.equal(admit(store, first), 'applied'); assert.equal(rows(store).length, 2);
  assert.equal(store.cursor(a.deviceId).sequence, 1n); assert.equal(store.summary().records, 2);
  assert.deepEqual(rows(store)[0].record.bytes, first.delta.observations[0].bytes);
  assert.equal(store.admit(store.roster(), empty, first.commit, first.delta), 'stale');
  assert.equal(store.summary().commits, 1);
  const second = await publication(a, first.tip);
  assert.throws(() => store.admit(store.roster(), first.tip, { ...second.commit, previousCommitSha256: 'f'.repeat(64) }, second.delta), /invalid_dataset/);
  assert.equal(store.summary().commits, 1); assert.equal(admit(store, second), 'applied');
  assert.equal(rows(store).length, 2); assert.equal(store.summary().claims, 2); assert.equal(store.summary().commits, 2);
});

test('same UUID/bytes across publishers deduplicate counts but permanently exclude ambiguous geometry', async () => {
  const store = await setup(); const first = await publication(a); const other = await publication(b);
  admit(store, first); admit(store, other);
  assert.equal(rows(store).length, 2); assert.equal(rows(store, { publisher: a.deviceId }).length, 2);
  assert.equal(rows(store, { geometry: true }).length, 0); assert.equal(store.summary().claims, 4);
  const removal = await publication(b, other.tip, { schemaVersion: 1, observations: [], events: [], finalPart: false,
    closedControlSequence: 3, retractions: [{ id: id(), targetObservationId: golden.wifiId }] });
  admit(store, removal); const wifi = rows(store).find((row) => row.record.id === golden.wifiId);
  assert.equal(wifi.claims.length, 1); assert.equal(wifi.ambiguous, true); assert.equal(rows(store, { geometry: true }).length, 0);
});

test('conflicting bytes and cross-kind identities suppress disputed support without advancing the peer', async () => {
  const store = await setup(); const first = await publication(a); admit(store, first);
  const wire = O.ObservationRecord.decode(first.delta.observations[0].bytes); wire.wifi.rssiDbm--;
  const changed = await publication(b, empty, { observations: [O.ObservationRecord.encode(wire).finish()] });
  assert.equal(admit(store, changed), 'conflict'); assert.equal(store.cursor(b.deviceId).sequence, 0n);
  assert.deepEqual(rows(store).map((row) => row.record.id), [golden.gnssId]);
  assert.equal(store.summary().quarantineRecords, 1); assert.equal(store.summary().conflicts, 1);
  assert.equal(admit(store, changed), 'conflict'); assert.equal(store.summary().quarantineRecords, 1);
  const collision = await publication(b, empty, { schemaVersion: 1, observations: [], events: [], closedControlSequence: 3,
    retractions: [{ id: golden.gnssId, targetObservationId: golden.wifiId }] });
  assert.equal(admit(store, collision), 'conflict'); assert.equal(rows(store).length, 0); assert.equal(store.summary().commits, 1);
});

test('withdrawal before target suppresses only the issuer and cutoff can undo a later tombstone without rewinding', async () => {
  const store = await setup();
  const tombstone = await publication(a, empty, { schemaVersion: 1, observations: [], events: [], closedControlSequence: 3,
    retractions: [{ id: id(), targetObservationId: golden.wifiId }] });
  admit(store, tombstone); const target = await publication(a, tombstone.tip); admit(store, target);
  assert.deepEqual(rows(store).map((row) => row.record.id), [golden.gnssId]);
  admit(store, await publication(b)); assert.equal(rows(store).length, 2);
  const second = await setup(); const first = await publication(a); admit(second, first);
  const later = await publication(a, first.tip, { schemaVersion: 1, observations: [], events: [], closedControlSequence: 3,
    retractions: [{ id: id(), targetObservationId: golden.wifiId }] });
  admit(second, later); assert.equal(rows(second).length, 1);
  second.applyRoster(await authority.verify(2, (p) => revoke(p, a, first.tip), second.roster()));
  assert.equal(rows(second).length, 2); assert.equal(second.cursor(a.deviceId).sequence, 2n);
  assert.equal(second.cutoff(a.deviceId).state, 'verified');
  second.applyRoster(await authority.verify(3, () => {}, second.roster()));
  assert.equal(rows(second).length, 2); assert.equal(second.cutoff(a.deviceId).sequence, 1n);
  assert.throws(() => admit(second, { ...later, commit: { ...later.commit, sequence: 3n, previousSequence: 2n,
    previousCommitSha256: later.commit.commitHash } }), /invalid_dataset/);
});

test('cutoff zero and wrong historical hash suppress immediately; a pending cutoff verifies at its exact accepted commit', async () => {
  const first = await publication(a); const store = await setup();
  store.applyRoster(await authority.verify(2, (p) => revoke(p, a, first.tip), store.roster()));
  assert.equal(store.cutoff(a.deviceId).state, 'pending'); assert.equal(admit(store, first), 'applied');
  assert.equal(store.cutoff(a.deviceId).state, 'verified');
  store.applyRoster(await authority.verify(3, (p) => revoke(p, a, { ...first.tip, commitHash: 'f'.repeat(64) }), store.roster()));
  assert.equal(store.cutoff(a.deviceId).state, 'conflict'); assert.equal(rows(store).length, 0);
  const zero = await setup(); admit(zero, first);
  zero.applyRoster(await authority.verify(2, (p) => revoke(p, a, empty), zero.roster()));
  assert.equal(rows(zero).length, 0); assert.equal(zero.summary().records, 2); assert.equal(zero.cursor(a.deviceId).sequence, 1n);
});

test('control journals validate whole appends before any facts, claims or cursor change', async () => {
  const store = await setup(); const source = W.DatasetDelta.decode(Buffer.from(golden.closed.delta, 'base64'));
  const invalid = await publication(a, empty, { schemaVersion: 1, events: [source.events[2]], finalPart: true, closedControlSequence: 3 });
  assert.throws(() => admit(store, invalid), /journal_conflict/); assert.equal(store.summary().records, 0);
  const valid = await publication(a, empty, { schemaVersion: 1, events: source.events, finalPart: true, closedControlSequence: 3 });
  assert.equal(admit(store, valid), 'applied'); assert.equal([...store.events()].length, 3);
  const next = O.SessionControlEvent.decode(source.events[0]); next.id = id(); next.sequence = 4;
  const afterStop = await publication(a, valid.tip, { schemaVersion: 1, observations: [], events: [O.SessionControlEvent.encode(next).finish()],
    finalPart: false, closedControlSequence: 5 });
  assert.throws(() => admit(store, afterStop), /journal_conflict/); assert.equal(store.summary().commits, 1);
});

test('health/checkpoint journal links preserve control stage, epoch, elapsed clock and mode', () => {
  const start = { sequence: 1n, stage: 1, bootEpoch: 'epoch', elapsedNs: 1n, mode: 'PASSIVE' };
  const applied = { ...start, sequence: 2n, stage: 3 };
  validateNext(null, start); validateNext(start, applied);
  const checkpoint = { ...applied, sequence: 3n, stage: 6, checkpointControlStage: 'APPLIED', checkpointControlSequence: 2n };
  validateNext(applied, checkpoint);
  const health = { ...checkpoint, sequence: 4n, stage: 5, healthTransition: { controlStage: 'APPLIED', controlSequence: 2n } };
  validateNext(checkpoint, health); validateNext(health, { ...applied, sequence: 5n, stage: 4 });
  for (const change of [{ bootEpoch: 'other' }, { mode: 'SURVEY' }, { elapsedNs: 0n }, { sequence: 9n }, { stage: 1 }]) {
    assert.throws(() => validateNext(start, { ...applied, ...change }), /journal_conflict/);
  }
  assert.throws(() => validateNext(applied, { ...checkpoint, checkpointControlSequence: 1n }), /journal_conflict/);
});

test('capacity failure never half-admits a batch; clearing discards all private state', async () => {
  const store = await setup({ records: 1 }); const packet = await publication(a);
  assert.throws(() => admit(store, packet), /dataset_capacity/); assert.equal(store.summary().records, 0); assert.equal(store.cursor(a.deviceId).sequence, 0n);
  const conflictStore = await setup({ quarantineBytes: 1 }); admit(conflictStore, packet);
  const wire = O.ObservationRecord.decode(packet.delta.observations[0].bytes); wire.wifi.rssiDbm--;
  const bad = await publication(b, empty, { observations: [O.ObservationRecord.encode(wire).finish()] });
  assert.throws(() => admit(conflictStore, bad), /dataset_capacity/); assert.equal(rows(conflictStore).length, 1);
  assert.equal(conflictStore.summary().quarantineIncomplete, true); assert.equal(conflictStore.cursor(b.deviceId).sequence, 0n);
  conflictStore.clear(); assert.equal(conflictStore.roster(), null); assert.equal(rows(conflictStore).length, 0); assert.equal(conflictStore.summary().rawBytes, 0);
});
