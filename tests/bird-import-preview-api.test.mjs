import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createHandler } = require('../api/bird-import-preview');
const owner = require('../api/shared/owner-session.cjs');
const { fixture } = require('./helpers/viewer-fixture.cjs');
const viewer = require('../api/_lib/viewer-session');
Object.assign(process.env, { BLUE_SWALLOW_AUTH_MODE: 'password', BLUE_SWALLOW_ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
  BLUE_SWALLOW_ENTRA_CLIENT_ID: '22222222-2222-2222-2222-222222222222', BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: '33333333-3333-3333-3333-333333333333',
  BLUE_SWALLOW_OWNER_SESSION_KEY: 'synthetic-owner-session-key-at-least-thirty-two-bytes', BLUE_SWALLOW_PUBLIC_ORIGIN: 'https://owner.example.test' });
const config = owner.ownerConfig();
const token = owner.createOwnerSession({ iss: config.issuer, aud: config.audience, tid: config.tenant, oid: config.owner,
  exp: Math.floor(Date.now() / 1000) + 3600 }, config).token;
const csv = 'Submission ID,Common Name,Scientific Name,Count,Date\nS1,Test bird,Test avis,X,2026-01-02\n';
const body = { csvBase64: Buffer.from(csv).toString('base64') };
const headers = { origin: process.env.BLUE_SWALLOW_PUBLIC_ORIGIN, 'content-type': 'application/json', 'x-blue-swallow-operator-token': token };
async function call(handler, changes = {}) {
  const context = {}; await handler(context, { method: 'POST', query: {}, headers, body, ...changes }); return context.res;
}
test('only an owner can preview and denial happens before private body access', async () => {
  const f = await fixture(); Object.assign(process.env, f.env, { BLUE_SWALLOW_PUBLIC_ORIGIN: headers.origin });
  const viewerRecord = await f.store.create(f.settings); const viewerToken = viewer.signSession(viewerRecord, f.settings).token;
  const handler = createHandler(); let reads = 0;
  for (const credential of ['', viewerToken]) {
    const request = { method: 'POST', headers: { ...headers, 'x-blue-swallow-operator-token': credential },
      get body() { reads++; throw new Error('PRIVATE'); } };
    const context = {}; await handler(context, request); assert.ok(context.res.status === 401 || context.res.status === 403);
  }
  assert.equal(reads, 0);
  const conflicting = await call(handler, { headers: { ...headers, cookie: `${owner.COOKIE}=${token}`,
    'x-blue-swallow-operator-token': viewerToken } });
  assert.equal(conflicting.status, 403);
  const result = await call(handler); assert.equal(result.status, 200); assert.equal(result.body.publishes, false);
  assert.equal(result.body.candidates[0].countKind, 'presence'); assert.match(result.headers['Cache-Control'], /no-store/);
});
test('origin, method, content type, request shape, encoding and size fail closed with redacted errors', async () => {
  const handler = createHandler();
  for (const [changes, status] of [[{ method: 'GET' }, 405], [{ query: { x: '1' } }, 405],
    [{ headers: { ...headers, origin: 'https://attacker.test' } }, 403],
    [{ headers: { ...headers, 'content-type': 'text/csv' } }, 415],
    [{ body: { ...body, extra: 'PRIVATE' } }, 400], [{ body: { csvBase64: 'YQ' } }, 400],
    [{ body: { csvBase64: Buffer.from('unsupported').toString('base64') } }, 400],
    [{ rawBody: 'x'.repeat(14 * 1024 * 1024) }, 400]]) {
    const result = await call(handler, changes); assert.equal(result.status, status); assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  }
  const failed = await call(createHandler({ preview: () => { throw new Error('PRIVATE secret'); } }));
  assert.equal(failed.status, 503); assert.doesNotMatch(JSON.stringify(failed), /PRIVATE|secret/);
  assert.equal((await call(createHandler({ mode: () => 'legacy' }))).status, 403);
});
