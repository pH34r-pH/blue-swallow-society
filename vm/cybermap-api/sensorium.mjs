import { randomUUID } from 'node:crypto';

export const SENSORIUM_STATES = Object.freeze([
  'dream_suspension',
  'raid_sight',
  'greenfeed_jack_in',
]);

export const SENSORIUM_SOURCE_CLASSES = Object.freeze([
  'green_public',
  'green_owned',
  'green_authorized',
  'owned_device',
  'local_observation',
  'grey_enrichment',
  'orange_exposure',
  'red_restricted',
]);

export const RAW_FRAME_RETENTION = Object.freeze([
  'none',
  'ephemeral',
  'explicit_capture_only',
]);

export const DIRECT_OBSERVATION_CONFIDENCE = Object.freeze(['low', 'medium', 'high']);
export const EFFECT_ON_CLAIM = Object.freeze(['supports', 'weakens', 'contradicts', 'inconclusive']);

const GREEN_SOURCE_CLASSES = new Set(['green_public', 'green_owned', 'green_authorized']);
const ALIAS_SOURCE_CLASSES = Object.freeze({
  public_greenfeed: 'green_public',
  owned_greenfeed: 'green_owned',
  authorized_greenfeed: 'green_authorized',
});
const FORBIDDEN_VISUAL_FIELDS = new Set([
  'raw_frame',
  'raw_frames',
  'rawframe',
  'rawframes',
  'raw_image',
  'rawimage',
  'image_data',
  'imagedata',
  'face_image',
  'faceimage',
  'face_crop',
  'facecrop',
  'license_plate_image',
  'licenseplateimage',
  'raw_payload',
  'rawpayload',
  'raw_payload_ref',
  'rawpayloadref',
  'raw_payload_url',
  'rawpayloadurl',
  'raw_payload_uri',
  'rawpayloaduri',
  'raw_frame_ref',
  'rawframeref',
  'raw_frame_url',
  'rawframeurl',
  'raw_frame_uri',
  'rawframeuri',
  'frame_url',
  'frameurl',
  'frame_uri',
  'frameuri',
  'image_url',
  'imageurl',
  'private_visual_details',
  'privatevisualdetails',
  'raw_pii',
  'rawpii',
  'biometric_template',
  'biometrictemplate',
]);
const PRIVATE_VISUAL_TEXT = /\b(license plate|face crop|private face|private visual|raw pii|home interior|apartment window|biometric)\b/i;
const RAW_REFERENCE_TEXT = /(?:raw|private)[\w\s:/.-]{0,80}(?:frame|payload|image|visual|pii)[\w\s:/.-]{0,80}(?:ref|refs|reference|references|url|urls|uri|uris|href|hrefs|path|paths|blob|blobs|data)/i;
const RAW_REFERENCE_SCHEME_TEXT = /\b(?:raw_?)?(?:frame|payload|image|visual|pii):\/\/(?:private|raw)\b/i;
const CERTAINTY_TEXT = /\b(proved|disproved|proves|disproves|confirmed|debunked|proof)\b/i;
const LOCATION_BASIS_KINDS = Object.freeze([
  'cyberspace_language_only',
  'operator_foreground_gps',
  'feed_coordinates',
]);
const SENSORIUM_STATE_LOCATION_KINDS = Object.freeze({
  dream_suspension: Object.freeze(['cyberspace_language_only']),
  raid_sight: Object.freeze(['operator_foreground_gps']),
  greenfeed_jack_in: Object.freeze(['feed_coordinates']),
});
const LOCATION_BASIS_FIELDS = Object.freeze({
  cyberspace_language_only: Object.freeze(['kind', 'channel', 'context', 'source_summary', 'sourceSummary']),
  operator_foreground_gps: Object.freeze([
    'kind',
    'lat',
    'lon',
    'accuracy_meters',
    'accuracyMeters',
    'heading_degrees',
    'headingDegrees',
    'altitude_meters',
    'altitudeMeters',
    'map_context',
    'mapContext',
  ]),
  feed_coordinates: Object.freeze([
    'kind',
    'lat',
    'lon',
    'accuracy_meters',
    'accuracyMeters',
    'heading_degrees',
    'headingDegrees',
    'map_context',
    'mapContext',
    'feed_id',
    'feedId',
    'publisher',
    'observed_at',
    'observedAt',
  ]),
});
const OPERATOR_SCOPES = new Set(['*', 'operator:*', 'cybermap:*']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function valueFor(body, snake, camel = null) {
  if (!body || typeof body !== 'object') return undefined;
  if (body[snake] !== undefined) return body[snake];
  if (camel && body[camel] !== undefined) return body[camel];
  return undefined;
}

function compactStrings(values = []) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value ?? '').trim()).filter(Boolean);
}

function error(statusCode, code, message) {
  return { ok: false, statusCode, code, message };
}

function assertPlainObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return error(400, code, message);
  }
  return null;
}

function normalizeSourceClass(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ALIAS_SOURCE_CLASSES[normalized] || normalized;
}

function normalizeLocationKind(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeLocationBasis(value, { allowedKinds = LOCATION_BASIS_KINDS } = {}) {
  const locationError = assertPlainObject(value, 'required_location_basis_missing', 'location_basis is required and must be an object.');
  if (locationError) return locationError;

  const kind = normalizeLocationKind(value.kind);
  if (!kind || !allowedKinds.includes(kind)) {
    return error(400, 'invalid_location_basis', `location_basis.kind must be one of: ${allowedKinds.join(', ')}.`);
  }

  const allowedFields = new Set(LOCATION_BASIS_FIELDS[kind] || ['kind']);
  const unsupportedField = Object.keys(value).find((key) => !allowedFields.has(key));
  if (unsupportedField) {
    return error(400, 'invalid_location_basis', `location_basis field is not accepted for ${kind}: ${unsupportedField}.`);
  }

  return { ok: true, value: { ...clone(value), kind } };
}

function identityValues(values = []) {
  if (values === undefined || values === null || values === '') return [];
  return (Array.isArray(values) ? values : [values])
    .flatMap((value) => String(value ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function identityHasOperatorScope(identity) {
  const scopes = new Set(identityValues(identity?.scopes).map((scope) => scope.toLowerCase()));
  return identity?.clientType === 'operator_admin' || [...OPERATOR_SCOPES].some((scope) => scopes.has(scope));
}

function identityCanManageSession(identity, session) {
  if (identityHasOperatorScope(identity)) return true;
  const sourceIds = new Set(identityValues(identity?.sourceIds));
  if (sourceIds.has('*') || sourceIds.has(session.source_ref)) return true;
  const sourceClasses = new Set(identityValues(identity?.sourceClasses).map(normalizeSourceClass));
  return sourceClasses.has('*') || sourceClasses.has(session.source_class);
}

function normalizeRetentionPolicy(body, { greenOnly = false } = {}) {
  const input = valueFor(body, 'retention_policy', 'retentionPolicy') || body?.policy || {};
  if (input && (typeof input !== 'object' || Array.isArray(input))) {
    return error(400, 'invalid_retention_policy', 'retention_policy must be an object when supplied.');
  }
  const rawFrameRetention = String(
    valueFor(input, 'raw_frame_retention', 'rawFrameRetention') || 'none',
  ).trim().toLowerCase();
  if (!RAW_FRAME_RETENTION.includes(rawFrameRetention)) {
    return error(400, 'invalid_retention_policy', 'raw_frame_retention must be none, ephemeral, or explicit_capture_only.');
  }
  const piiRedactionInput = valueFor(input, 'pii_redaction_required', 'piiRedactionRequired');
  if (piiRedactionInput === false) {
    return error(400, 'invalid_retention_policy', 'pii_redaction_required cannot be disabled for sensorium/direct-observation routes.');
  }
  return {
    read_only: true,
    green_only: Boolean(greenOnly),
    raw_frame_retention: rawFrameRetention,
    pii_redaction_required: true,
  };
}

function isForbiddenVisualField(key) {
  const normalizedKey = key.toLowerCase().replace(/[-\s]+/g, '_');
  const compactKey = normalizedKey.replace(/_/g, '');
  if (FORBIDDEN_VISUAL_FIELDS.has(normalizedKey) || FORBIDDEN_VISUAL_FIELDS.has(compactKey)) return true;
  return /^(raw|private).*(frame|payload|image|visual|pii).*(ref|refs|reference|references|url|urls|uri|uris|href|hrefs|path|paths|blob|blobs|data)$/.test(compactKey)
    || /^(frame|payload|image|visual).*(ref|refs|reference|references|url|urls|uri|uris|href|hrefs|path|paths|blob|blobs|data)$/.test(compactKey);
}

function findForbiddenField(value, path = []) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenField(value[index], [...path, String(index)]);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (isForbiddenVisualField(key)) {
      return [...path, key].join('.');
    }
    const found = findForbiddenField(child, [...path, key]);
    if (found) return found;
  }
  return null;
}

function collectStrings(value, result = []) {
  if (value === null || value === undefined) return result;
  if (typeof value === 'string') {
    result.push(value);
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, result));
    return result;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((child) => collectStrings(child, result));
  }
  return result;
}

function isForbiddenVisualText(text) {
  const normalizedText = text.toLowerCase().replace(/[-\s]+/g, '_');
  const compactText = normalizedText.replace(/[^a-z0-9]+/g, '');
  return PRIVATE_VISUAL_TEXT.test(text)
    || RAW_REFERENCE_TEXT.test(normalizedText)
    || RAW_REFERENCE_TEXT.test(compactText)
    || RAW_REFERENCE_SCHEME_TEXT.test(normalizedText);
}

function validateNoPrivateVisualPayload(body) {
  const forbiddenField = findForbiddenField(body);
  if (forbiddenField) {
    return error(400, 'private_visual_detail_forbidden', `Private visual/raw payload field is not accepted by default: ${forbiddenField}.`);
  }
  if (collectStrings(body).some((text) => isForbiddenVisualText(text))) {
    return error(400, 'private_visual_detail_forbidden', 'Private visual/PII details or raw payload references are not accepted by default.');
  }
  return null;
}

function validateNoCertaintyLanguage(body) {
  if (collectStrings(body).some((text) => CERTAINTY_TEXT.test(text))) {
    return error(400, 'certainty_language_forbidden', 'Use caveated effect_on_claim values; proved/disproved certainty language is not accepted.');
  }
  return null;
}

function requireString(body, snake, camel = null) {
  const value = valueFor(body, snake, camel);
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

function validateStartSession(body) {
  const state = requireString(body, 'state');
  if (!SENSORIUM_STATES.includes(state)) {
    return error(400, 'invalid_sensorium_state', 'state must be dream_suspension, raid_sight, or greenfeed_jack_in.');
  }

  const sourceRef = requireString(body, 'source_ref', 'sourceRef');
  if (!sourceRef) return error(400, 'required_field_missing', 'source_ref is required when starting a sensorium session.');

  const sourceClass = normalizeSourceClass(valueFor(body, 'source_class', 'sourceClass'));
  if (!SENSORIUM_SOURCE_CLASSES.includes(sourceClass)) {
    return error(400, 'invalid_source_class', 'source_class must be a canonical Cybermap source class.');
  }

  if (state === 'greenfeed_jack_in' && !GREEN_SOURCE_CLASSES.has(sourceClass)) {
    return error(400, 'invalid_source_class_for_state', 'greenfeed_jack_in sessions require green_public, green_owned, or green_authorized source_class.');
  }
  if (state === 'raid_sight' && sourceClass !== 'owned_device') {
    return error(400, 'invalid_source_class_for_state', 'raid_sight sessions require owned_device source_class.');
  }
  if (state === 'dream_suspension' && sourceClass !== 'local_observation') {
    return error(400, 'invalid_source_class_for_state', 'dream_suspension sessions use local_observation source_class.');
  }

  const locationBasis = valueFor(body, 'location_basis', 'locationBasis');
  const location = normalizeLocationBasis(locationBasis, { allowedKinds: SENSORIUM_STATE_LOCATION_KINDS[state] });
  if (location.ok === false) return location;

  const policy = normalizeRetentionPolicy(body, { greenOnly: state === 'greenfeed_jack_in' });
  if (policy.ok === false) return policy;

  return { ok: true, state, sourceRef, sourceClass, locationBasis: location.value, policy };
}

function validateEndSession(body) {
  const sessionId = requireString(body, 'session_id', 'sessionId');
  if (!sessionId) return error(400, 'required_field_missing', 'session_id is required when ending a sensorium session.');
  return { ok: true, sessionId };
}

function sessionResponse(session) {
  return clone(session);
}

export function createInMemorySensoriumStore() {
  const sessions = new Map();
  const observations = new Map();
  return {
    saveSession(session) {
      sessions.set(session.id, clone(session));
      return sessionResponse(session);
    },
    getSession(id) {
      const session = sessions.get(id);
      return session ? sessionResponse(session) : null;
    },
    updateSession(id, update) {
      const existing = sessions.get(id);
      if (!existing) return null;
      const next = typeof update === 'function' ? update(sessionResponse(existing)) : { ...existing, ...update };
      sessions.set(id, clone(next));
      return sessionResponse(next);
    },
    saveObservation(observation) {
      observations.set(observation.id, clone(observation));
      return clone(observation);
    },
    getObservation(id) {
      const observation = observations.get(id);
      return observation ? clone(observation) : null;
    },
  };
}

export function handleSensoriumSessionRequest({ body, now, store, identity, idFactory = randomUUID } = {}) {
  const bodyError = assertPlainObject(body, 'invalid_request_body', 'Request body must be a JSON object.');
  if (bodyError) return bodyError;

  const action = String(valueFor(body, 'action') || 'start').trim().toLowerCase();
  if (action === 'start') {
    const privatePayloadError = validateNoPrivateVisualPayload(body);
    if (privatePayloadError) return privatePayloadError;
    const certaintyError = validateNoCertaintyLanguage(body);
    if (certaintyError) return certaintyError;

    const validated = validateStartSession(body);
    if (validated.ok === false) return validated;
    const timestamp = now().toISOString();
    const session = {
      id: idFactory(),
      state: validated.state,
      started_at: timestamp,
      ended_at: null,
      source_class: validated.sourceClass,
      source_ref: validated.sourceRef,
      location_basis: clone(validated.locationBasis),
      policy: validated.policy,
    };
    return {
      ok: true,
      statusCode: 201,
      body: { ok: true, session: store.saveSession(session) },
    };
  }

  if (action === 'end') {
    const validated = validateEndSession(body);
    if (validated.ok === false) return validated;
    const existing = store.getSession(validated.sessionId);
    if (!existing) return error(404, 'sensorium_session_not_found', 'sensorium session not found.');
    if (!identityCanManageSession(identity, existing)) {
      return error(403, 'source_scope_forbidden', 'Token source authority does not authorize ending this sensorium session.');
    }
    if (existing.ended_at) {
      return { ok: true, statusCode: 200, body: { ok: true, session: existing } };
    }
    const ended = store.updateSession(validated.sessionId, (session) => ({
      ...session,
      ended_at: now().toISOString(),
    }));
    return {
      ok: true,
      statusCode: 200,
      body: { ok: true, session: ended },
    };
  }

  return error(400, 'invalid_sensorium_action', 'action must be start or end.');
}

function validateObservation(body) {
  const privatePayloadError = validateNoPrivateVisualPayload(body);
  if (privatePayloadError) return privatePayloadError;

  const effect = requireString(body, 'effect_on_claim', 'effectOnClaim');
  if (!EFFECT_ON_CLAIM.includes(effect)) {
    return error(400, 'invalid_effect_on_claim', 'effect_on_claim must be supports, weakens, contradicts, or inconclusive.');
  }

  const certaintyError = validateNoCertaintyLanguage({ ...body, effect_on_claim: undefined, effectOnClaim: undefined });
  if (certaintyError) return certaintyError;

  const locationBasis = valueFor(body, 'location_basis', 'locationBasis');
  const location = normalizeLocationBasis(locationBasis);
  if (location.ok === false) return location;

  const sourceRef = requireString(body, 'source_ref', 'sourceRef');
  if (!sourceRef) return error(400, 'required_field_missing', 'source_ref is required.');

  const claimRef = requireString(body, 'claim_ref', 'claimRef');
  if (!claimRef) return error(400, 'required_field_missing', 'claim_ref is required.');

  const sourceClass = normalizeSourceClass(valueFor(body, 'source_class', 'sourceClass'));
  if (!SENSORIUM_SOURCE_CLASSES.includes(sourceClass)) {
    return error(400, 'invalid_source_class', 'source_class must be a canonical Cybermap source class.');
  }

  const confidence = requireString(body, 'confidence');
  if (!DIRECT_OBSERVATION_CONFIDENCE.includes(confidence)) {
    return error(400, 'invalid_confidence', 'confidence must be low, medium, or high.');
  }

  const caveats = compactStrings(valueFor(body, 'caveats'));
  if (caveats.length === 0) {
    return error(400, 'required_caveats_missing', 'direct observations require at least one caveat.');
  }

  const visibleSummary = requireString(body, 'visible_summary', 'visibleSummary');
  if (!visibleSummary) return error(400, 'required_field_missing', 'visible_summary is required.');

  const notVisibleNotes = compactStrings(valueFor(body, 'not_visible_notes', 'notVisibleNotes'));
  if (notVisibleNotes.length === 0) {
    return error(400, 'required_field_missing', 'not_visible_notes must include at least one note.');
  }

  const policy = normalizeRetentionPolicy(body, { greenOnly: GREEN_SOURCE_CLASSES.has(sourceClass) });
  if (policy.ok === false) return policy;

  return {
    ok: true,
    sessionId: requireString(body, 'session_id', 'sessionId') || null,
    observedAt: requireString(body, 'observed_at', 'observedAt') || null,
    claimRef,
    sourceRef,
    sourceClass,
    locationBasis: location.value,
    visibleSummary,
    notVisibleNotes,
    confidence,
    caveats,
    evidenceLinks: compactStrings(valueFor(body, 'evidence_links', 'evidenceLinks')),
    effect,
    policy,
  };
}

export function handleDirectObservationRequest({ body, now, store, idFactory = randomUUID } = {}) {
  const bodyError = assertPlainObject(body, 'invalid_request_body', 'Request body must be a JSON object.');
  if (bodyError) return bodyError;

  const validated = validateObservation(body);
  if (validated.ok === false) return validated;

  const timestamp = now().toISOString();
  const observation = {
    id: idFactory(),
    session_id: validated.sessionId,
    observed_at: validated.observedAt || timestamp,
    recorded_at: timestamp,
    claim_ref: validated.claimRef,
    source_ref: validated.sourceRef,
    source_class: validated.sourceClass,
    location_basis: clone(validated.locationBasis),
    visible_summary: validated.visibleSummary,
    not_visible_notes: validated.notVisibleNotes,
    confidence: validated.confidence,
    caveats: validated.caveats,
    evidence_links: validated.evidenceLinks,
    effect_on_claim: validated.effect,
    retention_policy: validated.policy,
  };

  return {
    ok: true,
    statusCode: 201,
    body: { ok: true, observation: store.saveObservation(observation) },
  };
}
