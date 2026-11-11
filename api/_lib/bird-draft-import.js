'use strict';
const { createHash, timingSafeEqual } = require('node:crypto');
const { previewBirdExport } = require('./bird-export-preview');
const { planBirdReconciliation } = require('./bird-reconciliation');
const hash = (value) => createHash('sha256').update(value).digest('hex');
function fingerprintDraft(bytes, snapshot, plan) {
  return hash(JSON.stringify({ version: 1, csv: hash(bytes), snapshot: hash(JSON.stringify(snapshot)), plan }));
}
function changeDetails(snapshot, preview, plan) {
  const prior = new Map(snapshot.records.map((row) => [row.provisionalKey, row]));
  const candidates = new Map(preview.candidates.map((row) => [row.row, row]));
  return plan.items.filter((item) => item.action === 'change').map((item) => {
    const before = prior.get(item.key), after = candidates.get(item.row);
    const fields = item.fields.map((name) => {
      const privateName = name.startsWith('privateFields.') ? name.slice('privateFields.'.length) : null;
      const oldValue = privateName ? before.privateFields[privateName] : before[name];
      const newValue = privateName ? after.privateFields[privateName] : after[name];
      return { name, before: oldValue ?? null, after: newValue ?? null };
    });
    return { row: item.row, fields };
  });
}
function prepareDraftImport(bytes, snapshot) {
  const preview = previewBirdExport(bytes);
  const plan = planBirdReconciliation(snapshot, preview);
  const digest = fingerprintDraft(bytes, snapshot, plan);
  return { preview, plan, revision: snapshot.revision, digest };
}
function validSelection(selected) {
  return Array.isArray(selected) && selected.length > 0 && selected.length <= 1000
    && selected.every((row) => Number.isSafeInteger(row) && row >= 2) && new Set(selected).size === selected.length;
}
function sameDigest(a, b) {
  return typeof a === 'string' && /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
function buildSnapshot(snapshot, prepared, selected) {
  const byRow = new Map(prepared.preview.candidates.map((row) => [row.row, row]));
  const planned = new Map(prepared.plan.items.map((item) => [item.row, item]));
  const records = new Map(snapshot.records.map((record) => [record.provisionalKey, record]));
  for (const number of selected) {
    const item = planned.get(number), row = byRow.get(number);
    if (!row || !item || !['add', 'change'].includes(item.action)) throw new Error('invalid_bird_selection');
    const prior = records.get(row.provisionalKey);
    records.set(row.provisionalKey, { ...row, privateFields: { ...(prior?.privateFields || {}), ...row.privateFields },
      publication: 'draft', identity: 'provisional' });
  }
  return { version: 1, revision: snapshot.revision + 1, records: [...records.values()] };
}
async function applyDraftImport(store, bytes, request) {
  if (!request || !Number.isSafeInteger(request.revision) || request.revision < 0 || !validSelection(request.selectedRows)) throw new Error('invalid_bird_selection');
  const current = await store.read();
  if (current.snapshot.revision !== request.revision) throw new Error('bird_snapshot_conflict');
  const prepared = prepareDraftImport(bytes, current.snapshot);
  if (!sameDigest(request.digest, prepared.digest)) throw new Error('bird_snapshot_conflict');
  const next = buildSnapshot(current.snapshot, prepared, request.selectedRows);
  const saved = await store.write(next, { revision: current.snapshot.revision, etag: current.etag });
  return { revision: saved.revision, imported: request.selectedRows.length, publication: 'draft' };
}
module.exports = { prepareDraftImport, applyDraftImport, fingerprintDraft, changeDetails };
