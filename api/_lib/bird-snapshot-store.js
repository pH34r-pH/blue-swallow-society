'use strict';
const { BlobServiceClient } = require('@azure/storage-blob');
const { ManagedIdentityCredential } = require('@azure/identity');
const { createHash } = require('node:crypto');
const { planBirdReconciliation } = require('./bird-reconciliation');
const MAX_BYTES = 16 * 1024 * 1024;
const BLOB = 'private/bird-history/snapshot-v1.json';
const OPTIONAL = new Set(['Time', 'Location', 'Latitude', 'Longitude', 'State/Province', 'Country', 'Checklist Comments', 'Species Comments']);
const RECORD_FIELDS = ['row', 'provisionalKey', 'submissionId', 'commonName', 'scientificName', 'observedOn', 'count', 'countKind', 'privateFields', 'publication', 'identity'];
function fail(code = 'bird_storage_unavailable') { throw new Error(code); }
function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function validDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}
function recordValid(row) {
  if (!exact(row, RECORD_FIELDS) || !Number.isSafeInteger(row.row) || row.row < 2 || row.publication !== 'draft'
    || row.identity !== 'provisional' || !/^S\d{1,20}$/i.test(row.submissionId)
    || !row.commonName || row.commonName.length > 120 || !row.scientificName || row.scientificName.length > 160
    || !validDay(row.observedOn)) return false;
  if (Object.keys(row.privateFields || {}).some((key) => !OPTIONAL.has(key) || row.privateFields[key].length > 65536)) return false;
  const key = createHash('sha256').update(`${row.submissionId.toUpperCase()}\0${row.scientificName.toLowerCase()}`).digest('hex');
  return key === row.provisionalKey;
}
function validateSnapshot(value) {
  try {
    if (!exact(value, ['version', 'revision', 'records']) || value.version !== 1
      || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Array.isArray(value.records)
      || value.records.length > 100000 || !value.records.every(recordValid)) fail();
    planBirdReconciliation(value, { version: 1, candidates: [], rejected: [] });
    return value;
  } catch { fail(); }
}
function config(env = process.env) {
  const account = env.BSS_BIRD_HISTORY_ACCOUNT || '', container = env.BSS_BIRD_HISTORY_CONTAINER || '';
  const clientId = env.BSS_BIRD_HISTORY_MANAGED_IDENTITY_CLIENT_ID || '';
  if (env.BSS_BIRD_HISTORY_ENABLED !== 'true' || !/^[a-z0-9]{3,24}$/.test(account)
    || !/^(?!.*--)[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(container)
    || (clientId && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(clientId))) fail();
  return { account, container, clientId };
}
function validEtag(value) { return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value); }
function validExpected(snapshot, expected) {
  return expected && Number.isSafeInteger(expected.revision) && expected.revision >= 0
    && snapshot.revision === expected.revision + 1 && (expected.revision === 0 ? expected.etag === null : validEtag(expected.etag));
}
function preservePrior(previous, next) {
  const records = new Map(next.records.map((row) => [row.provisionalKey, row]));
  for (const prior of previous.records) {
    const current = records.get(prior.provisionalKey);
    if (!current || Object.keys(prior.privateFields).some((name) => !Object.hasOwn(current.privateFields, name))) fail();
  }
}
async function readBytes(result) {
  if (!validEtag(result.etag) || !result.readableStreamBody || !Number.isSafeInteger(result.contentLength)
    || result.contentLength < 1 || result.contentLength > MAX_BYTES) fail();
  const chunks = []; let length = 0;
  for await (const chunk of result.readableStreamBody) {
    const data = Buffer.from(chunk); length += data.length;
    if (length > MAX_BYTES) { result.readableStreamBody.destroy?.(); fail(); }
    chunks.push(data);
  }
  if (length !== result.contentLength) fail();
  return Buffer.concat(chunks);
}
function createBirdSnapshotStore({ settings = config(), serviceClient } = {}) {
  const service = serviceClient || new BlobServiceClient(`https://${settings.account}.blob.core.windows.net`,
    new ManagedIdentityCredential(settings.clientId ? { clientId: settings.clientId } : undefined));
  const blob = service.getContainerClient(settings.container).getBlockBlobClient(BLOB);
  async function read() {
    let result;
    try { result = await blob.download(0, MAX_BYTES + 1, { abortSignal: AbortSignal.timeout(10000) }); }
    catch (error) { if (error?.statusCode === 404 && error?.code === 'BlobNotFound') return { snapshot: { version: 1, revision: 0, records: [] }, etag: null }; fail(); }
    try {
      const bytes = await readBytes(result);
      const snapshot = validateSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      return { snapshot, etag: result.etag };
    } catch { fail(); }
  }
  return {
    read,
    async write(snapshot, expected) {
      validateSnapshot(snapshot);
      if (!validExpected(snapshot, expected)) fail();
      const bytes = Buffer.from(JSON.stringify(snapshot)); if (bytes.length > MAX_BYTES) fail();
      const prior = await read();
      if (prior.etag !== expected.etag || prior.snapshot.revision !== expected.revision) fail('bird_snapshot_conflict');
      preservePrior(prior.snapshot, snapshot);
      try {
        const result = await blob.uploadData(bytes, { abortSignal: AbortSignal.timeout(10000),
          conditions: expected.etag === null ? { ifNoneMatch: '*' } : { ifMatch: expected.etag },
          blobHTTPHeaders: { blobContentType: 'application/json', blobCacheControl: 'private, no-store' } });
        if (!validEtag(result.etag)) fail();
        return { etag: result.etag, revision: snapshot.revision };
      } catch (error) { if (error?.statusCode === 412 || error?.code === 'BlobAlreadyExists') fail('bird_snapshot_conflict'); fail(); }
    },
  };
}
module.exports = { config, createBirdSnapshotStore, validateSnapshot };
