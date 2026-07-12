import { createHash } from 'node:crypto';

const BATCH_FIELDS = new Set([
  'schema_version',
  'idempotency_key',
  'device_id',
  'session_id',
  'client_clock',
  'redaction_class',
  'retention_class',
  'observations',
]);
const OBSERVATION_FIELDS = new Set([
  'external_observation_key',
  'kind',
  'observed_at',
  'location',
  'confidence',
  'payload',
  'provenance',
]);
const LOCATION_FIELDS = new Set(['latitude', 'longitude', 'accuracy_m', 'altitude_m']);
const OBSERVATION_KINDS = new Set(['wifi_ap', 'ble_device', 'cell_signal']);
const REDACTION_CLASSES = new Set(['redacted', 'hashed', 'observed']);
const RETENTION_CLASSES = new Set(['summary_only', 'hash_only', 'full_fidelity']);
const RFC3339_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OBSERVATIONS = 256;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export class ContractError extends Error {
  constructor(code, message = code, { statusCode = 422, path = '' } = {}) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
    this.statusCode = statusCode;
    this.path = path;
  }
}

export function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

export function hashCanonicalJson(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

export function hashPersistedObservation(batch, observation) {
  return hashCanonicalJson({
    session_id: batch.session_id ?? null,
    redaction_class: batch.redaction_class,
    retention_class: batch.retention_class,
    observation,
  });
}

export function validateObservationBatch(input, { now = Date.now() } = {}) {
  requireObject(input, '$');
  rejectUnknownFields(input, BATCH_FIELDS, '$');
  requireExactString(input.schema_version, 'bss.observation_batch.v1', '$.schema_version');
  requireBoundedString(input.idempotency_key, '$.idempotency_key', 8, 200);
  requireBoundedString(input.device_id, '$.device_id', 3, 160);
  if (input.session_id !== null && input.session_id !== undefined) {
    requireUuid(input.session_id, '$.session_id');
  }
  requireTimestamp(input.client_clock, '$.client_clock');
  requireMember(input.redaction_class, REDACTION_CLASSES, '$.redaction_class');
  requireMember(input.retention_class, RETENTION_CLASSES, '$.retention_class');
  if (!Array.isArray(input.observations) || input.observations.length === 0) {
    throw new ContractError('observations_required', 'At least one observation is required.', { path: '$.observations' });
  }
  if (input.observations.length > MAX_OBSERVATIONS) {
    throw new ContractError('batch_too_large', `At most ${MAX_OBSERVATIONS} observations are allowed.`, { statusCode: 413, path: '$.observations' });
  }

  const keys = new Set();
  const observations = input.observations.map((observation, index) => {
    const normalized = validateObservation(observation, index, now);
    if (keys.has(normalized.external_observation_key)) {
      throw new ContractError('duplicate_observation_key', 'Observation keys must be unique within a batch.', {
        path: `$.observations[${index}].external_observation_key`,
      });
    }
    keys.add(normalized.external_observation_key);
    return normalized;
  });

  return deepFreeze({
    schema_version: input.schema_version,
    idempotency_key: input.idempotency_key.trim(),
    device_id: input.device_id.trim(),
    session_id: input.session_id == null ? null : input.session_id.trim(),
    client_clock: new Date(input.client_clock).toISOString(),
    redaction_class: input.redaction_class,
    retention_class: input.retention_class,
    observations,
  });
}

function validateObservation(input, index, now) {
  const path = `$.observations[${index}]`;
  requireObject(input, path);
  rejectUnknownFields(input, OBSERVATION_FIELDS, path);
  requireBoundedString(input.external_observation_key, `${path}.external_observation_key`, 3, 240);
  requireMember(input.kind, OBSERVATION_KINDS, `${path}.kind`);
  const observedAt = requireTimestamp(input.observed_at, `${path}.observed_at`);
  if (observedAt > now + FUTURE_SKEW_MS) {
    throw new ContractError('future_observation', 'Observation timestamp exceeds the allowed clock skew.', { path: `${path}.observed_at` });
  }
  requireObject(input.location, `${path}.location`);
  rejectUnknownFields(input.location, LOCATION_FIELDS, `${path}.location`);
  const latitude = requireFiniteNumber(input.location.latitude, `${path}.location.latitude`, -90, 90);
  const longitude = requireFiniteNumber(input.location.longitude, `${path}.location.longitude`, -180, 180);
  const accuracy = requireFiniteNumber(input.location.accuracy_m, `${path}.location.accuracy_m`, 0, Number.MAX_SAFE_INTEGER);
  const altitude = input.location.altitude_m == null
    ? undefined
    : requireFiniteNumber(input.location.altitude_m, `${path}.location.altitude_m`, -20_000, 100_000);
  const confidence = requireFiniteNumber(input.confidence, `${path}.confidence`, 0, 1);
  requireObject(input.payload, `${path}.payload`);
  requireObject(input.provenance, `${path}.provenance`);
  assertJsonValue(input.payload, `${path}.payload`);
  assertJsonValue(input.provenance, `${path}.provenance`);

  return deepFreeze({
    external_observation_key: input.external_observation_key.trim(),
    kind: input.kind,
    observed_at: new Date(input.observed_at).toISOString(),
    location: {
      latitude,
      longitude,
      accuracy_m: accuracy,
      ...(altitude === undefined ? {} : { altitude_m: altitude }),
    },
    confidence,
    payload: structuredClone(input.payload),
    provenance: structuredClone(input.provenance),
  });
}

function rejectUnknownFields(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ContractError('unknown_field', `Unknown field: ${path}.${key}`, { path: `${path}.${key}` });
    }
  }
}

function assertJsonValue(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ContractError('invalid_json_number', 'JSON numbers must be finite.', { path });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    Object.entries(value).forEach(([key, child]) => assertJsonValue(child, `${path}.${key}`));
    return;
  }
  throw new ContractError('invalid_json_value', 'Payload and provenance must contain JSON values only.', { path });
}

function requireObject(value, path) {
  if (!isPlainObject(value)) throw new ContractError('object_required', `Object required at ${path}.`, { path });
}

function requireExactString(value, expected, path) {
  if (value !== expected) throw new ContractError('unsupported_schema_version', `Expected ${expected}.`, { path });
}

function requireBoundedString(value, path, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new ContractError('invalid_string', `String length at ${path} must be between ${min} and ${max}.`, { path });
  }
  return value.trim();
}

function requireTimestamp(value, path) {
  if (typeof value !== 'string' || !RFC3339_TIMESTAMP.test(value)) {
    throw new ContractError('invalid_timestamp', 'Timezone-qualified RFC3339 timestamp required.', { path });
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ContractError('invalid_timestamp', 'Timezone-qualified RFC3339 timestamp required.', { path });
  return parsed;
}

function requireUuid(value, path) {
  if (typeof value !== 'string' || !UUID.test(value.trim())) {
    throw new ContractError('invalid_uuid', `UUID required at ${path}.`, { path });
  }
  return value.trim();
}

function requireMember(value, allowed, path) {
  if (!allowed.has(value)) throw new ContractError('invalid_enum', `Invalid value at ${path}.`, { path });
  return value;
}

function requireFiniteNumber(value, path, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ContractError('invalid_number', `Finite number at ${path} must be between ${min} and ${max}.`, { path });
  }
  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
