import test from 'node:test';
import assert from 'node:assert/strict';
import { createCybermapApiServer } from '../src/server.mjs';
process.env.BLUE_SWALLOW_AUTH_MODE = 'entra';
test('history HTTP route checks Owner.Read before parsing/querying and passes bounded canonical filters', async (t) => {
  let reads = 0;
  const server = createCybermapApiServer({ now: () => Date.parse('2026-09-30T12:00:00Z'),
    verifyApiRead: async (token, scope) => { assert.equal(scope, 'Owner.Read'); if (token !== 'synthetic-owner-read') throw Object.assign(new Error(), { status: 403 }); return Object.freeze({ operatorId: 'synthetic-owner' }); },
    store: { async queryHistory(query) { reads++; assert.equal(query.limit, 2); return { ok: true, observations: [], nextCursor: null }; } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/v1/cybermap/history`;
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-owner-read' };
  const body = JSON.stringify({ from: '2026-09-01T00:00:00Z', to: '2026-09-30T00:00:00Z', limit: 2 });
  assert.notEqual((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ms-client-principal': 'owner' }, body })).status, 200);
  assert.equal(reads, 0);
  assert.equal((await fetch(url + '?lat=private', { method: 'POST', headers, body })).status, 400); assert.equal(reads, 0);
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{"limit":99999}' })).status, 400); assert.equal(reads, 0);
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 200); assert.equal(reads, 1);
});
