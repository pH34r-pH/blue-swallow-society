import { createHash } from 'node:crypto';
import { createDefaultPool, loadDatabaseConfig } from './db.mjs';
import { SOURCE_CLASSES, identityHasAnyScope } from './source-registry.mjs';
import { materializeObservationEntities } from './entity-derivation.mjs';

export const OBSERVATION_KINDS = Object.freeze([
  'wifi_ap',
  'ble_device',
  'cell_signal',
  'visual_summary',
  'greenfeed_snapshot',
  'claim_anchor',
  'memory_event',
  'derived_cell',
]);

export const RETENTION_CLASSES = Object.freeze([
  'summary_only',
  'hash_only',
  'operator_artifact',
  'raw_frame_explicit',
  'pii_explicit',
]);

export const PII_STATUSES = Object.freeze([
  'none',
  'redacted',
  'hashed',
  'operator_explicit',
]);

const DEFAULT_OBSERVATION_BATCH_MAX_ITEMS = 100;
const DEFAULT_OBSERVATION_PAYLOAD_LIMIT_BYTES = 16 * 1024;
const WARDRIVER_BATCH_CONTRACT_VERSION = 'bss.wardriver.batch.v1';
const SUPPORTED_CONTRACT_VERSIONS = new Set([WARDRIVER_BATCH_CONTRACT_VERSION]);
const MAX_BATCH_CONTEXT_BYTES = 4 * 1024;
const MAX_CONTRACT_VERSION_BYTES = 128;
const MAX_IDEMPOTENCY_KEY_BYTES = 256;
const MAX_CLIENT_ID_BYTES = 128;
const MAX_SOURCE_ID_BYTES = 128;
const MAX_EXTERNAL_KEY_BYTES = 512;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GREEN_SOURCE_CLASSES = new Set(['green_public', 'green_owned', 'green_authorized']);
const LOCAL_OR_OWNED_SOURCE_CLASSES = new Set(['owned_device', 'local_observation']);
const RESTRICTED_SOURCE_CLASSES = new Set(['grey_enrichment', 'orange_exposure', 'red_restricted']);
const RAW_RETENTION_SCOPES = Object.freeze(['observations:raw-retention']);
const UNSAFE_PRODUCT_ENTITY_KINDS = new Set([
  'private-person',
  'private_person',
  'face',
  'license-plate',
  'license_plate',
  'private-residence',
  'private_residence',
]);
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'raw-frame',
  'raw-frames',
  'raw-image',
  'raw-images',
  'raw-pii',
  'pii',
  'face-image',
  'face-images',
  'license-plate-image',
  'license-plate-images',
  'license-plate',
  'license-plates',
  'plate',
  'ssid',
  'bssid',
  'mac',
  'mac-address',
  'email',
  'email-address',
  'phone',
  'phone-number',
  'private-person',
  'private-residence',
]);

function errorResult(statusCode, code, message) {
  return {
    ok: false,
    statusCode,
    body: {
      ok: false,
      error: { code, message },
    },
  };
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function byteLength(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8');
}

function jsonByteLength(value) {
  return Buffer.byteLength(JSON.stringify(value ?? {}), 'utf8');
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableJsonValue(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
  }
  return value;
}

function sha256Json(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableJsonValue(value ?? null)), 'utf8').digest('hex')}`;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isoString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasMeaningfulProvenance(value) {
  return isPlainObject(value) && Object.keys(value).length > 0;
}

function normalizeString(value, fieldName, { required = false, maxBytes = 512 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${fieldName} is required`);
    return null;
  }
  const normalized = String(value).trim();
  if (!normalized) {
    if (required) throw new Error(`${fieldName} is required`);
    return null;
  }
  if (byteLength(normalized) > maxBytes) throw new Error(`${fieldName} is too long`);
  return normalized;
}

function normalizeSourceId(value, fieldName = 'source_id') {
  const sourceId = normalizeString(value, fieldName, { required: true, maxBytes: MAX_SOURCE_ID_BYTES });
  if (!UUIDISH.test(sourceId)) throw new Error(`${fieldName} must be a UUID`);
  return sourceId.toLowerCase();
}

function normalizeUuidString(value, fieldName, { required = false } = {}) {
  const normalized = normalizeString(value, fieldName, { required, maxBytes: 128 });
  if (!normalized) return null;
  if (!UUIDISH.test(normalized)) throw new Error(`${fieldName} must be a UUID`);
  return normalized.toLowerCase();
}

function normalizeSourceClass(value) {
  const sourceClass = normalizeString(value, 'source_class', { required: true, maxBytes: 64 })?.toLowerCase();
  if (!SOURCE_CLASSES.includes(sourceClass)) throw new Error(`source_class must be one of: ${SOURCE_CLASSES.join(', ')}`);
  return sourceClass;
}

function normalizeKind(value) {
  const kind = normalizeString(value, 'kind', { required: true, maxBytes: 64 })?.toLowerCase();
  if (!OBSERVATION_KINDS.includes(kind)) throw new Error(`kind must be one of: ${OBSERVATION_KINDS.join(', ')}`);
  return kind;
}

function normalizeEnum(value, fieldName, allowed, fallback) {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  const normalized = normalizeString(raw, fieldName, { required: true, maxBytes: 64 })?.toLowerCase();
  if (!allowed.includes(normalized)) throw new Error(`${fieldName} must be one of: ${allowed.join(', ')}`);
  return normalized;
}

function normalizeCoordinate(value, fieldName, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  return number;
}

function normalizeConfidence(value) {
  if (value === undefined || value === null || value === '') return 1;
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('confidence must be between 0 and 1');
  }
  return Number(confidence.toFixed(3));
}

function normalizeObservedAt(value, now) {
  if (!value) throw new Error('observed_at is required');
  const observedAt = new Date(value);
  if (Number.isNaN(observedAt.getTime())) throw new Error('observed_at must be a valid ISO timestamp');
  if (observedAt.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) {
    throw new Error('observed_at cannot be more than 5 minutes in the future');
  }
  return observedAt.toISOString();
}

function normalizeGeohash(lat, lon, precision) {
  let evenBit = true;
  let bit = 0;
  let character = 0;
  let geohash = '';
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const midpoint = (lonMin + lonMax) / 2;
      if (lon >= midpoint) {
        character = (character << 1) + 1;
        lonMin = midpoint;
      } else {
        character <<= 1;
        lonMax = midpoint;
      }
    } else {
      const midpoint = (latMin + latMax) / 2;
      if (lat >= midpoint) {
        character = (character << 1) + 1;
        latMin = midpoint;
      } else {
        character <<= 1;
        latMax = midpoint;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      geohash += GEOHASH_ALPHABET[character];
      bit = 0;
      character = 0;
    }
  }

  return geohash;
}

export function computeObservationCells({ lat, lon }) {
  return {
    h3_7: `gh7:${normalizeGeohash(lat, lon, 7)}`,
    h3_9: `gh9:${normalizeGeohash(lat, lon, 9)}`,
    h3_11: `gh11:${normalizeGeohash(lat, lon, 11)}`,
  };
}

function normalizeUnsafeToken(value) {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isProductEntityKey(key) {
  return ['product-entity', 'product-entities', 'entities'].includes(normalizeUnsafeToken(key));
}

function findUnsafeProductEntity(value, inProductEntityContext = false, depth = 0) {
  if (value === null || value === undefined || depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUnsafeProductEntity(item, inProductEntityContext, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') {
    const token = normalizeUnsafeToken(value);
    return inProductEntityContext && UNSAFE_PRODUCT_ENTITY_KINDS.has(token) ? token : null;
  }

  const object = value;
  const context = inProductEntityContext || Object.keys(object).some((key) => isProductEntityKey(key));

  if (context) {
    for (const key of ['kind', 'type', 'entity_kind', 'entityKind', 'category', 'label', 'labels', 'product_entity', 'productEntity']) {
      const candidate = object[key];
      const values = Array.isArray(candidate) ? candidate : [candidate];
      for (const item of values) {
        const token = normalizeUnsafeToken(item);
        if (UNSAFE_PRODUCT_ENTITY_KINDS.has(token)) return token;
      }
    }
  }

  for (const [key, child] of Object.entries(object)) {
    const childContext = context || isProductEntityKey(key);
    const found = findUnsafeProductEntity(child, childContext, depth + 1);
    if (found) return found;
  }
  return null;
}

function findForbiddenPayloadKey(value, depth = 0) {
  if (value === null || value === undefined || depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenPayloadKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeUnsafeToken(key);
    if (FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey)) return normalizedKey;
    const found = findForbiddenPayloadKey(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizeContractVersion(value) {
  const contractVersion = normalizeString(value, 'contract_version', { maxBytes: MAX_CONTRACT_VERSION_BYTES });
  if (!contractVersion) return null;
  if (!SUPPORTED_CONTRACT_VERSIONS.has(contractVersion)) {
    const error = new Error(`unsupported contract_version: ${contractVersion}`);
    error.statusCode = 400;
    error.code = 'unsupported_contract_version';
    throw error;
  }
  return contractVersion;
}

function normalizeBatchContext(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    const error = new Error('context must be an object');
    error.statusCode = 400;
    error.code = 'invalid_context';
    throw error;
  }
  if (jsonByteLength(value) > MAX_BATCH_CONTEXT_BYTES) {
    const error = new Error('context exceeds configured byte limit');
    error.statusCode = 413;
    error.code = 'context_too_large';
    throw error;
  }
  const forbiddenContextKey = findForbiddenPayloadKey(value);
  if (forbiddenContextKey) {
    const error = new Error(`context includes forbidden raw/PII key: ${forbiddenContextKey}`);
    error.statusCode = 422;
    error.code = 'unsafe_context';
    throw error;
  }
  return value;
}

function trustedTriggerSourceClass(value) {
  const sourceClass = normalizeUnsafeToken(value).replace(/-/g, '_');
  return LOCAL_OR_OWNED_SOURCE_CLASSES.has(sourceClass) || GREEN_SOURCE_CLASSES.has(sourceClass);
}

function normalizeTrustedTriggerReference(trigger) {
  if (!isPlainObject(trigger)) return false;
  if (!trustedTriggerSourceClass(trigger.source_class || trigger.sourceClass)) return null;
  const triggerObservationId = normalizeUuidString(trigger.observation_id || trigger.observationId, 'trigger.observation_id');
  const sessionId = normalizeUuidString(trigger.session_id || trigger.sessionId, 'trigger.session_id');
  const authorizedScopeRef = normalizeString(trigger.authorized_scope_ref || trigger.authorizedScopeRef, 'trigger.authorized_scope_ref', { maxBytes: 512 });
  if (!triggerObservationId && !sessionId && !authorizedScopeRef) return null;
  return { triggerObservationId, sessionId, authorizedScopeRef };
}

function findRestrictedSourceTrigger(batch, observation) {
  if (!RESTRICTED_SOURCE_CLASSES.has(observation.sourceClass)) return null;
  const provenanceItems = [batch.provenance, observation.provenance].filter(isPlainObject);
  for (const provenance of provenanceItems) {
    for (const key of ['trigger', 'authorized_trigger', 'authorizedTrigger', 'local_trigger', 'localTrigger']) {
      const rawTrigger = provenance[key];
      const triggers = Array.isArray(rawTrigger) ? rawTrigger : [rawTrigger];
      for (const trigger of triggers) {
        const trustedReference = normalizeTrustedTriggerReference(trigger);
        if (trustedReference) return trustedReference;
      }
    }
  }
  return null;
}

function usesExplicitRawRetention(retentionClass, piiStatus) {
  return retentionClass === 'raw_frame_explicit' || retentionClass === 'pii_explicit' || piiStatus === 'operator_explicit';
}

function normalizeObservation(rawObservation, batch, index, now, limits) {
  if (!isPlainObject(rawObservation)) throw new Error(`observations[${index}] must be an object`);
  const sourceId = rawObservation.source_id || rawObservation.sourceId
    ? normalizeSourceId(rawObservation.source_id || rawObservation.sourceId, `observations[${index}].source_id`)
    : batch.sourceId;
  const sourceClass = rawObservation.source_class || rawObservation.sourceClass
    ? normalizeSourceClass(rawObservation.source_class || rawObservation.sourceClass)
    : batch.sourceClass;

  if (sourceId !== batch.sourceId) throw new Error(`observations[${index}].source_id must match batch source_id`);
  if (sourceClass !== batch.sourceClass) throw new Error(`observations[${index}].source_class must match batch source_class`);

  const lat = normalizeCoordinate(rawObservation.lat ?? rawObservation.latitude, 'lat', -90, 90);
  const lon = normalizeCoordinate(rawObservation.lon ?? rawObservation.lng ?? rawObservation.longitude, 'lon', -180, 180);
  const payload = rawObservation.payload ?? {};
  if (!isPlainObject(payload)) throw new Error('payload must be an object');
  if (jsonByteLength(payload) > limits.observationPayloadLimitBytes) {
    const error = new Error('observation payload exceeds configured byte limit');
    error.statusCode = 413;
    error.code = 'observation_payload_too_large';
    throw error;
  }
  const forbiddenPayloadKey = findForbiddenPayloadKey(payload);
  if (forbiddenPayloadKey) {
    const error = new Error(`payload includes forbidden raw/PII key: ${forbiddenPayloadKey}`);
    error.statusCode = 422;
    error.code = 'unsafe_payload';
    throw error;
  }
  const unsafeProductEntity = findUnsafeProductEntity(payload);
  if (unsafeProductEntity) {
    const error = new Error(`payload includes forbidden product entity: ${unsafeProductEntity}`);
    error.statusCode = 422;
    error.code = 'unsafe_product_entity';
    throw error;
  }

  const provenance = rawObservation.provenance ?? {};
  if (!hasMeaningfulProvenance(provenance)) {
    const error = new Error(`observations[${index}].provenance is required`);
    error.statusCode = 400;
    error.code = 'invalid_provenance';
    throw error;
  }

  const retentionClass = normalizeEnum(rawObservation.retention_class ?? rawObservation.retentionClass, 'retention_class', RETENTION_CLASSES, 'summary_only');
  const piiStatus = normalizeEnum(rawObservation.pii_status ?? rawObservation.piiStatus, 'pii_status', PII_STATUSES, 'redacted');
  const rawPayloadRef = normalizeString(rawObservation.raw_payload_ref ?? rawObservation.rawPayloadRef, 'raw_payload_ref', { maxBytes: 512 });
  const operatorApprovedRawRef = normalizeString(rawObservation.operator_approved_raw_ref ?? rawObservation.operatorApprovedRawRef, 'operator_approved_raw_ref', { maxBytes: 512 });
  const authorizedScopeRef = normalizeString(rawObservation.authorized_scope_ref ?? rawObservation.authorizedScopeRef ?? batch.authorizedScopeRef, 'authorized_scope_ref', { maxBytes: 512 });
  const explicitRawRetention = usesExplicitRawRetention(retentionClass, piiStatus);
  if (explicitRawRetention) {
    if (!rawPayloadRef || !operatorApprovedRawRef || !authorizedScopeRef) {
      throw new Error('raw/PII explicit retention requires raw_payload_ref, operator_approved_raw_ref, and authorized_scope_ref');
    }
    if (!batch.rawRetentionApproved) {
      const error = new Error('raw/PII explicit retention requires an observations:raw-retention token scope.');
      error.statusCode = 403;
      error.code = 'raw_retention_forbidden';
      throw error;
    }
  }

  const normalized = {
    sourceId,
    sourceClass,
    sessionId: normalizeUuidString(rawObservation.session_id ?? rawObservation.sessionId ?? batch.sessionId, 'session_id'),
    triggerObservationId: normalizeUuidString(rawObservation.trigger_observation_id ?? rawObservation.triggerObservationId, 'trigger_observation_id'),
    authorizedScopeRef,
    kind: normalizeKind(rawObservation.kind),
    externalObservationKey: normalizeString(rawObservation.external_observation_key ?? rawObservation.externalObservationKey, 'external_observation_key', { maxBytes: MAX_EXTERNAL_KEY_BYTES }),
    idempotencyKey: normalizeString(rawObservation.idempotency_key ?? rawObservation.idempotencyKey ?? `${batch.idempotencyKey}:${index + 1}`, 'idempotency_key', { required: true, maxBytes: MAX_IDEMPOTENCY_KEY_BYTES }),
    observedAt: normalizeObservedAt(rawObservation.observed_at ?? rawObservation.observedAt, now),
    lat,
    lon,
    ...computeObservationCells({ lat, lon }),
    confidence: normalizeConfidence(rawObservation.confidence),
    piiStatus,
    retentionClass,
    rawPayloadRef,
    operatorApprovedRawRef,
    payload,
    provenance,
  };

  if (RESTRICTED_SOURCE_CLASSES.has(normalized.sourceClass)) {
    const triggerReference = findRestrictedSourceTrigger(batch, normalized);
    if (!triggerReference) {
      const error = new Error('grey/orange/red observations require local, owned, or authorized trigger metadata');
      error.statusCode = 422;
      error.code = 'source_policy_forbidden';
      throw error;
    }
    normalized.triggerObservationId ||= triggerReference.triggerObservationId;
    normalized.sessionId ||= triggerReference.sessionId;
    normalized.authorizedScopeRef ||= triggerReference.authorizedScopeRef;
    if (!normalized.triggerObservationId && !normalized.sessionId && !normalized.authorizedScopeRef) {
      const error = new Error('grey/orange/red observations require trigger metadata that maps to a persisted trigger_observation_id, session_id, or authorized_scope_ref');
      error.statusCode = 422;
      error.code = 'source_policy_forbidden';
      throw error;
    }
  }

  return normalized;
}

export function normalizeObservationBatch({ headers = {}, body, identity, now = new Date(), limits = {} } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const observationBatchMaxItems = positiveInteger(limits.observationBatchMaxItems, DEFAULT_OBSERVATION_BATCH_MAX_ITEMS);
  const observationPayloadLimitBytes = positiveInteger(limits.observationPayloadLimitBytes, DEFAULT_OBSERVATION_PAYLOAD_LIMIT_BYTES);

  const idempotencyKey = normalizeString(firstHeaderValue(headers['idempotency-key']), 'Idempotency-Key', {
    required: true,
    maxBytes: MAX_IDEMPOTENCY_KEY_BYTES,
  });
  if (!isPlainObject(body)) throw new Error('request body must be a JSON object');

  const sourceId = normalizeSourceId(body.source_id || body.sourceId);
  const sourceClass = normalizeSourceClass(body.source_class || body.sourceClass);
  const contractVersion = normalizeContractVersion(body.contract_version ?? body.contractVersion);
  const context = normalizeBatchContext(body.context ?? body.batch_context ?? body.batchContext);
  const reportedClientId = normalizeString(body.client_id || body.clientId, 'client_id', {
    maxBytes: MAX_CLIENT_ID_BYTES,
  });
  const clientId = normalizeString(identity?.tokenId, 'token_id', {
    required: true,
    maxBytes: MAX_CLIENT_ID_BYTES,
  });
  const sessionId = normalizeUuidString(body.session_id || body.sessionId, 'session_id');
  const authorizedScopeRef = normalizeString(body.authorized_scope_ref || body.authorizedScopeRef, 'authorized_scope_ref', { maxBytes: 512 });
  const provenance = body.provenance ?? {};
  if (!hasMeaningfulProvenance(provenance)) {
    const error = new Error('batch provenance is required');
    error.statusCode = 400;
    error.code = 'invalid_provenance';
    throw error;
  }

  const observations = Array.isArray(body.observations) ? body.observations : null;
  if (!observations) throw new Error('observations must be an array');
  if (observations.length === 0) {
    const error = new Error('observations must contain at least one item');
    error.statusCode = 400;
    error.code = 'empty_batch';
    throw error;
  }
  if (observations.length > observationBatchMaxItems) {
    const error = new Error('observation batch exceeds configured item limit');
    error.statusCode = 400;
    error.code = 'batch_too_large';
    throw error;
  }

  const batch = {
    idempotencyKey,
    sourceId,
    sourceClass,
    contractVersion,
    context,
    clientId,
    reportedClientId,
    sessionId,
    authorizedScopeRef,
    provenance,
    rawRetentionApproved: identityHasAnyScope(identity, RAW_RETENTION_SCOPES),
    now: nowDate,
    payloadHash: null,
    observations: [],
  };
  batch.observations = observations.map((observation, index) => normalizeObservation(observation, batch, index, nowDate, {
    observationPayloadLimitBytes,
  }));
  batch.payloadHash = sha256Json({
    source_id: batch.sourceId,
    source_class: batch.sourceClass,
    contract_version: batch.contractVersion,
    context: batch.context,
    session_id: batch.sessionId,
    authorized_scope_ref: batch.authorizedScopeRef,
    provenance: batch.provenance,
    observations: batch.observations,
  });

  return batch;
}

function extractReceiptFromBatchRow(row) {
  const metadata = row?.request_metadata || {};
  const receipt = metadata.receipt || metadata.sync_receipt;
  if (receipt) return receipt;
  return {
    batch_id: row.id,
    idempotency_key: row.idempotency_key,
    client_id: row.client_id,
    source_id: row.source_id,
    status: row.status,
    observation_count: row.observation_count || 0,
    observation_ids: [],
    payload_hash: row.payload_hash || null,
    received_at: isoString(row.received_at),
    completed_at: isoString(row.completed_at),
  };
}

function duplicateBatchResult(row, batch) {
  if (!row?.payload_hash || row.payload_hash !== batch.payloadHash) {
    return errorResult(409, 'idempotency_key_conflict', 'Idempotency-Key was already used for a different observation batch.');
  }
  return {
    statusCode: 200,
    body: {
      ok: true,
      duplicate: true,
      receipt: extractReceiptFromBatchRow(row),
    },
  };
}

function requestMetadataForBatch(batch) {
  return {
    request: {
      source_class: batch.sourceClass,
      observation_count: batch.observations.length,
      reported_client_id: batch.reportedClientId,
      ...(batch.contractVersion ? { contract_version: batch.contractVersion } : {}),
      ...(batch.context ? { context: batch.context } : {}),
    },
  };
}

export async function storeObservationBatch(pool, batch) {
  await pool.query('BEGIN');
  try {
    const batchRowResult = await pool.query(`
      INSERT INTO sync_batches (source_id, session_id, client_id, idempotency_key, request_metadata, provenance)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
      ON CONFLICT (source_id, client_id, idempotency_key) DO NOTHING
      RETURNING id, source_id, session_id, client_id, idempotency_key, status, observation_count,
                payload_hash, request_metadata, received_at, completed_at
    `, [
      batch.sourceId,
      batch.sessionId,
      batch.clientId,
      batch.idempotencyKey,
      JSON.stringify(requestMetadataForBatch(batch)),
      JSON.stringify(batch.provenance),
    ]);
    let batchRow = batchRowResult.rows[0];

    if (!batchRow) {
      const existing = await pool.query(`
        SELECT id, source_id, client_id, idempotency_key, status, observation_count, payload_hash,
               request_metadata, received_at, completed_at
        FROM sync_batches
        WHERE source_id = $1 AND client_id = $2 AND idempotency_key = $3
        LIMIT 1
        FOR UPDATE
      `, [batch.sourceId, batch.clientId, batch.idempotencyKey]);
      const result = duplicateBatchResult(existing.rows?.[0], batch);
      await pool.query('COMMIT');
      return result;
    }

    const observationIds = [];
    for (const observation of batch.observations) {
      const insertResult = await pool.query(`
        INSERT INTO observations (
          source_id, source_class, session_id, trigger_observation_id, authorized_scope_ref,
          kind, external_observation_key, idempotency_key, observed_at,
          geom, h3_7, h3_9, h3_11, confidence, pii_status, retention_class,
          raw_payload_ref, operator_approved_raw_ref, payload, provenance
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9::timestamptz,
          ST_SetSRID(ST_MakePoint($10, $11), 4326), $12, $13, $14, $15, $16, $17,
          $18, $19, $20::jsonb, $21::jsonb
        )
        RETURNING id
      `, [
        observation.sourceId,
        observation.sourceClass,
        observation.sessionId,
        observation.triggerObservationId,
        observation.authorizedScopeRef,
        observation.kind,
        observation.externalObservationKey,
        observation.idempotencyKey,
        observation.observedAt,
        observation.lon,
        observation.lat,
        observation.h3_7,
        observation.h3_9,
        observation.h3_11,
        observation.confidence,
        observation.piiStatus,
        observation.retentionClass,
        observation.rawPayloadRef,
        observation.operatorApprovedRawRef,
        JSON.stringify(observation.payload),
        JSON.stringify(observation.provenance),
      ]);
      const observationId = insertResult.rows[0].id;
      observationIds.push(observationId);
      await materializeObservationEntities(pool, { ...observation, id: observationId });
    }

    const completedAt = batch.now.toISOString();
    const receipt = {
      batch_id: batchRow.id,
      source_id: batch.sourceId,
      source_class: batch.sourceClass,
      client_id: batch.clientId,
      idempotency_key: batch.idempotencyKey,
      status: 'applied',
      observation_count: observationIds.length,
      observation_ids: observationIds,
      payload_hash: batch.payloadHash,
      received_at: isoString(batchRow.received_at),
      completed_at: completedAt,
    };

    await pool.query(`
      UPDATE sync_batches
      SET status = 'applied', completed_at = $2::timestamptz, observation_count = $3,
          payload_hash = $4, request_metadata = $5::jsonb
      WHERE id = $1
      RETURNING id
    `, [
      batchRow.id,
      completedAt,
      observationIds.length,
      batch.payloadHash,
      JSON.stringify({ ...requestMetadataForBatch(batch), receipt }),
    ]);

    await pool.query('COMMIT');
    return {
      statusCode: 201,
      body: {
        ok: true,
        duplicate: false,
        receipt,
      },
    };
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch {
      // Keep the original error path sanitized for API callers.
    }
    throw error;
  }
}

function mapValidationError(error) {
  return errorResult(
    error.statusCode || 400,
    error.code || 'invalid_observation',
    error.message || 'Observation batch failed validation.',
  );
}

export async function handleObservationBatchRequest({
  req,
  body,
  identity,
  env = process.env,
  dbPoolFactory = createDefaultPool,
  now = new Date(),
  limits = {},
} = {}) {
  let batch;
  try {
    batch = normalizeObservationBatch({
      headers: req?.headers || {},
      body,
      identity,
      now,
      limits,
    });
  } catch (error) {
    if (/Idempotency-Key/.test(error.message)) {
      return errorResult(400, 'idempotency_key_required', 'Idempotency-Key header is required for observation batch ingest.');
    }
    return mapValidationError(error);
  }

  const config = loadDatabaseConfig(env);
  if (!config.ok) {
    return errorResult(503, 'db_not_configured', 'Cybermap observation ingest database is not configured.');
  }

  let pool;
  try {
    pool = await dbPoolFactory(config.pool);
    return await storeObservationBatch(pool, batch);
  } catch {
    return errorResult(500, 'ingest_failed', 'Cybermap observation batch ingest failed.');
  } finally {
    if (pool?.end) await pool.end();
  }
}

export const observationIngestDefaults = Object.freeze({
  DEFAULT_OBSERVATION_BATCH_MAX_ITEMS,
  DEFAULT_OBSERVATION_PAYLOAD_LIMIT_BYTES,
});
