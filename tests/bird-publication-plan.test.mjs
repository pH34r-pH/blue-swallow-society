import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { previewBirdExport } = require('../api/_lib/bird-export-preview');
const { planBirdPublication } = require('../api/_lib/bird-publication-plan');
const { projectPublicJournal } = require('../api/bird-journal');
const csv = 'Submission ID,Common Name,Scientific Name,Count,Date,Location,Latitude,Species Comments\nS1,Test bird,Test avis,X,2026-01-02,PRIVATE HOME,47.123,PRIVATE NOTE\n';
const record = previewBirdExport(Buffer.from(csv)).candidates[0];
const snapshot = { version: 1, revision: 1, records: [record] };
const empty = { version: 1, updatedAt: null, posts: [], sightings: [] };
const now = new Date('2026-11-10T12:00:00Z');
const options = { now, secret: Buffer.alloc(32, 7) };
test('explicit approval builds only sanitized public fields and never mutates drafts', () => {
  const before = structuredClone(snapshot);
  const plan = planBirdPublication(snapshot, empty, { publish: [{ key: record.provisionalKey, place: 'County' }], unpublish: [] }, options);
  assert.deepEqual(snapshot, before); assert.equal(plan.writes, false); assert.equal(plan.requiresReview, true);
  const publicValue = projectPublicJournal(plan.publication); assert.equal(publicValue.sightings.length, 1);
  assert.equal(publicValue.sightings[0].count, null); assert.equal(publicValue.sightings[0].place, 'County');
  assert.doesNotMatch(JSON.stringify(publicValue), /PRIVATE|47\.123|S1|privateFields|Species Comments/);
  assert.doesNotMatch(JSON.stringify(publicValue), new RegExp(record.provisionalKey));
  const other = planBirdPublication(snapshot, empty, { publish: [{ key: record.provisionalKey, place: 'County' }], unpublish: [] },
    { now, secret: Buffer.alloc(32, 8) });
  assert.notEqual(other.publication.sightings[0].id, plan.publication.sightings[0].id);
});
test('explicit unpublish removes only the selected public record; omitted records remain', () => {
  const second = previewBirdExport(Buffer.from(csv.replace('S1,', 'S2,'))).candidates[0];
  const both = { version: 1, revision: 1, records: [record, second] };
  const approved = planBirdPublication(both, empty, { publish: [{ key: record.provisionalKey, place: '' }, { key: second.provisionalKey, place: '' }], unpublish: [] }, options).publication;
  const next = planBirdPublication(both, approved, { publish: [], unpublish: [record.provisionalKey] }, options);
  assert.equal(projectPublicJournal(next.publication).sightings.length, 1);
  assert.throws(() => planBirdPublication(snapshot, empty, { publish: [], unpublish: [record.provisionalKey] }, options), /invalid_bird_publication/);
});
test('unknown counts, conflicting actions, unknown drafts and malformed public state fail closed', () => {
  const unknown = structuredClone(snapshot); unknown.records[0].countKind = 'unknown';
  const action = { publish: [{ key: record.provisionalKey, place: '' }], unpublish: [] };
  assert.throws(() => planBirdPublication(unknown, empty, action, options), /invalid_bird_publication/);
  assert.throws(() => planBirdPublication(snapshot, empty, { ...action, unpublish: [record.provisionalKey] }, options), /invalid_bird_publication/);
  assert.throws(() => planBirdPublication(snapshot, empty, { publish: [{ key: 'f'.repeat(64), place: '' }], unpublish: [] }, options), /invalid_bird_publication/);
  assert.throws(() => planBirdPublication(snapshot, { ...empty, sightings: [{ published: false }] }, action, options), /invalid_bird_publication/);
  assert.throws(() => planBirdPublication(snapshot, empty, action, { now, secret: Buffer.alloc(12) }), /invalid_bird_publication/);
});
