import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fixture } = require('./helpers/viewer-fixture.cjs');
const viewer = require('../api/_lib/viewer-session');
const { createCompanionGuard } = require('../api/_lib/companion-auth');
const { createCompanionUiHandler } = require('../api/companion-ui');
const { projectPublicJournal, createBirdJournalHandler } = require('../api/bird-journal');

test('private companion files require a live viewer session and a fixed allowlist before filesystem reads', async () => {
  const f = await fixture(); Object.assign(process.env, f.env);
  const record = await f.store.create(f.settings);
  const session = viewer.signSession(record, f.settings);
  const headers = { 'x-blue-swallow-operator-token': session.token, origin: f.settings.origin };
  let reads = 0;
  const handler = createCompanionUiHandler({ authorize: createCompanionGuard({ getConfig: () => f.settings, createStore: () => f.store }),
    readFile: async () => { reads++; return 'private fixture'; } });
  async function call(changes = {}) {
    const context = {};
    await handler(context, { method: 'GET', params: { asset: 'shell.html' }, query: {}, headers, ...changes });
    return context.res;
  }
  assert.equal((await call({ headers: {} })).status, 401);
  assert.equal(reads, 0);
  for (const changes of [{ params: { asset: '../operator/shell.html' } }, { params: { asset: 'constructor' } },
    { params: { asset: 'main.js' } }, { query: { token: session.token } }, { method: 'POST' }]) {
    assert.equal((await call(changes)).status, 404);
  }
  assert.equal(reads, 0);
  const success = await call(); assert.equal(success.status, 200); assert.match(success.headers['Cache-Control'], /no-store/);
  assert.equal((await call({ method: 'HEAD' })).body, undefined); assert.equal(reads, 1);
  for (const asset of ['dataset-client.mjs', 'dataset-worker.js']) {
    assert.equal((await call({ params: { asset }, headers: {} })).status, 401);
    assert.equal((await call({ params: { asset } })).status, 200);
  }
  await f.store.revoke(viewer.verifyToken(session.token, f.settings));
  assert.equal((await call()).status, 401); assert.equal(reads, 3);
});
test('public projection strips private fields, requires publication and preserves presence-only counts', async () => {
  const post = { published: true, id: 'synthetic-note', title: 'Test note', paragraphs: ['Text, not HTML.'],
    publishedOn: '2026-11-10', observedOn: '2026-11-01', latitude: 47.123, accountId: 'private-account', rawImport: 'PRIVATE' };
  const sighting = { published: true, id: 'synthetic-sighting', speciesId: 'test-bird', commonName: 'Test bird',
    observedOn: '2026-11-01', count: 'X', longitude: -122.123, privateNotes: 'PRIVATE' };
  const value = { version: 1, posts: [post, { ...post, id: 'draft', published: false }], sightings: [sighting] };
  const published = projectPublicJournal(value);
  assert.equal(published.posts.length, 1); assert.equal(published.sightings[0].count, null);
  assert.doesNotMatch(JSON.stringify(published), /latitude|longitude|accountId|rawImport|privateNotes|PRIVATE|draft/);
  post.published = false; sighting.published = false;
  assert.deepEqual(projectPublicJournal(value).posts, []); assert.deepEqual(projectPublicJournal(value).sightings, []);
  const handler = createBirdJournalHandler({ readPublication: async () => value });
  const context = {}; await handler(context, { method: 'GET' });
  assert.equal(context.res.status, 200); assert.equal(context.res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(context.res.body.posts, []);
});
test('malformed public publication and storage failures never expose raw source or draft fallback', async () => {
  for (const readPublication of [async () => ({ version: 2, rawExport: 'PRIVATE' }), async () => { throw new Error('PRIVATE'); }]) {
    const handler = createBirdJournalHandler({ readPublication }); const context = {};
    await handler(context, { method: 'GET' }); assert.equal(context.res.status, 503);
    assert.doesNotMatch(JSON.stringify(context.res), /PRIVATE|rawExport/);
    await handler(context, { method: 'HEAD' }); assert.equal(context.res.status, 503);
    assert.equal(context.res.body, undefined);
  }
});
