export function createFixtureOnlyAdapter({ source, normalizePayload }) {
  const adapterSource = freezeSource(source);

  return Object.freeze({
    source: adapterSource,
    normalize(payload, { source: boundSource } = {}) {
      const sourceBinding = requireSourceBinding(boundSource, adapterSource);
      const records = normalizePayload(payload);
      if (!Array.isArray(records)) throw invalidPayload();

      return records
        .map((record) => createSnapshot({ source: sourceBinding, adapterSource, record }))
        .sort((left, right) => left.provider_event_id.localeCompare(right.provider_event_id));
    },
  });
}

export function requireArray(value) {
  if (!Array.isArray(value)) throw invalidPayload();
  return value;
}

export function requireString(value) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 160) {
    throw invalidPayload();
  }
  return value.trim();
}

export function requireTimestamp(value) {
  const milliseconds = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw invalidPayload();
  return new Date(milliseconds).toISOString();
}

export function requirePoint(geometry) {
  const coordinates = geometry?.type === 'Point' ? geometry.coordinates : null;
  if (!Array.isArray(coordinates) || coordinates.length < 2) throw invalidPayload();

  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw invalidPayload();
  }
  return { latitude, longitude };
}

export function requireFiniteNumber(value, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) throw invalidPayload();
  return value;
}

export function normalizeClassification(value) {
  const normalized = requireString(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (normalized.length === 0 || normalized.length > 64) throw invalidPayload();
  return normalized;
}

export function invalidPayload() {
  const error = new TypeError('Provider payload does not match the adapter contract.');
  error.code = 'invalid_payload';
  return error;
}

function freezeSource(source) {
  if (!source || typeof source !== 'object') throw new TypeError('source metadata is required.');
  return Object.freeze({
    ...source,
    caveats: Object.freeze([...source.caveats]),
  });
}

function requireSourceBinding(source, adapterSource) {
  if (!source || typeof source !== 'object'
    || typeof source.id !== 'string' || source.id.trim().length === 0
    || source.layer_id !== adapterSource.layer_id
    || source.source_class !== adapterSource.source_class) {
    throw invalidPayload();
  }
  return source;
}

function createSnapshot({ source, adapterSource, record }) {
  if (!record || typeof record !== 'object') throw invalidPayload();
  return {
    source_id: source.id,
    source_class: adapterSource.source_class,
    layer_id: adapterSource.layer_id,
    provider_event_id: requireString(record.provider_event_id),
    observed_at: requireTimestamp(record.observed_at),
    location: requireLocation(record.location),
    entity_count: 1,
    summary: requireSummary(record.summary),
    caveats: [...adapterSource.caveats],
    provenance: {
      provider: adapterSource.provider,
      provider_url: adapterSource.provider_url,
      normalizer_version: adapterSource.normalizer_version,
    },
  };
}

function requireLocation(location) {
  if (!location || typeof location !== 'object') throw invalidPayload();
  const { latitude, longitude } = location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw invalidPayload();
  }
  return { latitude, longitude };
}

function requireSummary(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) throw invalidPayload();
  return structuredClone(summary);
}
