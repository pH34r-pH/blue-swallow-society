import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

import { DEFLOCK_DATA_URL, runDeflockSourceJob } from '../src/greenfeed-worker.mjs';

const SYNTHETIC_DEFLOCK_FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/greenfeeds/deflock-osm-alpr-reports.json', import.meta.url), 'utf8'));

function source({ enabled = true, termsReviewed = true } = {}) {
  return { source_key: 'deflock-osm-alpr-reports', enabled, terms_reviewed: termsReviewed };
}

function responseFor(payload, { status = 200, contentLength = null } = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({
      'content-type': 'application/geo+json',
      'content-length': String(contentLength ?? body.byteLength),
      etag: '"fixture-etag"',
    }),
    arrayBuffer: async () => body,
  };
}

test('fetches only the fixed DeFlock data URL, materializes aggregates, and records a sanitized run', async () => {
  const calls = [];
  const runs = [];
  const snapshots = [];
  const result = await runDeflockSourceJob({
    source: source({ termsReviewed: false }),
    fetchImpl: async (url) => {
      calls.push(url);
      return responseFor(SYNTHETIC_DEFLOCK_FIXTURE);
    },
    store: {
      async recordDeflockSourceFetchRun(run) { runs.push(run); },
      async replaceDeflockSourceCells(snapshot) { snapshots.push(snapshot); },
    },
    now: () => new Date('2026-07-23T00:00:00.000Z'),
  });

  assert.deepEqual(calls, [DEFLOCK_DATA_URL]);
  assert.equal(result.outcome, 'success');
  assert.equal(snapshots.length, 1);
  assert.ok(snapshots[0].cells.every((cell) => !JSON.stringify(cell).includes('osmId')));
  assert.equal(runs[0].outcome, 'success');
  assert.equal(runs[0].etag, '"fixture-etag"');
  assert.equal('error_body' in runs[0], false);
});

test('does not fetch when the source is disabled', async () => {
  let fetches = 0;
  const runs = [];
  const result = await runDeflockSourceJob({
    source: source({ enabled: false }),
    fetchImpl: async () => { fetches += 1; throw new Error('must not fetch'); },
    store: { async recordDeflockSourceFetchRun(run) { runs.push(run); }, async replaceDeflockSourceCells() {} },
  });
  assert.equal(fetches, 0);
  assert.equal(result.outcome, 'disabled');
  assert.equal(runs[0].outcome, 'disabled');
});

test('records bounded rate-limit, invalid-payload, and timeout outcomes without persisting cells', async () => {
  const cases = [
    {
      expected: 'rate_limited',
      fetchImpl: async () => responseFor({}, { status: 429 }),
    },
    {
      expected: 'invalid_payload',
      fetchImpl: async () => responseFor({ type: 'not-a-feature-collection' }),
    },
    {
      expected: 'timeout',
      fetchImpl: async () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      },
    },
  ];

  for (const candidate of cases) {
    const runs = [];
    let writes = 0;
    const result = await runDeflockSourceJob({
      source: source(),
      fetchImpl: candidate.fetchImpl,
      store: {
        recordDeflockSourceFetchRun: async (run) => runs.push(run),
        replaceDeflockSourceCells: async () => { writes += 1; },
      },
    });
    assert.equal(result.outcome, candidate.expected);
    assert.equal(runs[0].outcome, candidate.expected);
    assert.equal(writes, 0);
  }
});

test('decodes the published gzip delivery before materialization and still discards report records', async () => {
  const payload = gzipSync(Buffer.from(JSON.stringify(SYNTHETIC_DEFLOCK_FIXTURE)));
  const calls = [];
  const outcome = await runDeflockSourceJob({
    source: source(),
    now: () => new Date('2026-07-23T00:00:00.000Z'),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/gzip', 'content-length': String(payload.byteLength) }),
      arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
    }),
    store: {
      replaceDeflockSourceCells: async (value) => calls.push(value),
      recordDeflockSourceFetchRun: async () => {},
    },
  });

  assert.equal(outcome.outcome, 'success');
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(calls[0].cells).includes('coordinates'), false);
});

test('rejects an oversized object without retaining it or calling the route API', async () => {
  const runs = [];
  const result = await runDeflockSourceJob({
    source: source(),
    fetchImpl: async () => responseFor({}, { contentLength: 35 * 1024 * 1024 + 1 }),
    store: { async recordDeflockSourceFetchRun(run) { runs.push(run); }, async replaceDeflockSourceCells() { throw new Error('must not persist'); } },
  });
  assert.equal(result.outcome, 'payload_too_large');
  assert.equal(runs[0].outcome, 'payload_too_large');
});
