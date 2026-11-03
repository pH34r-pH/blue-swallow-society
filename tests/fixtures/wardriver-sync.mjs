import { createRequire } from 'node:module';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

const require = createRequire(import.meta.url);
const auth = require('../../api/_lib/wardriver-sync-auth');
const { createSyncStore } = require('../../api/_lib/wardriver-sync-store');
const { handle } = require('../../api/wardriver-sync')._internals;

export function device(modulusLength = 2048) {
  const pair = generateKeyPairSync('rsa', { modulusLength });
  const publicKeySpki = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
  return { ...pair, publicKeySpki, deviceId: auth.sha256(pair.publicKey.export({ format: 'der', type: 'spki' })) };
}

export function fixture() {
  const owner = device();
  const signer = device();
  const env = {
    BSS_WARDRIVER_SYNC_ENABLED: 'true',
    BSS_WARDRIVER_SYNC_GROUP_ID: 'fixture_group',
    BSS_WARDRIVER_SYNC_ENDPOINT: 'https://fixture.invalid/api/wardriver-sync',
    BSS_WARDRIVER_SYNC_ACCOUNT_NAME: 'fixtureaccount',
    BSS_WARDRIVER_SYNC_CONTAINER: 'fixture-group',
    BSS_WARDRIVER_SYNC_OWNER_PUBLIC_KEY_SPKI: owner.publicKeySpki,
    BSS_WARDRIVER_SYNC_ROSTER_PRIVATE_KEY_PEM: signer.privateKey.export({ format: 'pem', type: 'pkcs8' }),
  };
  let time = 1800000000;
  return { owner, signer, env, config: auth.readConfig(env), now: () => time, advance: (seconds) => { time += seconds; } };
}

export async function signRequest(f, who, action, fields = {}, overrides = {}) {
  const ticket = await auth.challenge({ version: 1, publicKeySpki: who.publicKeySpki }, f.config, f.now());
  const payload = { version: 1, groupId: f.config.groupId, action, publicKeySpki: who.publicKeySpki,
    challenge: ticket.challenge, ...fields, ...overrides.payload };
  const { CompactSign } = await import('../../api/node_modules/jose/dist/webapi/index.js');
  const proof = await new CompactSign(Buffer.from(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'RS256', typ: auth.REQUEST_TYPE, kid: who.deviceId, ...overrides.header })
    .sign(overrides.privateKey || who.privateKey);
  return { proof };
}

function storageError(statusCode, code) { return Object.assign(new Error(code), { statusCode, code }); }

export function fakeStorage() {
  const entries = new Map();
  const operations = [];
  const hooks = {};
  let revision = 0;
  const service = {
    getContainerClient(name) {
      operations.push({ operation: 'container', name });
      return { getBlockBlobClient(blobName) {
        return {
          async download(offset, count) {
            operations.push({ operation: 'read', blobName, offset, count });
            await hooks.beforeRead?.(blobName);
            const saved = entries.get(blobName);
            if (!saved) throw storageError(404, 'BlobNotFound');
            return { readableStreamBody: Readable.from([saved.bytes.subarray(offset, offset + count)]),
              contentLength: saved.bytes.length, etag: saved.etag };
          },
          async uploadData(bytes, options) {
            await hooks.beforeWrite?.(blobName, bytes, options);
            const existing = entries.get(blobName);
            const conditions = options.conditions;
            if ((conditions.ifNoneMatch === '*' && existing)
              || (conditions.ifMatch && existing?.etag !== conditions.ifMatch)) throw storageError(412, 'ConditionNotMet');
            const etag = `"${++revision}"`;
            entries.set(blobName, { bytes: Buffer.from(bytes), etag });
            operations.push({ operation: 'write', blobName, conditions });
            await hooks.afterWrite?.(blobName, bytes, options);
            return { etag };
          },
        };
      } };
    },
    async getUserDelegationKey(startsOn, expiresOn) {
      operations.push({ operation: 'delegation', startsOn, expiresOn });
      await hooks.delegation?.();
      return { signedObjectId: '11111111-1111-1111-1111-111111111111',
        signedTenantId: '22222222-2222-2222-2222-222222222222', signedStartsOn: startsOn,
        signedExpiresOn: expiresOn, signedService: 'b', signedVersion: '2024-11-04',
        value: randomBytes(32).toString('base64') };
    },
  };
  return { service, entries, operations, hooks,
    read: (name) => JSON.parse(entries.get(name).bytes.toString()),
    set: (name, value) => entries.set(name, { etag: `"${++revision}"`, bytes: Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value)) }) };
}

export async function invoke(f, action, body, options = {}) {
  const logs = [];
  const context = { log: { error: (...items) => logs.push(items) } };
  const storage = options.storage || fakeStorage();
  let constructions = 0;
  await handle(context, { method: options.method || 'POST', params: { action }, body,
    ...options.req }, { env: options.env || f.env, now: f.now,
    createStore: options.createStore || (({ config, now }) => {
      constructions += 1;
      return createSyncStore({ config, now, serviceClient: storage.service });
    }) });
  return { ...context.res, logs, storage, constructions };
}

export async function invite(f, storage) {
  return invoke(f, 'invite', await signRequest(f, f.owner, 'invite'), { storage });
}

export async function enroll(f, storage, who, invitation, displayName = 'Friend phone') {
  return invoke(f, 'enroll', await signRequest(f, who, 'enroll', { invitation, displayName }), { storage });
}

export async function decodeRoster(f, roster) {
  return auth.verifyJson(roster, f.signer.publicKey, auth.ROSTER_TYPE, f.signer.deviceId, 128 * 1024);
}
