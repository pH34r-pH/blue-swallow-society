import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { previewBirdExport } = require('../api/_lib/bird-export-preview');
const { planBirdReconciliation } = require('../api/_lib/bird-reconciliation');
const header = 'Submission ID,Common Name,Scientific Name,Count,Date,Location\n';
const row = (id, count = 'X', place = 'Private') => `${id},Test bird,Test avis,${count},2026-01-02,${place}\n`;
const preview = (value) => previewBirdExport(new TextEncoder().encode(value));
test('reconciliation distinguishes unchanged, corrected and new rows without mutating prior state', () => {
  const first = preview(header + row('S1') + row('S2')); const snapshot = { version: 1, records: structuredClone(first.candidates) };
  const before = structuredClone(snapshot); const next = preview(header + row('S1') + row('S2', '3') + row('S3'));
  const plan = planBirdReconciliation(snapshot, next);
  assert.deepEqual(plan.counts, { add: 1, change: 1, unchanged: 1, ambiguous: 0, rejected: 0 });
  assert.deepEqual(plan.items[1].fields, ['count', 'countKind']); assert.equal(plan.writes, false);
  assert.equal(plan.identity, 'provisional'); assert.deepEqual(snapshot, before);
});
test('duplicate keys are ambiguous and missing previous records are never proposed for deletion', () => {
  const previous = preview(header + row('S1') + row('S2')); const next = preview(header + row('S1') + row('S1'));
  const plan = planBirdReconciliation({ version: 1, records: previous.candidates }, next);
  assert.equal(plan.counts.ambiguous, 2); assert.equal(plan.missingExisting, 1); assert.equal(plan.deletion, 'none');
  assert.ok(plan.items.every((item) => item.action === 'ambiguous'));
});
test('omitted optional columns do not erase private fields, while supplied corrections are reported', () => {
  const first = preview(header + row('S1')); const snapshot = { version: 1, records: first.candidates };
  const withoutLocation = preview('Submission ID,Common Name,Scientific Name,Count,Date\nS1,Test bird,Test avis,X,2026-01-02\n');
  assert.equal(planBirdReconciliation(snapshot, withoutLocation).counts.unchanged, 1);
  const correction = preview(header + row('S1', 'X', 'New private place'));
  assert.deepEqual(planBirdReconciliation(snapshot, correction).items[0].fields, ['privateFields.Location']);
});
test('malformed or duplicated snapshot keys fail closed', () => {
  const incoming = preview(header + row('S1')); const record = incoming.candidates[0];
  assert.throws(() => planBirdReconciliation({ version: 1, records: [record, record] }, incoming), /invalid_bird_snapshot/);
  assert.throws(() => planBirdReconciliation({ version: 2, records: [] }, incoming), /invalid_bird_snapshot/);
});
