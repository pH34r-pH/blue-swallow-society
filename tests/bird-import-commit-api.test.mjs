import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createHandler } = require('../api/bird-import-commit');
const { prepareDraftImport } = require('../api/_lib/bird-draft-import');
const owner = require('../api/shared/owner-session.cjs');
const { fixture } = require('./helpers/viewer-fixture.cjs');
const viewer = require('../api/_lib/viewer-session');
Object.assign(process.env, { BLUE_SWALLOW_AUTH_MODE: 'password', BLUE_SWALLOW_ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
  BLUE_SWALLOW_ENTRA_CLIENT_ID: '22222222-2222-2222-2222-222222222222', BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: '33333333-3333-3333-3333-333333333333',
  BLUE_SWALLOW_OWNER_SESSION_KEY: 'synthetic-owner-session-key-at-least-thirty-two-bytes', BLUE_SWALLOW_PUBLIC_ORIGIN: 'https://owner.example.test' });
const cfg = owner.ownerConfig(); const token = owner.createOwnerSession({ iss: cfg.issuer, aud: cfg.audience, tid: cfg.tenant,
  oid: cfg.owner, exp: Math.floor(Date.now() / 1000) + 3600 }, cfg).token;
const headers = { origin: process.env.BLUE_SWALLOW_PUBLIC_ORIGIN, 'content-type': 'application/json', 'x-blue-swallow-operator-token': token };
const csv = Buffer.from('Submission ID,Common Name,Scientific Name,Count,Date\nS1,Test,Test avis,X,2026-01-02\n');
function fixtureStore() {
  let snapshot = { version: 1, revision: 0, records: [] }, etag = null; let writes = 0;
  return { async read() { return { snapshot: structuredClone(snapshot), etag }; }, async write(next, expected) {
    if (etag !== expected.etag || snapshot.revision !== expected.revision) throw new Error('bird_snapshot_conflict');
    snapshot = structuredClone(next); etag = `tag-${++writes}`; return { revision: snapshot.revision };
  }, get writes() { return writes; } };
}
async function call(handler, changes = {}) { const context = {}; await handler(context, { method: 'POST', query: {}, headers, ...changes }); return context.res; }
test('owner commits only selected reviewed drafts; stale replay is rejected', async () => {
  const store = fixtureStore(), plan = prepareDraftImport(csv, (await store.read()).snapshot);
  const handler = createHandler({ createStore: () => store });
  const body = { csvBase64: csv.toString('base64'), revision: plan.revision, digest: plan.digest, selectedRows: [2] };
  const result = await call(handler, { body }); assert.equal(result.status, 200);
  assert.deepEqual(result.body, { revision: 1, imported: 1, publication: 'draft' });
  assert.equal((await store.read()).snapshot.records[0].publication, 'draft');
  assert.equal((await call(handler, { body })).status, 409); assert.equal(store.writes, 1);
});
test('viewer, cross-origin, malformed and changed previews fail before writing', async () => {
  const store = fixtureStore(), plan = prepareDraftImport(csv, (await store.read()).snapshot); let constructed = 0;
  const handler = createHandler({ createStore: () => { constructed++; return store; } });
  const body = { csvBase64: csv.toString('base64'), revision: 0, digest: plan.digest, selectedRows: [2] };
  const f = await fixture(); Object.assign(process.env, f.env, { BLUE_SWALLOW_PUBLIC_ORIGIN: headers.origin });
  const viewerToken = viewer.signSession(await f.store.create(f.settings), f.settings).token;
  assert.equal((await call(handler, { headers: { ...headers, 'x-blue-swallow-operator-token': viewerToken }, body })).status, 403);
  assert.equal((await call(handler, { headers: { ...headers, origin: 'https://attacker.test' }, body })).status, 403);
  assert.equal((await call(handler, { body: { ...body, selectedRows: [2, 2] } })).status, 400);
  assert.equal((await call(handler, { body: { ...body, digest: 'f'.repeat(64) } })).status, 409);
  assert.equal((await call(handler, { body: { ...body, private: 'SECRET' } })).status, 400);
  assert.equal(store.writes, 0); assert.equal(constructed, 2);
  const failed = await call(createHandler({ createStore: () => { throw new Error('SECRET'); } }), { body });
  assert.equal(failed.status, 503); assert.doesNotMatch(JSON.stringify(failed), /SECRET/);
});
