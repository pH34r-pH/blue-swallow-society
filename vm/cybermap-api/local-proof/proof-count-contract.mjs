const COUNT_FIELDS = Object.freeze([
  'desktop_source_count',
  'desktop_credential_count',
  'sync_batch_count',
  'observation_count',
]);

export function parseProofDatabaseCounts(serialized) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Local proof database count response is not JSON');
  }
  return normalizeProofDatabaseCounts(parsed);
}

export function normalizeProofDatabaseCounts(counts) {
  requirePlainObject(counts, 'Local proof database count response is not an object');
  const actualFields = Object.keys(counts).sort();
  const expectedFields = [...COUNT_FIELDS].sort();
  require(actualFields.length === expectedFields.length
    && actualFields.every((field, index) => field === expectedFields[index]),
  'Local proof database count response has a missing or unsupported field');
  for (const field of COUNT_FIELDS) {
    require(Number.isSafeInteger(counts[field]) && counts[field] >= 0,
      'Local proof database count response has an invalid count');
  }
  return Object.freeze({
    desktop_source_count: counts.desktop_source_count,
    desktop_credential_count: counts.desktop_credential_count,
    sync_batch_count: counts.sync_batch_count,
    observation_count: counts.observation_count,
  });
}

export function assertProofDatabaseCounts(counts, {
  desktopSourceCount,
  credentialCount,
  syncBatchCount,
  observationCount,
  phase,
}) {
  const normalized = normalizeProofDatabaseCounts(counts);
  require(normalized.desktop_source_count === desktopSourceCount
    && normalized.desktop_credential_count === credentialCount
    && normalized.sync_batch_count === syncBatchCount
    && normalized.observation_count === observationCount,
  `Local proof database counts are invalid at ${phase}`);
  return normalized;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function requirePlainObject(value, message) {
  require(isPlainObject(value), message);
}

function require(value, message) {
  if (!value) throw new Error(message);
}
