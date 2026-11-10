'use strict';
const { createHash } = require('node:crypto');
const { parse } = require('csv-parse/sync');
const MAX_BYTES = 10 * 1024 * 1024, MAX_ROWS = 100000;
const REQUIRED = ['Submission ID', 'Common Name', 'Scientific Name', 'Count', 'Date'];
const OPTIONAL = ['Time', 'Location', 'Latitude', 'Longitude', 'State/Province', 'Country', 'Checklist Comments', 'Species Comments'];
function fail(code) { throw new Error(code); }
function day(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString().slice(0, 10) === value;
}
function count(value) {
  if (value === 'X') return { count: null, countKind: 'presence' };
  if (!value) return { count: null, countKind: 'unknown' };
  if (!/^[1-9]\d{0,8}$/.test(value)) return null;
  return { count: Number(value), countKind: 'exact' };
}
function columns(header) {
  if (!header || header.length > 128 || header.some((name) => !name || name.length > 128)
    || new Set(header).size !== header.length || !REQUIRED.every((name) => header.includes(name))) fail('unsupported_export');
  return Object.fromEntries([...REQUIRED, ...OPTIONAL].filter((name) => header.includes(name)).map((name) => [name, header.indexOf(name)]));
}
function candidate(row, index, mapping) {
  const get = (name) => mapping[name] === undefined ? '' : row[mapping[name]];
  const submissionId = get('Submission ID').trim(), commonName = get('Common Name').trim();
  const scientificName = get('Scientific Name').trim(), observedOn = get('Date').trim();
  const abundance = count(get('Count').trim());
  if (!/^S\d{1,20}$/i.test(submissionId) || !commonName || commonName.length > 120
    || !scientificName || scientificName.length > 160 || !day(observedOn) || !abundance) return { row: index, reason: 'invalid_required_value' };
  const provisionalKey = createHash('sha256').update(`${submissionId.toUpperCase()}\0${scientificName.toLowerCase()}`).digest('hex');
  return { row: index, provisionalKey, submissionId, commonName, scientificName, observedOn, ...abundance,
    privateFields: Object.fromEntries(OPTIONAL.filter((name) => mapping[name] !== undefined).map((name) => [name, get(name)])),
    publication: 'draft', identity: 'provisional' };
}
function decode(input) {
  if (!(input instanceof Uint8Array) || input.byteLength === 0 || input.byteLength > MAX_BYTES) fail('invalid_export_size');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(input); } catch { fail('invalid_export_encoding'); }
}
function previewBirdExport(input) {
  const source = decode(input); let rows;
  try { rows = parse(source, { bom: true, skip_empty_lines: true, max_record_size: 65536, to: MAX_ROWS + 2 }); }
  catch { fail('invalid_export_csv'); }
  if (rows.length > MAX_ROWS + 1) fail('invalid_export_size');
  const mapping = columns(rows.shift()); const candidates = [], rejected = [];
  for (const [index, row] of rows.entries()) {
    const record = candidate(row, index + 2, mapping);
    if (record.reason) rejected.push(record); else candidates.push(record);
  }
  const counts = new Map();
  for (const record of candidates) counts.set(record.provisionalKey, (counts.get(record.provisionalKey) || 0) + 1);
  for (const record of candidates) if (counts.get(record.provisionalKey) > 1) record.identity = 'ambiguous';
  return { version: 1, format: 'ebird-personal-csv-candidate', source: 'eBird', candidates, rejected,
    summary: { rows: rows.length, candidates: candidates.length, rejected: rejected.length,
      ambiguous: candidates.filter((record) => record.identity === 'ambiguous').length },
    coverage: 'unverified-export-format', publishes: false };
}
module.exports = { previewBirdExport };
