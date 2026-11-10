import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { previewBirdExport } = require('../api/_lib/bird-export-preview');
const bytes = (value) => new TextEncoder().encode(value);
const header = 'Submission ID,Common Name,Scientific Name,Count,Date,Location,Species Comments\r\n';
test('bounded CSV preview preserves Unicode, quoted newlines, presence and private fields without publishing', () => {
  const input = '\ufeff' + header + 'S123,"Sparrow, test",Passer test,X,2026-10-01,"Home, private","note\ncontinued"\r\n'
    + 'S124,Élan bird,Test avis,,2026-10-02,,\r\n';
  const result = previewBirdExport(bytes(input));
  assert.deepEqual(result.summary, { rows: 2, candidates: 2, rejected: 0, ambiguous: 0 });
  assert.equal(result.candidates[0].countKind, 'presence'); assert.equal(result.candidates[0].count, null);
  assert.equal(result.candidates[0].privateFields.Location, 'Home, private');
  assert.equal(result.candidates[0].privateFields['Species Comments'], 'note\ncontinued');
  assert.equal(result.candidates[1].countKind, 'unknown'); assert.equal(result.publishes, false);
  assert.ok(result.candidates.every((record) => record.publication === 'draft' && record.identity === 'provisional'));
});
test('duplicate provisional identities are flagged, not merged; different checklists remain distinct', () => {
  const row = 'S1,Test bird,Test avis,3,2026-01-01,,\r\n';
  const result = previewBirdExport(bytes(header + row + row + row.replace('S1,', 'S2,')));
  assert.equal(result.summary.ambiguous, 2); assert.equal(result.candidates[2].identity, 'provisional');
  assert.notEqual(result.candidates[0].provisionalKey, result.candidates[2].provisionalKey);
});
test('invalid rows are reported without falling back to guessed counts or dates', () => {
  const result = previewBirdExport(bytes(header + 'S1,Test,Test avis,0,2026-02-30,,\r\nS2,Test,Test avis,4,2026-03-01,,\r\n'));
  assert.deepEqual(result.rejected, [{ row: 2, reason: 'invalid_required_value' }]); assert.equal(result.candidates[0].count, 4);
});
test('unsupported headers, malformed CSV, invalid UTF-8 and oversized files fail closed', () => {
  for (const [input, error] of [[bytes('wrong,columns\na,b'), 'unsupported_export'],
    [bytes(header + '"unclosed'), 'invalid_export_csv'], [new Uint8Array([255]), 'invalid_export_encoding'],
    [new Uint8Array(10 * 1024 * 1024 + 1), 'invalid_export_size']]) assert.throws(() => previewBirdExport(input), new RegExp(error));
});
test('record count is bounded without silently accepting a truncated export', () => {
  const row = 'S1,Test,Test avis,1,2026-01-01,,\r\n';
  assert.throws(() => previewBirdExport(bytes(header + row.repeat(100001))), /invalid_export_size/);
});
