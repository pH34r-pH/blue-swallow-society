import test from 'node:test';
import assert from 'node:assert/strict';
import { publisher, publication, rosterFixture, revoke, id, groupId } from './fixtures/dataset-reader.mjs';
import { commitSlot } from '../api/_private/companion/data/dataset-wire.mjs';
import { DatasetReader } from '../api/_private/companion/data/reader.mjs';
import { createAdmissionStore } from '../api/_private/companion/data/admission.mjs';
import { O } from '../api/_private/companion/data/protocol.mjs';
const owner = await publisher(); const a = await publisher(); const b = await publisher();
const authority = await rosterFixture(owner, [a, b]);
const empty = { sequence: 0n, commitHash: '' };
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
async function setup(options = {}) {
  const blobs = new Map(); const reads = []; let current = await authority.envelope(); const hooks = {};
  const transport = {
    async loadRoster(signal) { assert.ok(signal instanceof AbortSignal); await hooks.roster?.(); return structuredClone(current); },
    async loadObject(reference, signal, limit) {
      assert.ok(signal instanceof AbortSignal); assert.ok(limit <= 1048576); reads.push({ ...reference });
      await hooks.read?.(reference, signal);
      if (reference.revision !== current.revision || reference.rosterSha256 !== current.rosterSha256) throw new Error('roster_changed');
      return blobs.get(`${reference.deviceId}/${reference.object}`)?.slice() ?? null;
    },
  };
  const states = []; const reader = new DatasetReader({ ...transport, onChange: (state) => states.push(state), ...options });
  async function publish(who, packet) {
    const slot = await commitSlot({ groupId, deviceId: who.deviceId }, packet.commit.sequence);
    blobs.set(`${who.deviceId}/${slot}`, packet.commitBytes); blobs.set(`${who.deviceId}/${packet.commit.deltaSha256}`, packet.deltaBytes);
    blobs.set(`${who.deviceId}/head`, packet.headBytes);
  }
  return { reader, blobs, reads, states, hooks, publish, setRoster: (value) => { current = value; } };
}
const records = (reader) => [...reader.store.observations()];

test('reader admits verified chains incrementally and unchanged heads cause no repeat delta downloads', async () => {
  const s = await setup(); const first = await publication(a); await s.publish(a, first);
  const result = await s.reader.refresh(); assert.equal(result.phase, 'ready'); assert.equal(result.observationChainComplete, true);
  assert.equal(records(s.reader).length, 2); assert.equal(result.commits, 1); const generation = result.generation;
  s.reads.length = 0; const again = await s.reader.refresh();
  assert.equal(again.generation, generation); assert.equal(again.commits, 1); assert.ok(s.reads.every((read) => read.object === 'head'));
  const second = await publication(a, first.tip); await s.publish(a, second); await s.reader.refresh();
  assert.equal(s.reader.status().commits, 2); assert.equal(records(s.reader).length, 2);
  assert.ok(s.states.every((state) => state.phase !== 'refreshing' || !state.observationChainComplete));
});

test('per-peer and object budgets resume with correct cursors and fair publisher progress', async () => {
  const s = await setup({ budget: { objects: 3, perPeer: 1 } });
  const first = await publication(a); const second = await publication(a, first.tip); const other = await publication(b);
  await s.publish(a, first); await s.publish(a, second); await s.publish(b, other);
  let result;
  for (let pass = 0; pass < 12; pass++) {
    result = await s.reader.refresh(); if (result.observationChainComplete) break;
    assert.equal(result.phase, 'partial'); assert.equal(result.more, true);
  }
  assert.equal(result.observationChainComplete, true, JSON.stringify(result)); assert.equal(result.commits, 3);
  assert.equal(s.reader.store.cursor(a.deviceId).sequence, 2n); assert.equal(s.reader.store.cursor(b.deviceId).sequence, 1n);
  assert.equal(records(s.reader).length, 2);
});

test('one invalid peer does not stop others or advance an incomplete chain', async () => {
  const s = await setup(); const invalid = await publication(a); const valid = await publication(b);
  await s.publish(a, invalid); await s.publish(b, valid); s.blobs.delete(`${a.deviceId}/${invalid.commit.deltaSha256}`);
  const result = await s.reader.refresh(); assert.equal(result.phase, 'partial'); assert.equal(result.observationChainComplete, false);
  assert.equal(result.peers.find((peer) => peer.deviceId === a.deviceId).failure, 'invalid_dataset');
  assert.equal(s.reader.store.cursor(a.deviceId).sequence, 0n); assert.equal(s.reader.store.cursor(b.deviceId).sequence, 1n);
  assert.equal(records(s.reader).length, 2);
});

test('observed head rollback and divergent final hash are held even before the old target is fully applied', async () => {
  const s = await setup({ budget: { perPeer: 1 } });
  const first = await publication(a); const second = await publication(a, first.tip); await s.publish(a, first); await s.publish(a, second);
  await s.reader.refresh(); assert.equal(s.reader.store.cursor(a.deviceId).sequence, 1n);
  s.blobs.set(`${a.deviceId}/head`, first.headBytes);
  assert.equal((await s.reader.refresh()).peers.find((p) => p.deviceId === a.deviceId).failure, 'head_conflict');
  const fork = await publication(a, first.tip); s.blobs.set(`${a.deviceId}/head`, fork.headBytes);
  assert.equal((await s.reader.refresh()).peers.find((p) => p.deviceId === a.deviceId).failure, 'head_conflict');
  assert.equal(s.reader.store.cursor(a.deviceId).sequence, 1n);
});

test('identity conflicts invalidate visible support and prevent false peer completion', async () => {
  const s = await setup(); const first = await publication(a); await s.publish(a, first); await s.reader.refresh();
  const row = O.ObservationRecord.decode(first.delta.observations[0].bytes); row.wifi.rssiDbm--;
  const other = await publication(b, empty, { observations: [O.ObservationRecord.encode(row).finish()] }); await s.publish(b, other);
  const result = await s.reader.refresh(); assert.equal(result.conflicts, 1); assert.equal(result.observationChainComplete, false);
  assert.equal(result.peers.find((p) => p.deviceId === b.deviceId).failure, 'identity_conflict');
  assert.equal(records(s.reader).length, 1); assert.equal(s.reader.store.cursor(b.deviceId).sequence, 0n);
});

test('a roster change during a read suppresses old output until the new cutoff is verified', async () => {
  const s = await setup(); const first = await publication(a); await s.publish(a, first); await s.reader.refresh();
  const second = await publication(a, first.tip, { schemaVersion: 1, observations: [], events: [], closedControlSequence: 3,
    retractions: [{ id: id(), targetObservationId: first.delta.observations[0].id }] }); await s.publish(a, second);
  const changed = await authority.envelope(2, (p) => revoke(p, a, empty));
  s.hooks.read = (reference) => { if (reference.deviceId === a.deviceId) s.setRoster(changed); };
  const interrupted = await s.reader.refresh(); assert.equal(interrupted.failure, 'roster_changed');
  assert.equal(interrupted.suspended, true); assert.equal(records(s.reader).length, 0);
  s.hooks.read = null; s.reads.length = 0; const refreshed = await s.reader.refresh();
  assert.equal(refreshed.suspended, false); assert.equal(records(s.reader).length, 0); assert.equal(refreshed.records, 2);
  assert.ok(s.reads.every((read) => read.deviceId !== a.deviceId)); assert.equal(s.reader.store.cursor(a.deviceId).sequence, 1n);
});

test('cancel resumes at the last complete batch; clear rejects late work and resets all private state', async () => {
  const s = await setup(); const first = await publication(a); await s.publish(a, first);
  const entered = deferred(); const release = deferred();
  s.hooks.read = async (reference) => { if (reference.object === first.commit.deltaSha256) { entered.resolve(); await release.promise; } };
  const pending = s.reader.refresh(); assert.equal(s.reader.refresh(), pending); await entered.promise;
  s.reader.cancel(); release.resolve(); assert.equal((await pending).failure, 'cancelled'); assert.equal(s.reader.status().commits, 0);
  s.hooks.read = null; await s.reader.refresh(); assert.equal(s.reader.status().commits, 1);
  const next = await publication(a, first.tip); await s.publish(a, next);
  const enteredAgain = deferred(); const releaseAgain = deferred();
  s.hooks.read = async (reference) => { if (reference.object === next.commit.deltaSha256) { enteredAgain.resolve(); await releaseAgain.promise; } };
  const late = s.reader.refresh(); await enteredAgain.promise; s.reader.clear();
  assert.equal(s.reader.status().phase, 'idle'); assert.equal(records(s.reader).length, 0);
  releaseAgain.resolve(); await late; assert.equal(s.reader.status().commits, 0); assert.equal(s.reader.store.roster(), null);
});

test('capacity and auth errors are explicit; service failures never expose private exception text', async () => {
  const s = await setup({ store: createAdmissionStore({ records: 1 }) }); await s.publish(a, await publication(a));
  const full = await s.reader.refresh(); assert.equal(full.observationChainComplete, false); assert.equal(full.records, 0);
  assert.equal(full.peers.find((p) => p.deviceId === a.deviceId).failure, 'dataset_capacity');
  s.hooks.roster = () => { throw new Error('PRIVATE sig=credential'); };
  const failed = await s.reader.refresh(); assert.equal(failed.failure, 'dataset_unavailable'); assert.doesNotMatch(JSON.stringify(failed), /PRIVATE|credential/);
  s.hooks.roster = () => { throw new Error('session_expired'); };
  assert.equal((await s.reader.refresh()).phase, 'locked'); assert.equal(s.reader.store.roster(), null);
});
