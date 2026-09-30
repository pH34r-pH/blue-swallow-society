import { IngestError } from './auth.mjs';

export function entityError(code, statusCode = 400) {
  return new IngestError(code, code, { statusCode });
}
export function requireEntity(condition, code = 'invalid_entity_request', status = 400) {
  if (!condition) throw entityError(code, status);
}
export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function fields(value, allowed, required = []) {
  requireEntity(object(value) && Object.keys(value).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key)));
}
export function uuid(value) {
  requireEntity(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value));
  return value;
}
export function boundedText(value, max = 200, empty = false) {
  requireEntity(typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0)
    && !/[\u0000-\u001f\u007f]/.test(value));
  return value;
}
export function ids(value, max = 100) {
  requireEntity(Array.isArray(value) && value.length <= max && new Set(value).size === value.length);
  return value.map(uuid).sort();
}
export function revision(value) {
  requireEntity(Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER);
  return value;
}
const common = ['action', 'entity_id', 'expected_revisions', 'idempotency_key', 'reason', 'evidence_ids'];
const actionFields = {
  create: ['device_ids', 'label'], label: ['label', 'labels'],
  membership: ['add', 'remove'], reject: ['device_ids'],
  split: ['new_entity_id', 'device_ids'], merge: ['source_entity_id'], undo: ['assertion_id'],
};
export function validateCommand(input) {
  requireEntity(object(input) && Object.hasOwn(actionFields, input.action));
  fields(input, [...common, ...actionFields[input.action]], common);
  const c = structuredClone(input);
  uuid(c.entity_id);
  boundedText(c.idempotency_key, 128);
  boundedText(c.reason, 1000);
  c.evidence_ids = ids(c.evidence_ids, 200);
  requireEntity(object(c.expected_revisions));
  const expected = Object.entries(c.expected_revisions);
  requireEntity(expected.length >= 1 && expected.length <= 2);
  expected.forEach(([id, rev]) => { uuid(id); revision(rev); });
  requireEntity(Object.hasOwn(c.expected_revisions, c.entity_id));
  if (c.action === 'create') {
    c.device_ids = ids(c.device_ids);
    c.label = c.label === null || c.label === undefined ? null : boundedText(c.label);
    requireEntity(c.expected_revisions[c.entity_id] === 0);
  }
  if (c.action === 'label') {
    requireEntity(Object.hasOwn(c, 'label') && Array.isArray(c.labels) && c.labels.length <= 20);
    if (c.label !== null) boundedText(c.label);
    c.labels.forEach((label) => boundedText(label, 80));
    requireEntity(new Set(c.labels).size === c.labels.length);
    c.labels.sort();
  }
  if (c.action === 'membership') {
    c.add = ids(c.add); c.remove = ids(c.remove);
    requireEntity(c.add.length + c.remove.length > 0 && !c.add.some((id) => c.remove.includes(id)));
  }
  if (c.action === 'reject' || c.action === 'split') {
    c.device_ids = ids(c.device_ids);
    requireEntity(c.device_ids.length > 0);
  }
  if (c.action === 'split') {
    uuid(c.new_entity_id);
    requireEntity(c.new_entity_id !== c.entity_id && c.expected_revisions[c.new_entity_id] === 0);
  }
  if (c.action === 'merge') {
    uuid(c.source_entity_id);
    requireEntity(c.source_entity_id !== c.entity_id && Object.hasOwn(c.expected_revisions, c.source_entity_id));
  }
  if (c.action === 'undo') uuid(c.assertion_id);
  if (!['undo', 'merge', 'split'].includes(c.action)) requireEntity(expected.length === 1);
  if (['merge', 'split'].includes(c.action)) requireEntity(expected.length === 2);
  return c;
}
export function validateList(input = {}) {
  fields(input, ['search', 'device_id', 'modality', 'since', 'until', 'min_confidence', 'review_state', 'sort', 'direction', 'limit', 'offset']);
  const q = { ...input, limit: input.limit ?? 25, offset: input.offset ?? 0, sort: input.sort ?? 'updated_at', direction: input.direction ?? 'desc' };
  requireEntity(Number.isInteger(q.limit) && q.limit >= 1 && q.limit <= 100);
  requireEntity(Number.isInteger(q.offset) && q.offset >= 0 && q.offset <= 10000);
  requireEntity(['updated_at', 'first_seen_at', 'last_seen_at', 'confidence', 'label'].includes(q.sort));
  requireEntity(['asc', 'desc'].includes(q.direction));
  if (q.search !== undefined) boundedText(q.search, 200);
  if (q.device_id !== undefined) uuid(q.device_id);
  if (q.modality !== undefined) requireEntity(['wifi_ap', 'ble_device', 'cell_signal'].includes(q.modality));
  if (q.review_state !== undefined) requireEntity(['unreviewed', 'reviewed', 'needs_review', 'retired'].includes(q.review_state));
  if (q.min_confidence !== undefined) requireEntity(typeof q.min_confidence === 'number' && Number.isFinite(q.min_confidence) && q.min_confidence >= 0 && q.min_confidence <= 1);
  for (const field of ['since', 'until']) if (q[field] !== undefined) {
    requireEntity(typeof q[field] === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(q[field]) && Number.isFinite(Date.parse(q[field])));
  }
  if (q.since && q.until) requireEntity(Date.parse(q.since) <= Date.parse(q.until));
  return q;
}
export function validateDetail(input) {
  fields(input, ['entity_id', 'limit', 'history_offset', 'evidence_offset', 'hypothesis_offset'], ['entity_id']);
  uuid(input.entity_id);
  const q = { limit: 25, history_offset: 0, evidence_offset: 0, hypothesis_offset: 0, ...input };
  for (const field of ['history_offset', 'evidence_offset', 'hypothesis_offset']) requireEntity(Number.isInteger(q[field]) && q[field] >= 0 && q[field] <= 10000);
  requireEntity(Number.isInteger(q.limit) && q.limit >= 1 && q.limit <= 100);
  return q;
}
export function validateHypothesis(input) {
  const keys = ['entity_id', 'expected_revision', 'version', 'device_ids', 'evidence_ids', 'confidence', 'algorithm'];
  fields(input, keys, keys);
  uuid(input.entity_id); revision(input.expected_revision); boundedText(input.version, 128); boundedText(input.algorithm, 200);
  requireEntity(input.confidence === null || (typeof input.confidence === 'number' && Number.isFinite(input.confidence) && input.confidence >= 0 && input.confidence <= 1));
  return { ...input, device_ids: ids(input.device_ids), evidence_ids: ids(input.evidence_ids, 200) };
}
