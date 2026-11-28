import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Independent cases for spec/features/bird-history/index.md. Expected values come
// from the specification text, never from running the implementation.
const { previewBirdExport } = require('../api/_lib/bird-export-preview');
const { applyDraftImport } = require('../api/_lib/bird-draft-import');
const { planBirdPublication } = require('../api/_lib/bird-publication-plan');
const { createHandler: createPreview } = require('../api/bird-import-preview');
const { createHandler: createCommit } = require('../api/bird-import-commit');
const owner = require('../api/shared/owner-session.cjs');
const viewer = require('../api/_lib/viewer-session');
const { fixture } = require('./helpers/viewer-fixture.cjs');

const HEADER = 'Submission ID,Common Name,Scientific Name,Count,Date\n';
const preview = (rows) => previewBirdExport(Buffer.from(HEADER + rows.join('\n') + '\n'));
const row = (id = 'S1', common = 'Test bird', scientific = 'Test avis', count = 'X', date = '2026-01-02') =>
  `${id},${common},${scientific},${count},${date}`;

test('BH-FR-005 count, date, identifier and name limits decide candidate or rejected', () => {
  const valid = [row('S1', 'a', 'b', '12'), row('s2', 'a', 'b', 'X'), row('S3', 'a', 'b', ''),
    row('S4', 'c'.repeat(120), 's'.repeat(160), '123456789'), row('S' + '5'.repeat(20), 'a', 'b', '1')];
  const invalid = [row('S6', 'a', 'b', '0'), row('S7', 'a', 'b', '007'), row('S8', 'a', 'b', '1234567890'),
    row('S9', 'a', 'b', '-1'), row('S10', 'a', 'b', '1.5'), row('S11', 'a', 'b', 'x'), row('S12', 'a', 'b', 'many'),
    row('S13', 'a', 'b', '1', '2026-02-30'), row('S14', 'a', 'b', '1', '2026-1-2'), row('S15', 'a', 'b', '1', '02/01/2026'),
    row('S', 'a', 'b'), row('X16', 'a', 'b'), row('S' + '7'.repeat(21), 'a', 'b'),
    row('S17', 'c'.repeat(121), 'b'), row('S18', 'a', 's'.repeat(161)), row('S19', '', 'b'), row('S20', 'a', '')];
  const result = preview([...valid, ...invalid]);
  assert.equal(result.candidates.length, valid.length);
  assert.equal(result.rejected.length, invalid.length);
  assert.ok(result.rejected.every((entry) => entry.reason === 'invalid_required_value' && Number.isInteger(entry.row)));
  assert.deepEqual(result.candidates.map((entry) => entry.countKind), ['exact', 'presence', 'unknown', 'exact', 'exact']);
  assert.deepEqual(result.candidates.map((entry) => entry.count), [12, null, null, 123456789, 1]);
});

test('BH-FR-006 provisional keys ignore letter case, flag duplicates and keep different submissions apart', () => {
  const result = preview([row('S1', 'Test bird', 'Test avis'), row('s1', 'Other name', 'TEST AVIS'), row('S2', 'Test bird', 'Test avis')]);
  const [first, second, third] = result.candidates;
  const key = (id, name) => createHash('sha256').update(`${id}\0${name}`).digest('hex');
  assert.equal(first.provisionalKey, key('S1', 'test avis'));
  assert.equal(second.provisionalKey, first.provisionalKey);
  assert.deepEqual([first.identity, second.identity, third.identity], ['ambiguous', 'ambiguous', 'provisional']);
  assert.notEqual(third.provisionalKey, first.provisionalKey);
  assert.ok(result.candidates.every((entry) => entry.publication === 'draft'));
  assert.equal(result.publishes, false);
  assert.equal(result.summary.ambiguous, 2);
});

const FAKE_ENV = { BLUE_SWALLOW_AUTH_MODE: 'password', BLUE_SWALLOW_ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
  BLUE_SWALLOW_ENTRA_CLIENT_ID: '22222222-2222-2222-2222-222222222222', BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: '33333333-3333-3333-3333-333333333333',
  BLUE_SWALLOW_OWNER_SESSION_KEY: 'synthetic-owner-session-key-at-least-thirty-two-bytes', BLUE_SWALLOW_PUBLIC_ORIGIN: 'https://owner.example.test' };
function ownerToken() {
  Object.assign(process.env, FAKE_ENV);
  const config = owner.ownerConfig();
  return owner.createOwnerSession({ iss: config.issuer, aud: config.audience, tid: config.tenant, oid: config.owner,
    exp: Math.floor(Date.now() / 1000) + 3600 }, config).token;
}
const headersFor = (token) => ({ origin: FAKE_ENV.BLUE_SWALLOW_PUBLIC_ORIGIN, 'content-type': 'application/json',
  'x-blue-swallow-operator-token': token });

test('BH-FR-001 save denies absent and viewer credentials before reading its body', async () => {
  const token = ownerToken();
  const f = await fixture(); Object.assign(process.env, f.env, { BLUE_SWALLOW_PUBLIC_ORIGIN: FAKE_ENV.BLUE_SWALLOW_PUBLIC_ORIGIN });
  const viewerToken = viewer.signSession(await f.store.create(f.settings), f.settings).token;
  const handler = createCommit({ createStore: () => { throw new Error('store must not be opened'); } });
  let reads = 0;
  for (const credential of ['', viewerToken]) {
    const request = { method: 'POST', query: {}, headers: headersFor(credential),
      get body() { reads++; throw new Error('PRIVATE'); } };
    const context = {}; await handler(context, request);
    assert.ok([401, 403].includes(context.res.status), String(context.res.status));
  }
  assert.equal(reads, 0);
  assert.ok(token.length > 0);
});

test('BH-FR-007 a preview with storage enabled never writes', async () => {
  const token = ownerToken();
  let writes = 0, reads = 0;
  const store = { async read() { reads++; return { snapshot: { version: 1, revision: 0, records: [] }, etag: null }; },
    async write() { writes++; throw new Error('a preview must not write'); } };
  const handler = createPreview({ env: { BLUE_SWALLOW_PUBLIC_ORIGIN: FAKE_ENV.BLUE_SWALLOW_PUBLIC_ORIGIN, BSS_BIRD_HISTORY_ENABLED: 'true' },
    createStore: () => store });
  const body = { csvBase64: Buffer.from(HEADER + row() + '\n').toString('base64') };
  const context = {}; await handler(context, { method: 'POST', query: {}, headers: headersFor(token), body });
  assert.equal(context.res.status, 200);
  assert.equal(context.res.body.comparison.status, 'available');
  assert.match(context.res.headers['Cache-Control'], /private/); assert.match(context.res.headers['Cache-Control'], /no-store/);
  assert.equal(reads, 1); assert.equal(writes, 0);
});

test('BH-FR-011 only 1 to 1000 distinct whole row numbers of at least 2 can be selected', async () => {
  let touched = 0;
  const store = { async read() { touched++; throw new Error('selection is validated first'); }, async write() { touched++; } };
  const csv = Buffer.from(HEADER + row() + '\n');
  const request = (selectedRows) => ({ revision: 0, digest: '0'.repeat(64), selectedRows });
  const thousandAndOne = Array.from({ length: 1001 }, (_, index) => index + 2);
  for (const selected of [[], [1], [0], [-3], [2.5], ['2'], [2, 2], thousandAndOne, 'all', null, undefined]) {
    await assert.rejects(applyDraftImport(store, csv, request(selected)), /invalid_bird_selection/, JSON.stringify(selected)?.slice(0, 40));
  }
  assert.equal(touched, 0, 'an invalid selection never reaches storage');
});

function drafts(count) {
  const lines = Array.from({ length: count }, (_, index) => row(`S${index + 1}`, 'Test bird', `Test avis ${index}`, index % 2 ? 'X' : '3'));
  return { version: 1, revision: 1, records: preview(lines).candidates };
}
const EMPTY = { version: 1, updatedAt: null, posts: [], sightings: [] };
const NOW = new Date('2026-11-10T12:00:00Z');

test('BH-FR-012 places, action counts and secret length are bounded; only public fields are copied', () => {
  const snapshot = drafts(1001), keys = snapshot.records.map((entry) => entry.provisionalKey);
  const secret = Buffer.alloc(32, 9);
  const plan = (publish, unpublish = [], key = secret) => planBirdPublication(snapshot, EMPTY, { publish, unpublish }, { secret: key, now: NOW });
  const at = (place) => [{ key: keys[0], place }];
  for (const place of ['a'.repeat(121), ' County', 'County ', 'Coun\u0007ty', 'Coun\u009fty']) {
    assert.throws(() => plan(at(place)), /invalid_bird_publication/, JSON.stringify(place));
  }
  for (const place of ['', 'County', 'a'.repeat(120)]) assert.equal(plan(at(place)).summary.publish, 1);
  assert.equal(plan(keys.slice(0, 1000).map((key) => ({ key, place: '' }))).summary.publish, 1000);
  assert.throws(() => plan(keys.map((key) => ({ key, place: '' }))), /invalid_bird_publication/);
  assert.throws(() => plan([]), /invalid_bird_publication/);
  for (const length of [31, 129]) assert.throws(() => plan(at('County'), [], Buffer.alloc(length, 1)), /invalid_bird_publication/);
  for (const length of [32, 128]) assert.equal(plan(at('County'), [], Buffer.alloc(length, 1)).summary.publish, 1);
  const exact = snapshot.records.findIndex((entry) => entry.countKind === 'exact');
  const published = plan([{ key: keys[exact], place: 'County' }]).publication.sightings[0];
  assert.equal(published.count, snapshot.records[exact].count);
  const allowed = ['published', 'id', 'speciesId', 'commonName', 'scientificName', 'observedOn', 'count', 'source', 'place'];
  assert.deepEqual(Object.keys(published).sort(), [...allowed].sort());
  assert.equal(published.source, 'eBird');
});
