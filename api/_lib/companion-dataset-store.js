'use strict';

const { BlobServiceClient } = require('@azure/storage-blob');
const { ManagedIdentityCredential } = require('@azure/identity');
const { GROUP_ID, ROSTER_TYPE, publicIdentity, exactKeys, rosterPayload, sha256, verifyJson } = require('./wardriver-sync-auth');
const { STATE_BLOB, ROSTER_BLOB, MAX_STATE_BYTES, validateState } = require('./wardriver-sync-store');
const MAX_OBJECT_BYTES = 1024 * 1024;
const MAX_HEAD_BYTES = 16 * 1024;
const DEADLINE_MS = 8000;
let activeReads = 0;

function unavailable() { return Object.assign(new Error('datasets_unavailable'), { status: 503 }); }
function changed() { return Object.assign(new Error('roster_changed'), { status: 409 }); }
function datasetLocation(env) {
  const groupId = env.BSS_WARDRIVER_SYNC_GROUP_ID;
  const accountName = env.BSS_WARDRIVER_SYNC_ACCOUNT_NAME;
  const container = env.BSS_WARDRIVER_SYNC_CONTAINER;
  if (env.BSS_WARDRIVER_VIEWER_DATASET_ENABLED !== 'true' || !GROUP_ID.test(groupId || '')
    || !/^[a-z0-9]{3,24}$/.test(accountName || '') || !/^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/.test(container || '')
    || container.includes('--')) throw unavailable();
  return { groupId, accountName, container };
}
function readDatasetConfig(env = process.env) {
  try {
    const location = datasetLocation(env);
    const owner = publicIdentity(env.BSS_WARDRIVER_SYNC_OWNER_PUBLIC_KEY_SPKI);
    const signer = publicIdentity(env.BSS_WARDRIVER_VIEWER_DATASET_ROSTER_PUBLIC_KEY_SPKI);
    const managedIdentityClientId = env.BSS_WARDRIVER_VIEWER_DATASET_MANAGED_IDENTITY_CLIENT_ID;
    if (owner.deviceId === signer.deviceId || (managedIdentityClientId !== undefined
      && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(managedIdentityClientId))) throw unavailable();
    const origin = env.BLUE_SWALLOW_PUBLIC_ORIGIN;
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin) throw unavailable();
    return { ...location, owner, signer, managedIdentityClientId, origin };
  } catch { throw unavailable(); }
}

function validateResponse(response, maxBytes) {
  if (!response.readableStreamBody || !Number.isSafeInteger(response.contentLength) || response.contentLength < 1
    || response.contentLength > maxBytes || typeof response.etag !== 'string' || response.etag.length > 256
    || (response.contentEncoding && response.contentEncoding !== 'identity')) throw unavailable();
}
async function readBytes(container, name, maxBytes, signal) {
  let response;
  try { response = await container.getBlockBlobClient(name).download(0, maxBytes + 1, { abortSignal: signal }); }
  catch (error) { if (error?.statusCode === 404) return null; throw unavailable(); }
  const stream = response.readableStreamBody;
  try {
    validateResponse(response, maxBytes);
    const chunks = []; let length = 0;
    for await (const chunk of stream) {
      signal.throwIfAborted(); const bytes = Buffer.from(chunk); length += bytes.length;
      if (length > maxBytes) throw unavailable();
      chunks.push(bytes);
    }
    signal.throwIfAborted();
    if (length !== response.contentLength) throw unavailable();
    return { bytes: Buffer.concat(chunks), etag: response.etag };
  } finally { stream?.destroy?.(); }
}
function json(record) {
  if (!record) throw unavailable();
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(record.bytes));
}
async function readRoster(container, config, signal) {
  const before = await readBytes(container, STATE_BLOB, MAX_STATE_BYTES, signal);
  const published = json(await readBytes(container, ROSTER_BLOB, MAX_STATE_BYTES, signal));
  if (!exactKeys(published, ['version', 'roster']) || published.version !== 1) throw unavailable();
  const payload = await verifyJson(published.roster, config.signer.key, ROSTER_TYPE, config.signer.deviceId, MAX_STATE_BYTES);
  const state = validateState(json(before), config);
  if (JSON.stringify(payload) !== JSON.stringify(rosterPayload(state, config))) throw unavailable();
  const after = await readBytes(container, STATE_BLOB, MAX_STATE_BYTES, signal);
  if (!after || before.etag !== after.etag) throw changed();
  return { version: 1, groupId: config.groupId, revision: payload.revision,
    rosterSha256: sha256(published.roster), roster: published.roster,
    rosterPublicKeySpki: config.signer.publicKeySpki, members: payload.devices };
}
function sameRoster(roster, reference) {
  if (roster.revision !== reference.revision || roster.rosterSha256 !== reference.rosterSha256) throw changed();
}
async function readObject(container, config, reference, signal) {
  const roster = await readRoster(container, config, signal); sameRoster(roster, reference);
  const member = roster.members.find((entry) => entry.deviceId === reference.deviceId);
  if (!member || (member.status === 'revoked' && reference.object === 'head')) {
    throw Object.assign(new Error('not_found'), { status: 404 });
  }
  const path = `devices/${member.deviceId}/${reference.object === 'head' ? 'head.json' : `objects/${reference.object}`}`;
  const result = await readBytes(container, path, reference.object === 'head' ? MAX_HEAD_BYTES : MAX_OBJECT_BYTES, signal);
  sameRoster(await readRoster(container, config, signal), reference);
  if (!result) throw Object.assign(new Error('not_found'), { status: 404 });
  return result.bytes;
}
async function boundedRead(operation, timeoutMs) {
  if (activeReads >= 2) throw unavailable();
  activeReads++;
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeoutMs);
  });
  // Keep the concurrency slot until even a misbehaving transport has stopped.
  const work = Promise.resolve().then(() => operation(controller.signal)).finally(() => { activeReads--; clearTimeout(timer); });
  try { return await Promise.race([work, deadline]); }
  catch (error) { if ([404, 409].includes(error?.status)) throw error; throw unavailable(); }
}
function createDatasetStore({ config, serviceClient, timeoutMs = DEADLINE_MS } = {}) {
  const service = serviceClient || new BlobServiceClient(`https://${config.accountName}.blob.core.windows.net`,
    new ManagedIdentityCredential(config.managedIdentityClientId ? { clientId: config.managedIdentityClientId } : {}),
    { retryOptions: { maxTries: 1 }, loggingOptions: { logger: () => {} } });
  const container = service.getContainerClient(config.container);
  return {
    roster: () => boundedRead(async (signal) => { const { members, ...result } = await readRoster(container, config, signal); return result; }, timeoutMs),
    object: (reference) => boundedRead((signal) => readObject(container, config, reference, signal), timeoutMs),
  };
}
module.exports = { createDatasetStore, readDatasetConfig, MAX_OBJECT_BYTES, MAX_HEAD_BYTES, DEADLINE_MS };
