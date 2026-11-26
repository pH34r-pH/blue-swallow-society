// Runs against the disposable Azurite namespace from the Functions container.
const assert = require('node:assert/strict');
const { generateKeyPairSync, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { join } = require('node:path');

const app = createRequire(join(process.cwd(), 'package.json'));
const { TableClient } = app('@azure/data-tables');
const { BlobServiceClient } = app('@azure/storage-blob');
const viewer = app('./_lib/viewer-session');
const { createCompanionAuthHandler } = app('./companion-auth');
const { createCompanionGuard } = app('./_lib/companion-auth');
const { createCompanionDatasetsHandler } = app('./companion-datasets');
const { createDatasetStore } = app('./_lib/companion-dataset-store');
const { initialState, STATE_BLOB, ROSTER_BLOB } = app('./_lib/wardriver-sync-store');
const { publicIdentity, rosterPayload, sha256, signJson, ROSTER_TYPE } = app('./_lib/wardriver-sync-auth');

const connection = 'UseDevelopmentStorage=true';
const origin = process.env.BLUE_SWALLOW_PUBLIC_ORIGIN;
const serviceClient = BlobServiceClient.fromConnectionString(connection, { retryOptions: { maxTries: 1 } });

function identity() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const spki = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
  return { ...publicIdentity(spki), privateKey: pair.privateKey };
}

async function group(groupId) {
  const owner = identity();
  const signer = identity();
  const container = serviceClient.getContainerClient(groupId);
  await container.create();
  const env = {
    ...process.env,
    BSS_WARDRIVER_VIEWER_DATASET_ENABLED: 'true',
    BSS_WARDRIVER_SYNC_GROUP_ID: groupId,
    BSS_WARDRIVER_SYNC_ACCOUNT_NAME: 'devstoreaccount1',
    BSS_WARDRIVER_SYNC_CONTAINER: container.containerName,
    BSS_WARDRIVER_SYNC_OWNER_PUBLIC_KEY_SPKI: owner.publicKeySpki,
    BSS_WARDRIVER_VIEWER_DATASET_ROSTER_PUBLIC_KEY_SPKI: signer.publicKeySpki,
  };
  const publisher = { groupId, owner, signer, ownerDisplayName: 'Fixture owner', signingKey: signer.privateKey };
  const state = initialState(publisher);
  const upload = (path, bytes) => container.getBlockBlobClient(path).uploadData(bytes);
  async function publish() {
    const roster = await signJson(rosterPayload(state, publisher), ROSTER_TYPE, publisher);
    await upload(STATE_BLOB, Buffer.from(JSON.stringify(state)));
    await upload(ROSTER_BLOB, Buffer.from(JSON.stringify({ version: 1, roster })));
  }

  const password = randomBytes(18).toString('base64url');
  const settings = viewer.config({ ...env, BLUE_SWALLOW_VIEWER_PASSWORD_SCRYPT: await viewer.encodePassword(password),
    BLUE_SWALLOW_VIEWER_SESSION_KEY: randomBytes(32).toString('base64url') });
  const auth = createCompanionAuthHandler({ getConfig: () => settings });
  const context = {};
  const headers = { origin, 'content-type': 'application/json' };
  await auth(context, { method: 'POST', params: { action: 'login' }, headers, body: { password } });
  assert.equal(context.res.status, 200, 'the fixture viewer signs in through the Table-backed login handler');
  headers['x-blue-swallow-operator-token'] = context.res.body.operatorSession.token;
  const authorize = createCompanionGuard({ getConfig: () => settings });
  let storeOpens = 0;
  async function read(session = { authorize, headers }, body) {
    const handler = createCompanionDatasetsHandler({ env, authorize: session.authorize,
      createStore: ({ config }) => { storeOpens++; return createDatasetStore({ config, serviceClient }); } });
    const result = {};
    await handler(result, { method: body ? 'POST' : 'GET', params: { action: body ? 'object' : 'roster' },
      headers: session.headers, body });
    return result.res;
  }
  return { owner, state, upload, publish, session: { authorize, headers }, read, storeOpens: () => storeOpens };
}

async function reference(group, deviceId) {
  const roster = await group.read();
  assert.equal(roster.status, 200, 'an enrolled viewer receives its signed roster');
  assert.equal(roster.body.groupId, group.state.groupId);
  const { version, revision, rosterSha256 } = roster.body;
  return { version, revision, rosterSha256, deviceId, object: 'head' };
}

function expectBytes(response, bytes, ref) {
  assert.equal(response.status, 200, 'an authorized object is readable');
  assert.equal(response.isRaw, true);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers['X-Blue-Swallow-Roster-Revision'], String(ref.revision));
  assert.equal(response.headers['X-Blue-Swallow-Roster-Sha256'], ref.rosterSha256);
  assert.deepEqual(response.body, bytes);
}

async function main() {
  process.env.BLUE_SWALLOW_VIEWER_SESSION_TABLE = 'datasetViewerSessions';
  process.env.BLUE_SWALLOW_PASSCODE_RATE_LIMIT_TABLE = 'datasetPasscodeFailures';
  for (const name of ['datasetViewerSessions', 'datasetPasscodeFailures']) {
    await TableClient.fromConnectionString(connection, name).createTable();
  }

  const first = await group('dataset-first');
  const second = await group('dataset-second');
  const peer = identity();
  first.state.devices[peer.deviceId] = { publicKeySpki: peer.publicKeySpki, displayName: 'Fixture peer', status: 'active' };
  await first.publish();
  await second.publish();

  const head = Buffer.from('fixture mutable head');
  const history = Buffer.from([0, 255, 1, 128, 10]);
  const object = sha256(history);
  await first.upload(`devices/${peer.deviceId}/head.json`, head);
  await first.upload(`devices/${peer.deviceId}/objects/${object}`, history);
  const secondHead = Buffer.from('second group head');
  await second.upload(`devices/${second.owner.deviceId}/head.json`, secondHead);
  await first.upload(`devices/${second.owner.deviceId}/head.json`, secondHead);

  const firstRef = await reference(first, peer.deviceId);
  const secondRef = await reference(second, second.owner.deviceId);
  expectBytes(await first.read(first.session, firstRef), head, firstRef);
  expectBytes(await second.read(second.session, secondRef), secondHead, secondRef);

  const opens = first.storeOpens();
  assert.equal((await first.read({ ...first.session, headers: {} })).status, 401);
  assert.equal((await first.read({ ...first.session, headers: second.session.headers }, firstRef)).status, 401);
  assert.equal((await first.read(second.session, firstRef)).status, 403,
    'the dataset boundary rejects a viewer authenticated by the other group');
  assert.equal(first.storeOpens(), opens, 'denied requests never open private Blob storage');
  assert.equal((await first.read(first.session, { ...firstRef, deviceId: second.owner.deviceId })).status, 404,
    'a stored head for an unlisted device stays private');

  first.state.rosterRevision++;
  Object.assign(first.state.devices[peer.deviceId], { status: 'revoked', acceptedThrough: { sequence: 0, commitHash: null } });
  await first.publish();
  const revokedRef = await reference(first, peer.deviceId);
  assert.equal((await first.read(first.session, firstRef)).status, 409, 'a prior roster cannot authorize a new read');
  assert.equal((await first.read(first.session, revokedRef)).status, 404, 'revocation hides the mutable head');
  expectBytes(await first.read(first.session, { ...revokedRef, object }), history, revokedRef);
  console.log('Verified group-scoped viewer reads and signed roster revocation against Azurite Blob and Tables.');
}

main().catch((error) => {
  console.error(error instanceof assert.AssertionError ? error.message : `Disposable dataset check failed (${error.statusCode || error.name})`);
  process.exitCode = 1;
});
