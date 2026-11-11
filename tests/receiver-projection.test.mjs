import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdmissionStore } from '../api/_private/companion/data/admission.mjs';
import { receiverFixes, MAX_MERCATOR_LATITUDE } from '../api/_private/companion/data/receiver-projection.mjs';
import { publisher, publication, rosterFixture, revoke, golden } from './fixtures/dataset-reader.mjs';

test('receiver projection uses verified admitted fixes, preserves clocks and responds to signed cutoffs', async () => {
  const owner = await publisher(), device = await publisher(); const authority = await rosterFixture(owner, [device]);
  const store = createAdmissionStore(); const roster = await authority.verify(); store.applyRoster(roster);
  const packet = await publication(device); store.admit(roster, store.cursor(device.deviceId), packet.commit, packet.delta);
  const result = receiverFixes(store);
  assert.equal(result.points.length, 1); assert.equal(result.points[0].id, golden.gnssId);
  assert.equal(result.points[0].publisher, device.deviceId); assert.equal(result.kind, 'receiver-fixes');
  assert.equal(typeof result.points[0].captureElapsedNs, 'string');
  assert.equal(receiverFixes(store, { publisher: owner.deviceId }).points.length, 0);
  store.applyRoster(await authority.verify(2, (payload) => revoke(payload, device, { sequence: 0n, commitHash: '' }), roster));
  assert.equal(receiverFixes(store).points.length, 0);
});

test('receiver projection excludes ambiguous and invalid geometry, reports polar and bounded results', () => {
  const make = (id, latitude, longitude, extra = {}) => ({ record: { id, kind: 'gnss', sessionId: 'session', wire: {
    gnss: { latitudeDeg: latitude, longitudeDeg: longitude, ...extra },
    timing: { bootEpoch: 'boot', captureElapsedNs: 9007199254740993n, wallTimeMs: 1n } } }, claims: [['device', {}]] });
  const rows = [make('a', 1, 2, { horizontalAccuracyM: 3 }), make('b', 2, 3),
    make('polar', MAX_MERCATOR_LATITUDE + 0.001, 1), make('invalid', NaN, 1)];
  const store = { *observations(options) { assert.equal(options.geometry, true); yield* rows; }, summary: () => ({ generation: 4 }) };
  const result = receiverFixes(store, { limit: 1 });
  assert.equal(result.points.length, 1); assert.equal(result.points[0].accuracyMetres, 3);
  assert.equal(result.points[0].captureElapsedNs, '9007199254740993');
  assert.equal(result.eligible, 2); assert.equal(result.excludedMercator, 1); assert.equal(result.invalid, 1);
  assert.equal(result.truncated, true); assert.equal(result.generation, 4);
  assert.throws(() => receiverFixes(store, { limit: 2001 }), /invalid_projection/);
});
