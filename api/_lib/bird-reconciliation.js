'use strict';
const FIELDS = ['submissionId', 'commonName', 'scientificName', 'observedOn', 'count', 'countKind'];
const HASH = /^[a-f0-9]{64}$/;
function validCount(value) {
  return ['exact', 'presence', 'unknown'].includes(value.countKind)
    && (value.countKind === 'exact' ? Number.isSafeInteger(value.count) && value.count > 0 : value.count === null);
}
function validRecord(value) {
  return value && typeof value === 'object' && typeof value.provisionalKey === 'string' && HASH.test(value.provisionalKey)
    && typeof value.submissionId === 'string' && typeof value.commonName === 'string' && typeof value.scientificName === 'string'
    && typeof value.observedOn === 'string' && validCount(value)
    && value.privateFields && typeof value.privateFields === 'object' && !Array.isArray(value.privateFields)
    && Object.values(value.privateFields).every((field) => typeof field === 'string');
}
function changes(previous, incoming) {
  const fields = FIELDS.filter((field) => previous[field] !== incoming[field]);
  // Omitted optional columns mean unknown, not an instruction to erase data.
  for (const [name, value] of Object.entries(incoming.privateFields)) {
    if (previous.privateFields[name] !== value) fields.push(`privateFields.${name}`);
  }
  return fields;
}
function indexRecords(records) {
  const index = new Map();
  for (const record of records) {
    if (!validRecord(record) || index.has(record.provisionalKey)) throw new Error('invalid_bird_snapshot');
    index.set(record.provisionalKey, record);
  }
  return index;
}
function planBirdReconciliation(snapshot, preview) {
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.records) || snapshot.records.length > 100000
    || preview?.version !== 1 || !Array.isArray(preview.candidates) || preview.candidates.length > 100000
    || !Array.isArray(preview.rejected) || preview.rejected.length > 100000) throw new Error('invalid_bird_snapshot');
  const existing = indexRecords(snapshot.records); const incomingCounts = new Map();
  for (const row of preview.candidates) {
    if (!validRecord(row)) throw new Error('invalid_bird_snapshot');
    incomingCounts.set(row.provisionalKey, (incomingCounts.get(row.provisionalKey) || 0) + 1);
  }
  const items = preview.candidates.map((row) => {
    const prior = existing.get(row.provisionalKey);
    if (row.identity === 'ambiguous' || incomingCounts.get(row.provisionalKey) > 1) return { row: row.row, key: row.provisionalKey, action: 'ambiguous', fields: [] };
    if (!prior) return { row: row.row, key: row.provisionalKey, action: 'add', fields: [] };
    const fields = changes(prior, row);
    return { row: row.row, key: row.provisionalKey, action: fields.length ? 'change' : 'unchanged', fields };
  });
  const counts = { add: 0, change: 0, unchanged: 0, ambiguous: 0, rejected: preview.rejected.length };
  for (const item of items) counts[item.action]++;
  return { version: 1, items, counts, missingExisting: snapshot.records.filter((row) => !incomingCounts.has(row.provisionalKey)).length,
    deletion: 'none', identity: 'provisional', requiresReview: true, writes: false };
}
module.exports = { planBirdReconciliation };
