import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { prepareDraftImport, applyDraftImport } = require('../api/_lib/bird-draft-import');
const header = 'Submission ID,Common Name,Scientific Name,Count,Date,Location\n';
const row = (id, count = 'X', location = 'Private') => `${id},Test,Test avis,${count},2026-01-02,${location}\n`;
const bytes = (text) => Buffer.from(text);
function store() {
  let snapshot = { version: 1, revision: 0, records: [] }; let etag = null; let writes = 0;
  return { async read() { return { snapshot: structuredClone(snapshot), etag }; }, async write(next, expected) {
    if (expected.revision !== snapshot.revision || expected.etag !== etag) throw new Error('bird_snapshot_conflict');
    snapshot = structuredClone(next); etag = `etag-${++writes}`; return { revision: snapshot.revision };
  }, get writes() { return writes; } };
}
test('explicit reviewed selection imports drafts and preserves rows omitted from later exports', async () => {
  const s = store(), input = bytes(header + row('S1') + row('S2')); const first = prepareDraftImport(input, (await s.read()).snapshot);
  const result = await applyDraftImport(s, input, { revision: first.revision, digest: first.digest, selectedRows: [2, 3] });
  assert.deepEqual(result, { revision: 1, imported: 2, publication: 'draft' });
  const partial = bytes(header + row('S1', '3')); const plan = prepareDraftImport(partial, (await s.read()).snapshot);
  assert.equal(plan.plan.counts.change, 1); assert.equal(plan.plan.missingExisting, 1);
  await applyDraftImport(s, partial, { revision: plan.revision, digest: plan.digest, selectedRows: [2] });
  const final = (await s.read()).snapshot; assert.equal(final.records.length, 2); assert.equal(final.records[0].count, 3);
  assert.ok(final.records.every((record) => record.publication === 'draft'));
});
test('stale snapshots, modified files, duplicate or ambiguous selections never write', async () => {
  const s = store(), input = bytes(header + row('S1')); const plan = prepareDraftImport(input, (await s.read()).snapshot);
  await assert.rejects(applyDraftImport(s, bytes(header + row('S1', '2')), { revision: 0, digest: plan.digest, selectedRows: [2] }), /bird_snapshot_conflict/);
  await assert.rejects(applyDraftImport(s, input, { revision: 0, digest: plan.digest, selectedRows: [2, 2] }), /invalid_bird_selection/);
  const duplicates = bytes(header + row('S1') + row('S1')); const dupPlan = prepareDraftImport(duplicates, (await s.read()).snapshot);
  await assert.rejects(applyDraftImport(s, duplicates, { revision: 0, digest: dupPlan.digest, selectedRows: [2] }), /invalid_bird_selection/);
  assert.equal(s.writes, 0);
  await applyDraftImport(s, input, { revision: 0, digest: plan.digest, selectedRows: [2] });
  await assert.rejects(applyDraftImport(s, input, { revision: 0, digest: plan.digest, selectedRows: [2] }), /bird_snapshot_conflict/);
  const reimport = prepareDraftImport(input, (await s.read()).snapshot); assert.equal(reimport.plan.counts.unchanged, 1);
  await assert.rejects(applyDraftImport(s, input, { revision: 1, digest: reimport.digest, selectedRows: [2] }), /invalid_bird_selection/);
  assert.equal(s.writes, 1);
});
test('changes preserve private fields omitted by a later export', async () => {
  const s = store(), original = bytes(header + row('S1')); const a = prepareDraftImport(original, (await s.read()).snapshot);
  await applyDraftImport(s, original, { revision: 0, digest: a.digest, selectedRows: [2] });
  const revised = bytes('Submission ID,Common Name,Scientific Name,Count,Date\nS1,Test,Test avis,2,2026-01-02\n');
  const b = prepareDraftImport(revised, (await s.read()).snapshot);
  await applyDraftImport(s, revised, { revision: 1, digest: b.digest, selectedRows: [2] });
  assert.equal((await s.read()).snapshot.records[0].privateFields.Location, 'Private');
});
