'use strict';

const { randomBytes } = require('node:crypto');
const { issueDeviceUpdate } = require('./wardriver-device-update');
const { BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, SASProtocol } = require('@azure/storage-blob');
const { ManagedIdentityCredential } = require('@azure/identity');
const { DEVICE_ID, GRANT_SECONDS, ROSTER_TYPE, displayName, exactKeys, fail, isRecord,
  publicIdentity, rosterPayload, sha256, signJson, verifyJson } = require('./wardriver-sync-auth');

const STATE_BLOB = '_control/wardriver-sync-state.json';
const ROSTER_BLOB = 'group.json';
const MAX_STATE_BYTES = 128 * 1024;
const MAX_MEMBERS = 32;
const MAX_INVITATIONS = 32;
const MAX_NONCES = 512;
const MAX_CAS_ATTEMPTS = 5;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const ioOptions = () => ({ abortSignal: AbortSignal.timeout(10000) });
const isMissing = (error) => error?.statusCode === 404;
const isConflict = (error) => error?.statusCode === 412 || error?.code === 'BlobAlreadyExists';

function initialState(config) {
  return { version: 1, groupId: config.groupId, rosterRevision: 1,
    devices: { [config.owner.deviceId]: { publicKeySpki: config.owner.publicKeySpki,
      displayName: config.ownerDisplayName, status: 'active' } }, invitations: {}, requests: [] };
}

function validateStateEnvelope(state, config) {
  if (!exactKeys(state, ['version', 'groupId', 'rosterRevision', 'devices', 'invitations', 'requests'])
    || state.version !== 1 || state.groupId !== config.groupId || !Number.isSafeInteger(state.rosterRevision)
    || state.rosterRevision < 1 || !isRecord(state.devices) || !isRecord(state.invitations)
    || !Array.isArray(state.requests) || Object.keys(state.devices).length > MAX_MEMBERS
    || Object.keys(state.invitations).length > MAX_INVITATIONS || state.requests.length > MAX_NONCES) fail(503, 'sync_unavailable');
}

function validateMemberCutoff(member) {
  if (member.status !== 'revoked') {
    if (member.acceptedThrough !== undefined) fail(503, 'sync_unavailable');
    return;
  }
  const cutoff = member.acceptedThrough;
  if (!exactKeys(cutoff, ['sequence', 'commitHash']) || !Number.isSafeInteger(cutoff.sequence) || cutoff.sequence < 0
    || (cutoff.sequence === 0 ? cutoff.commitHash !== null : !DEVICE_ID.test(cutoff.commitHash || ''))) fail(503, 'sync_unavailable');
}

function validateMember(id, member) {
  if (!DEVICE_ID.test(id) || !exactKeys(member, ['publicKeySpki', 'displayName', 'status'], ['invitationHash', 'acceptedThrough'])
    || publicIdentity(member.publicKeySpki).deviceId !== id || displayName(member.displayName) !== member.displayName
    || !['active', 'revoked'].includes(member.status)
    || (member.invitationHash !== undefined && !DEVICE_ID.test(member.invitationHash))) fail(503, 'sync_unavailable');
  validateMemberCutoff(member);
}

function validateOwner(state, config) {
  const owner = state.devices[config.owner.deviceId];
  if (!owner || owner.publicKeySpki !== config.owner.publicKeySpki || owner.status !== 'active') fail(503, 'sync_unavailable');
}

function validateInvitation(hash, invitation, devices) {
  if (!DEVICE_ID.test(hash) || !exactKeys(invitation, ['expiresAt'], ['consumedBy'])
    || !Number.isSafeInteger(invitation.expiresAt)
    || (invitation.consumedBy !== undefined && (!DEVICE_ID.test(invitation.consumedBy)
      || devices[invitation.consumedBy]?.invitationHash !== hash))) fail(503, 'sync_unavailable');
}

function validateRequestReceipt(request) {
  if (!exactKeys(request, ['deviceId', 'nonce', 'expiresAt']) || !DEVICE_ID.test(request.deviceId)
    || !/^[A-Za-z0-9_-]{43}$/.test(request.nonce || '') || !Number.isSafeInteger(request.expiresAt)) fail(503, 'sync_unavailable');
}

function validateState(state, config) {
  try {
    validateStateEnvelope(state, config);
    for (const [id, member] of Object.entries(state.devices)) validateMember(id, member);
    validateOwner(state, config);
    for (const [hash, invitation] of Object.entries(state.invitations)) validateInvitation(hash, invitation, state.devices);
    for (const request of state.requests) validateRequestReceipt(request);
    return state;
  } catch { fail(503, 'sync_unavailable'); }
}

async function readJson(blob) {
  try {
    const result = await blob.download(0, MAX_STATE_BYTES + 1, ioOptions());
    if (result.contentLength > MAX_STATE_BYTES || typeof result.etag !== 'string'
      || !result.readableStreamBody) fail(503, 'sync_unavailable');
    const chunks = [];
    let length = 0;
    for await (const chunk of result.readableStreamBody) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > MAX_STATE_BYTES) {
        result.readableStreamBody.destroy?.();
        fail(503, 'sync_unavailable');
      }
      chunks.push(bytes);
    }
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))), etag: result.etag };
  } catch (error) {
    if (isMissing(error)) return null;
    fail(503, 'sync_unavailable');
  }
}

async function writeJson(blob, value, etag) {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > MAX_STATE_BYTES) fail(503, 'sync_unavailable');
  return blob.uploadData(bytes, { ...ioOptions(), conditions: etag ? { ifMatch: etag } : { ifNoneMatch: '*' },
    blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8', blobCacheControl: 'private, no-store' } });
}

function requireMember(state, request) {
  const member = state.devices[request.deviceId];
  if (!member || member.status !== 'active' || member.publicKeySpki !== request.publicKeySpki) fail(403, 'not_member');
  return member;
}

function enrollMember(state, request, config, now) {
  const hash = sha256(request.fields.invitation);
  const existing = state.devices[request.deviceId];
  const invitation = state.invitations[hash];
  if (existing) {
    requireMember(state, request);
    if (existing.invitationHash !== hash) fail(403, 'invitation_invalid');
    // The retained member receipt makes response-loss recovery independent of
    // invitation expiry/cleanup, but only for the originally admitted key.
    return false;
  }
  if (invitation?.consumedBy) fail(409, 'invitation_used');
  if (!invitation || invitation.expiresAt <= now) fail(403, 'invitation_invalid');
  if (Object.keys(state.devices).length >= MAX_MEMBERS
    || Object.values(state.devices).filter((member) => member.status === 'active').length >= config.maxDevices) fail(409, 'group_full');
  invitation.consumedBy = request.deviceId;
  state.devices[request.deviceId] = { publicKeySpki: request.publicKeySpki, displayName: request.fields.displayName,
    status: 'active', invitationHash: hash };
  return true;
}

function addInvitation(state, request, now, invitationToken) {
  if (Object.keys(state.invitations).length >= MAX_INVITATIONS) fail(429, 'rate_limited');
  state.invitations[sha256(invitationToken)] = { expiresAt: now + request.fields.expiresInSeconds };
  return false;
}

function renameMember(member, name) {
  if (member.displayName === name) return false;
  member.displayName = name;
  return true;
}

function revokeMember(state, request, config) {
  if (request.fields.targetDeviceId === config.owner.deviceId) fail(409, 'owner_protected');
  const target = state.devices[request.fields.targetDeviceId];
  if (!target) fail(404, 'device_not_found');
  if (target.status === 'revoked') {
    if (JSON.stringify(target.acceptedThrough) !== JSON.stringify(request.fields.acceptedThrough)) fail(409, 'cutoff_conflict');
    return false;
  }
  target.status = 'revoked';
  target.acceptedThrough = request.fields.acceptedThrough;
  return true;
}

function applyMemberAction(state, request, config, now, invitationToken) {
  const member = requireMember(state, request);
  if (['invite', 'revoke'].includes(request.action) && request.deviceId !== config.owner.deviceId) fail(403, 'owner_required');
  switch (request.action) {
    case 'invite': return addInvitation(state, request, now, invitationToken);
    case 'rename': return renameMember(member, request.fields.displayName);
    case 'revoke': return revokeMember(state, request, config);
    default: return false;
  }
}

function applyAction(state, request, config, now, invitationToken) {
  const changed = request.action === 'enroll'
    ? enrollMember(state, request, config, now)
    : applyMemberAction(state, request, config, now, invitationToken);
  if (!changed) return;
  if (state.rosterRevision === Number.MAX_SAFE_INTEGER) fail(503, 'sync_unavailable');
  state.rosterRevision += 1;
}

function invitationUrl(config, invitation) {
  return 'wardriver://invite?endpoint=' + encodeURIComponent(config.endpoint)
    + '&group=' + encodeURIComponent(config.groupId) + '&key=' + encodeURIComponent(config.signer.publicKeySpki)
    + '&token=' + encodeURIComponent(invitation);
}

function configurationUrl(config) {
  return 'wardriver://configure?endpoint=' + encodeURIComponent(config.endpoint)
    + '&group=' + encodeURIComponent(config.groupId) + '&key=' + encodeURIComponent(config.signer.publicKeySpki);
}

async function readState({ controlBlob, config }) {
  const saved = await readJson(controlBlob);
  return { state: saved ? validateState(saved.value, config) : initialState(config), etag: saved?.etag };
}

async function transact(store, request, invitationToken) {
  const { config, controlBlob, now } = store;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const { state, etag } = await readState(store);
    const currentTime = now();
    if (request.challengeExpiresAt <= currentTime) fail(401, 'challenge_expired');
    state.requests = state.requests.filter((entry) => entry.expiresAt > currentTime);
    if (state.requests.some((entry) => entry.deviceId === request.deviceId && entry.nonce === request.nonce)) fail(409, 'challenge_used');
    if (state.requests.length >= MAX_NONCES
      || state.requests.filter((entry) => entry.deviceId === request.deviceId).length >= 64) fail(429, 'rate_limited');
    for (const [hash, invitation] of Object.entries(state.invitations)) {
      if (invitation.expiresAt <= currentTime) delete state.invitations[hash];
    }
    applyAction(state, request, config, currentTime, invitationToken);
    state.requests.push({ deviceId: request.deviceId, nonce: request.nonce, expiresAt: request.challengeExpiresAt });
    validateState(state, config);
    try {
      await writeJson(controlBlob, state, etag);
      return state;
    } catch (error) {
      if (!isConflict(error)) fail(503, 'sync_unavailable');
    }
  }
  fail(503, 'sync_unavailable');
}

async function publishRoster(store) {
  const { config, rosterBlob } = store;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    // Read public ETag first. A concurrent newer writer then makes our write
    // conditional fail; reading state first could overwrite its new revision.
    const published = await readJson(rosterBlob);
    const { state, etag } = await readState(store);
    if (!etag) fail(503, 'sync_unavailable');
    const payload = rosterPayload(state, config);
    if (published) {
      if (!exactKeys(published.value, ['version', 'roster']) || published.value.version !== 1) fail(503, 'sync_unavailable');
      let previous;
      try { previous = await verifyJson(published.value.roster, config.signer.key, ROSTER_TYPE, config.signer.deviceId, MAX_STATE_BYTES); }
      catch { fail(503, 'sync_unavailable'); }
      if (previous.groupId !== config.groupId || !Number.isSafeInteger(previous.revision)
        || previous.revision > payload.revision) fail(503, 'sync_unavailable');
      if (previous.revision === payload.revision) {
        if (JSON.stringify(previous) !== JSON.stringify(payload)) fail(503, 'sync_unavailable');
        return { state, roster: published.value.roster };
      }
    }
    const roster = await signJson(payload, ROSTER_TYPE, config);
    try {
      await writeJson(rosterBlob, { version: 1, roster }, published?.etag);
      return { state, roster };
    } catch (error) {
      if (!isConflict(error)) fail(503, 'sync_unavailable');
    }
  }
  fail(503, 'sync_unavailable');
}

async function grants({ config, service, now }, deviceId) {
  const currentTime = now();
  const startsOn = new Date((currentTime - 30) * 1000);
  const expiresOn = new Date((currentTime + GRANT_SECONDS) * 1000);
  const delegation = await service.getUserDelegationKey(startsOn, new Date((currentTime + 600) * 1000), ioOptions());
  function grant(blobName, permissions, isDirectory = false) {
    const sas = generateBlobSASQueryParameters({ containerName: config.container, blobName,
      permissions: BlobSASPermissions.parse(permissions), isDirectory, protocol: SASProtocol.Https,
      startsOn, expiresOn, version: '2024-11-04' }, delegation, config.accountName).toString();
    return `${config.containerUrl}/${blobName}?${sas}`;
  }
  return { expiresAt: currentTime + GRANT_SECONDS, storage: {
    containerUrl: config.containerUrl,
    readUrl: grant('devices', 'r', true),
    createUrl: grant(`devices/${deviceId}/objects`, 'c', true),
    headUrl: grant(`devices/${deviceId}/head.json`, 'cw'),
    rosterUrl: grant(ROSTER_BLOB, 'r'),
  } };
}

async function execute(store, request) {
  const { config } = store;
  const invitation = request.action === 'invite' ? randomBytes(32).toString('base64url') : undefined;
  const committed = await transact(store, request, invitation);
  const { state, roster } = await publishRoster(store);
  const member = requireMember(state, request);
  const common = { version: 1, groupId: config.groupId, deviceId: request.deviceId,
    displayName: member.displayName, roster, rosterPublicKeySpki: config.signer.publicKeySpki };
  if (request.action === 'invite') {
    return { ...common, invitation, expiresAt: committed.invitations[sha256(invitation)].expiresAt,
      endpoint: config.endpoint, inviteUrl: invitationUrl(config, invitation) };
  }
  if (request.action === 'revoke' || request.action === 'rename') return common;
  const storage = await grants(store, request.deviceId);
  let update;
  try { update = await issueDeviceUpdate(config, request.deviceId, store.now()); } catch { /* Dataset access remains available. */ }
  return { ...common, ...storage, ...(update ? { update } : {}) };
}

function createSyncStore({ config, serviceClient, now = nowSeconds } = {}) {
  const service = serviceClient || new BlobServiceClient(`https://${config.accountName}.blob.core.windows.net`,
    new ManagedIdentityCredential(config.managedIdentityClientId ? { clientId: config.managedIdentityClientId } : {}),
    { retryOptions: { maxTries: 2, retryDelayInMs: 250, maxRetryDelayInMs: 1000 },
      loggingOptions: { logger: () => {} } });
  const container = service.getContainerClient(config.container);
  const store = { config, service, now, controlBlob: container.getBlockBlobClient(STATE_BLOB),
    rosterBlob: container.getBlockBlobClient(ROSTER_BLOB) };
  return { execute: (request) => execute(store, request) };
}

module.exports = { MAX_CAS_ATTEMPTS, MAX_STATE_BYTES, ROSTER_BLOB, STATE_BLOB,
  configurationUrl, createSyncStore, initialState, invitationUrl, validateState };
