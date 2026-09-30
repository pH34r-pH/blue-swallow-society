import { createHash } from 'node:crypto';
import { IngestError } from './auth.mjs';
const FIELDS = new Set(['from', 'to', 'deviceId', 'sessionId', 'kind', 'limit', 'cursor', 'selectedId']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/;
const WINDOW = 31 * 86400000;
export const HISTORY_KINDS = Object.freeze(['wifi_ap', 'ble_device', 'cell_signal']);
export const HISTORY_SOURCES = Object.freeze(['owned_device', 'local_observation', 'green_owned']);
function invalid() { throw new IngestError('invalid_history', 'Invalid history filters or cursor.', { statusCode: 400 }); }
function timestamp(value) {
  if (typeof value !== 'string' || !STAMP.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) invalid();
  return value;
}
function uuid(value) { if (typeof value !== 'string' || !UUID.test(value)) invalid(); return value; }
function optional(value, parse) { return value === undefined || value === null || value === '' ? null : parse(value); }
function device(value) { if (typeof value !== 'string' || (!value.trim() || value.length > 128 || /[\x00-\x1f\x7f]/.test(value))) invalid(); return value; }
function fingerprint(query) {
  return createHash('sha256').update(JSON.stringify([query.from, query.to, query.deviceId, query.sessionId, query.kind, query.limit])).digest('hex');
}
function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !FIELDS.has(key))) invalid();
}
export function parseHistoryQuery(body, now = Date.now()) {
  validateBody(body);
  const to = timestamp(body.to ?? new Date(now).toISOString());
  const from = timestamp(body.from ?? new Date(Date.parse(to) - WINDOW).toISOString());
  if (Date.parse(from) >= Date.parse(to) || Date.parse(to) - Date.parse(from) > WINDOW) invalid();
  const limit = body.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) invalid();
  const kind = optional(body.kind, (value) => { if (!HISTORY_KINDS.includes(value)) invalid(); return value; });
  const query = { from, to, limit, kind, deviceId: optional(body.deviceId, device),
    sessionId: optional(body.sessionId, uuid), selectedId: optional(body.selectedId, uuid),
    cutoff: new Date(now).toISOString(), retrievedAt: new Date(now).toISOString(), after: null };
  if (body.cursor !== undefined && body.cursor !== null) applyCursor(query, body.cursor, now);
  return query;
}
function applyCursor(query, value, now) {
  try {
    if (typeof value !== 'string' || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) invalid();
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (cursor.v !== 1 || cursor.filter !== fingerprint(query)) invalid();
    const cutoff = timestamp(cursor.cutoff);
    const at = timestamp(cursor.at);
    if (Date.parse(cutoff) > now || Date.parse(at) < Date.parse(query.from) || Date.parse(at) >= Date.parse(query.to)) invalid();
    query.cutoff = cutoff;
    query.after = { at, id: uuid(cursor.id) };
  } catch { invalid(); }
}
export function historyCursor(query, row) {
  return Buffer.from(JSON.stringify({ v: 1, filter: fingerprint(query), cutoff: query.cutoff, at: row.observed_at, id: row.id })).toString('base64url');
}
export async function readHistory(body, { store, now = Date.now }) {
  const query = parseHistoryQuery(body, now());
  if (typeof store?.queryHistory !== 'function') throw new IngestError('history_unavailable', 'Observation history is unavailable.', { statusCode: 503 });
  return store.queryHistory(query);
}
