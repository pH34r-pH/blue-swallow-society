'use strict';

const { createHash, createPrivateKey, createPublicKey, randomBytes } = require('node:crypto');

const REQUEST_TYPE = 'wardriver.sync.request.v1';
const CHALLENGE_TYPE = 'wardriver.sync.challenge.v1';
const ROSTER_TYPE = 'wardriver.sync.roster.v1';
const CHALLENGE_SECONDS = 120;
const GRANT_SECONDS = 300;
const MAX_BODY_BYTES = 16 * 1024;
const DEVICE_ID = /^[a-f0-9]{64}$/;
const GROUP_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ACTIONS = new Set(['enroll', 'grants', 'invite', 'rename', 'revoke']);

class SyncAccessError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'SyncAccessError';
    this.status = status;
    this.code = code;
  }
}

function fail(status, code) { throw new SyncAccessError(status, code); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, required, optional = []) {
  return isRecord(value) && required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function decodeBase64Url(value, maxBytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)
    || value.length > Math.ceil(maxBytes * 4 / 3)) fail(400, 'invalid_request');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length > maxBytes || decoded.toString('base64url') !== value) fail(400, 'invalid_request');
  return decoded;
}

function publicIdentity(spki) {
  try {
    const der = decodeBase64Url(spki, 1024);
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'rsa' || ![2048, 4096].includes(key.asymmetricKeyDetails?.modulusLength)
      || key.asymmetricKeyDetails?.publicExponent !== 65537n
      || !key.export({ format: 'der', type: 'spki' }).equals(der)) fail(400, 'invalid_request');
    return { key, publicKeySpki: spki, deviceId: sha256(der) };
  } catch { fail(400, 'invalid_request'); }
}

function displayName(value) {
  if (typeof value !== 'string' || value.length > 64 || !value.trim()
    || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) fail(400, 'invalid_request');
  return value.trim();
}

function readConfig(env = process.env) {
  try {
    if (env.BSS_WARDRIVER_SYNC_ENABLED !== 'true') fail(503, 'sync_unavailable');
    const groupId = env.BSS_WARDRIVER_SYNC_GROUP_ID;
    const endpoint = env.BSS_WARDRIVER_SYNC_ENDPOINT;
    const url = new URL(endpoint);
    const accountName = env.BSS_WARDRIVER_SYNC_ACCOUNT_NAME;
    const container = env.BSS_WARDRIVER_SYNC_CONTAINER;
    if (!GROUP_ID.test(groupId || '') || url.protocol !== 'https:' || url.port || url.username || url.password
      || url.search || url.hash || url.pathname !== '/api/wardriver-sync' || url.href !== endpoint
      || !/^[a-z0-9]{3,24}$/.test(accountName || '')
      || !/^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/.test(container || '') || container.includes('--')) {
      fail(503, 'sync_unavailable');
    }
    const owner = publicIdentity(env.BSS_WARDRIVER_SYNC_OWNER_PUBLIC_KEY_SPKI);
    const pem = env.BSS_WARDRIVER_SYNC_ROSTER_PRIVATE_KEY_PEM;
    if (typeof pem !== 'string' || pem.length > 8192 || !pem.startsWith('-----BEGIN PRIVATE KEY-----')) {
      fail(503, 'sync_unavailable');
    }
    const signingKey = createPrivateKey({ key: pem, format: 'pem', type: 'pkcs8' });
    const signer = publicIdentity(createPublicKey(signingKey).export({ format: 'der', type: 'spki' }).toString('base64url'));
    if (signer.deviceId === owner.deviceId) fail(503, 'sync_unavailable');
    const maxDevicesText = env.BSS_WARDRIVER_SYNC_MAX_DEVICES || '5';
    const maxDevices = Number(maxDevicesText);
    if (!/^[1-5]$/.test(maxDevicesText) || maxDevices < 1 || maxDevices > 5) fail(503, 'sync_unavailable');
    const managedIdentityClientId = env.BSS_WARDRIVER_SYNC_MANAGED_IDENTITY_CLIENT_ID;
    if (managedIdentityClientId !== undefined
      && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(managedIdentityClientId)) {
      fail(503, 'sync_unavailable');
    }
    return Object.freeze({ groupId, endpoint, accountName, container, owner, signer, signingKey, maxDevices,
      managedIdentityClientId, ownerDisplayName: displayName(env.BSS_WARDRIVER_SYNC_OWNER_NAME || 'Owner device'),
      containerUrl: `https://${accountName}.blob.core.windows.net/${container}` });
  } catch { fail(503, 'sync_unavailable'); }
}

function parseJson(bytes) {
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!isRecord(value)) fail(400, 'invalid_request');
    return value;
  } catch { fail(400, 'invalid_request'); }
}

function parseBody(req) {
  try {
    const raw = req?.rawBody ?? (typeof req?.body === 'string' || Buffer.isBuffer(req?.body)
      ? req.body : JSON.stringify(req?.body));
    if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) fail(400, 'invalid_request');
    const bytes = Buffer.from(raw);
    if (bytes.length > MAX_BODY_BYTES) fail(413, 'request_too_large');
    return parseJson(bytes);
  } catch (error) {
    if (error instanceof SyncAccessError) throw error;
    fail(400, 'invalid_request');
  }
}

async function signJson(payload, type, config) {
  const { CompactSign } = await import('jose');
  return new CompactSign(Buffer.from(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'RS256', typ: type, kid: config.signer.deviceId }).sign(config.signingKey);
}

async function verifyJson(jws, key, type, kid, maxBytes = MAX_BODY_BYTES) {
  if (typeof jws !== 'string' || jws.length > maxBytes || jws.split('.').length !== 3) fail(401, 'invalid_proof');
  try {
    const parts = jws.split('.');
    const header = parseJson(decodeBase64Url(parts[0], 512));
    if (!exactKeys(header, ['alg', 'typ', 'kid']) || header.alg !== 'RS256' || header.typ !== type
      || header.kid !== kid) fail(401, 'invalid_proof');
    decodeBase64Url(parts[1], maxBytes);
    decodeBase64Url(parts[2], 512);
    const { compactVerify } = await import('jose');
    const result = await compactVerify(jws, key, { algorithms: ['RS256'] });
    return parseJson(result.payload);
  } catch { fail(401, 'invalid_proof'); }
}

async function challenge(body, config, now = Math.floor(Date.now() / 1000)) {
  if (!exactKeys(body, ['version', 'publicKeySpki']) || body.version !== 1) fail(400, 'invalid_request');
  const identity = publicIdentity(body.publicKeySpki);
  const payload = { version: 1, groupId: config.groupId, audience: config.endpoint,
    deviceId: identity.deviceId, nonce: randomBytes(32).toString('base64url'),
    issuedAt: now, expiresAt: now + CHALLENGE_SECONDS };
  return { version: 1, groupId: config.groupId, deviceId: identity.deviceId,
    challenge: await signJson(payload, CHALLENGE_TYPE, config), expiresAt: payload.expiresAt,
    rosterPublicKeySpki: config.signer.publicKeySpki };
}

function validateFields(payload, action) {
  const common = ['version', 'groupId', 'action', 'publicKeySpki', 'challenge'];
  const required = { enroll: ['invitation', 'displayName'], grants: [], invite: [], rename: ['displayName'],
    revoke: ['targetDeviceId', 'acceptedThrough'] }[action];
  if (!exactKeys(payload, [...common, ...required], action === 'invite' ? ['expiresInSeconds'] : [])) {
    fail(400, 'invalid_request');
  }
  if (action === 'enroll' && (typeof payload.invitation !== 'string'
    || !/^[A-Za-z0-9_-]{43}$/.test(payload.invitation)
    || decodeBase64Url(payload.invitation, 32).length !== 32)) fail(400, 'invalid_request');
  const fields = {};
  if (action === 'enroll') fields.invitation = payload.invitation;
  if (['enroll', 'rename'].includes(action)) fields.displayName = displayName(payload.displayName);
  if (action === 'invite') {
    fields.expiresInSeconds = payload.expiresInSeconds ?? 86400;
    if (!Number.isSafeInteger(fields.expiresInSeconds) || fields.expiresInSeconds < 300
      || fields.expiresInSeconds > 604800) fail(400, 'invalid_request');
  }
  if (action === 'revoke') {
    const cutoff = payload.acceptedThrough;
    if (!DEVICE_ID.test(payload.targetDeviceId || '') || !exactKeys(cutoff, ['sequence', 'commitHash'])
      || !Number.isSafeInteger(cutoff.sequence) || cutoff.sequence < 0
      || (cutoff.sequence === 0 ? cutoff.commitHash !== null : !DEVICE_ID.test(cutoff.commitHash || ''))) {
      fail(400, 'invalid_request');
    }
    fields.targetDeviceId = payload.targetDeviceId;
    fields.acceptedThrough = { sequence: cutoff.sequence, commitHash: cutoff.commitHash };
  }
  return fields;
}

async function verifyProof(body, action, config, now = Math.floor(Date.now() / 1000)) {
  if (!ACTIONS.has(action) || !exactKeys(body, ['proof']) || typeof body.proof !== 'string'
    || body.proof.length > MAX_BODY_BYTES) fail(400, 'invalid_request');
  let identity;
  let payload;
  let ticket;
  try {
    const parts = body.proof.split('.');
    if (parts.length !== 3) fail(401, 'invalid_proof');
    const untrusted = parseJson(decodeBase64Url(parts[1], MAX_BODY_BYTES));
    identity = publicIdentity(untrusted.publicKeySpki);
    payload = await verifyJson(body.proof, identity.key, REQUEST_TYPE, identity.deviceId);
    if (payload.version !== 1 || payload.groupId !== config.groupId || payload.action !== action) fail(401, 'invalid_proof');
    ticket = await verifyJson(payload.challenge, config.signer.key, CHALLENGE_TYPE, config.signer.deviceId);
    if (!exactKeys(ticket, ['version', 'groupId', 'audience', 'deviceId', 'nonce', 'issuedAt', 'expiresAt'])
      || ticket.version !== 1 || ticket.groupId !== config.groupId || ticket.audience !== config.endpoint
      || ticket.deviceId !== identity.deviceId || typeof ticket.nonce !== 'string'
      || !/^[A-Za-z0-9_-]{43}$/.test(ticket.nonce) || decodeBase64Url(ticket.nonce, 32).length !== 32
      || !Number.isSafeInteger(ticket.issuedAt) || !Number.isSafeInteger(ticket.expiresAt)
      || ticket.expiresAt - ticket.issuedAt !== CHALLENGE_SECONDS || ticket.issuedAt > now + 5) fail(401, 'invalid_proof');
  } catch { fail(401, 'invalid_proof'); }
  if (ticket.expiresAt <= now) fail(401, 'challenge_expired');
  return { action, deviceId: identity.deviceId, publicKeySpki: identity.publicKeySpki,
    nonce: ticket.nonce, challengeExpiresAt: ticket.expiresAt, fields: validateFields(payload, action) };
}

function rosterPayload(state, config) {
  return { version: 1, groupId: config.groupId, revision: state.rosterRevision,
    ownerDeviceId: config.owner.deviceId,
    devices: Object.entries(state.devices).sort(([left], [right]) => left.localeCompare(right)).map(([deviceId, member]) => ({
      deviceId, publicKeySpki: member.publicKeySpki, displayName: member.displayName, status: member.status,
      ...(member.status === 'revoked' ? { acceptedThrough: member.acceptedThrough } : {}),
    })) };
}

module.exports = { ACTIONS, CHALLENGE_SECONDS, CHALLENGE_TYPE, DEVICE_ID, GRANT_SECONDS, GROUP_ID,
  MAX_BODY_BYTES, REQUEST_TYPE, ROSTER_TYPE, SyncAccessError, challenge, decodeBase64Url, displayName,
  exactKeys, fail, isRecord, parseBody, publicIdentity, readConfig, rosterPayload, sha256, signJson,
  validateFields, verifyJson, verifyProof };
