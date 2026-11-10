import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatasetClient } from '../api/_private/companion/dataset-client.mjs';
const ref = { version: 1, revision: 1, rosterSha256: 'a'.repeat(64), deviceId: 'b'.repeat(64), object: 'c'.repeat(64) };
const headers = { 'X-Blue-Swallow-Roster-Revision': '1', 'X-Blue-Swallow-Roster-Sha256': ref.rosterSha256 };
const read = (id = 1, changes = {}) => ({ type: 'read', id, kind: 'object', reference: ref, maxBytes: 8, ...changes });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(t, request) {
  let worker;
  const previous = globalThis.Worker;
  globalThis.Worker = class {
    sent = []; stopped = false;
    constructor() { worker = this; }
    postMessage(value, transfers) { this.sent.push(structuredClone(value, { transfer: transfers || [] })); }
    terminate() { this.stopped = true; }
    emit(data) { this.onmessage({ data }); }
  };
  const controller = new AbortController(); const statuses = [];
  const client = createDatasetClient({ source: '/* synthetic */', request, signal: controller.signal, onStatus: (status) => statuses.push(status) });
  t.after(() => { client.destroy(); if (previous === undefined) delete globalThis.Worker; else globalThis.Worker = previous; });
  return { worker, client, controller, statuses };
}
test('worker transport constrains destination, preserves exact bytes and validates the roster response binding', async (t) => {
  const calls = [];
  const f = setup(t, async (path, options) => { calls.push({ path, options }); return new Response(new Uint8Array([0, 255, 12]), { headers }); });
  f.worker.emit(read()); await tick();
  assert.equal(calls[0].path, '/api/companion-datasets/object'); assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), ref); assert.deepEqual([...f.worker.sent[0].value], [0, 255, 12]);
  assert.doesNotMatch(JSON.stringify(f.worker.sent), /token|Authorization|https?:/);
  f.client.destroy(); assert.equal(f.worker.stopped, true);
});
test('worker transport rejects oversized, truncated authority and stale responses without exposing service errors', async (t) => {
  let response; let cancelled = false;
  const f = setup(t, async () => response);
  response = new Response(new ReadableStream({ pull(stream) { stream.enqueue(new Uint8Array(9)); }, cancel() { cancelled = true; } }), { headers });
  f.worker.emit(read()); await tick(); assert.equal(f.worker.sent.at(-1).error, 'invalid_dataset'); assert.equal(cancelled, true);
  response = new Response('x', { headers: { ...headers, 'X-Blue-Swallow-Roster-Revision': '2' } });
  f.worker.emit(read(2)); await tick(); assert.equal(f.worker.sent.at(-1).error, 'roster_changed');
  response = new Response('PRIVATE sig=secret', { status: 503 });
  f.worker.emit(read(3)); await tick(); assert.equal(f.worker.sent.at(-1).error, 'dataset_unavailable');
  response = new Response('{', { headers: { 'Content-Type': 'application/json' } });
  f.worker.emit(read(4, { kind: 'roster', reference: null, maxBytes: 192 * 1024 })); await tick();
  assert.equal(f.worker.sent.at(-1).error, 'invalid_dataset'); assert.doesNotMatch(JSON.stringify(f.worker.sent), /PRIVATE|secret/);
});
test('only missing heads are empty; authentication failures remain distinct from storage failure', async (t) => {
  let status = 404; const f = setup(t, async () => new Response('', { status }));
  f.worker.emit(read(1, { reference: { ...ref, object: 'head' } })); await tick(); assert.equal(f.worker.sent.at(-1).value, null);
  f.worker.emit(read(2)); await tick(); assert.equal(f.worker.sent.at(-1).error, 'dataset_unavailable');
  status = 401; f.worker.emit(read(3)); await tick(); assert.equal(f.worker.sent.at(-1).error, 'session_expired');
  status = 409; f.worker.emit(read(4)); await tick(); assert.equal(f.worker.sent.at(-1).error, 'roster_changed');
});
test('invalid worker destinations stop before requests; teardown aborts pending work and ignores late bytes', async (t) => {
  let calls = 0; const bad = setup(t, async () => { calls++; });
  bad.worker.emit(read(1, { reference: { ...ref, object: '../../private' } })); await tick();
  assert.equal(calls, 0); assert.equal(bad.worker.stopped, true);
  let finish; let pendingSignal;
  const f = setup(t, async (_path, options) => { pendingSignal = options.signal; return new Promise((resolve) => { finish = resolve; }); });
  f.worker.emit(read()); f.controller.abort(); assert.equal(pendingSignal.aborted, true); assert.equal(f.worker.stopped, true);
  finish(new Response('x', { headers })); await tick(); assert.equal(f.worker.sent.length, 0);
});
test('receiver query binds current generation and rejects late results after changes, clear or lock', async (t) => {
  const f = setup(t, async () => new Response());
  await assert.rejects(f.client.receiverFixes(), /stale_projection/);
  const status = { epoch: 1, generation: 4, rosterRevision: 1, phase: 'ready', suspended: false };
  f.worker.emit({ type: 'status', status });
  const query = f.client.receiverFixes({ limit: 10 }); const sent = f.worker.sent.at(-1);
  assert.deepEqual(sent, { type: 'receiver-fixes', id: 1, epoch: 1, generation: 4, publisher: null, limit: 10 });
  f.worker.emit({ type: 'projection', id: sent.id, epoch: 1, result: { generation: 4, points: [] } });
  assert.deepEqual((await query).points, []);
  const stale = f.client.receiverFixes(); f.worker.emit({ type: 'status', status: { ...status, generation: 5 } });
  await assert.rejects(stale, /stale_projection/);
  const cleared = f.client.receiverFixes(); f.client.clear(); await assert.rejects(cleared, /stale_projection/);
  f.worker.emit({ type: 'projection', id: 3, epoch: 1, result: { generation: 5, points: ['late'] } });
  f.worker.emit({ type: 'status', status }); const locked = f.client.receiverFixes(); f.controller.abort();
  await assert.rejects(locked, /stale_projection/); await assert.rejects(f.client.receiverFixes(), /stale_projection/);
});
