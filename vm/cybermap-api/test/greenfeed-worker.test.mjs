import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

import { runGreenfeedWorker } from '../src/greenfeed-worker.mjs';

const RUN_AT = '2026-07-22T00:00:00.000Z';
const RATE_LIMIT_RETRY_AT = '2026-07-22T00:01:00.000Z';
const FAILURE_RETRY_AT = '2026-07-22T00:00:30.000Z';
const UPSTREAM_CREDENTIAL = 'fixture-only-credential-that-must-never-leak';
const UPSTREAM_ERROR_BODY = `provider_error=${UPSTREAM_CREDENTIAL}`;

async function readFixture(name) {
  const source = await readFile(new URL(`./fixtures/greenfeeds/${name}`, import.meta.url), 'utf8');
  return JSON.parse(source);
}

function reviewedSource(overrides = {}) {
  return Object.freeze({
    id: 'source-usgs-earthquakes',
    layer_id: 'usgs-earthquakes',
    source_class: 'green_public',
    enabled: true,
    allowed_preload: true,
    terms_reviewed_at: '2026-07-21T00:00:00.000Z',
    ...overrides,
  });
}

function expectedRun(overrides = {}) {
  return {
    source_id: 'source-usgs-earthquakes',
    started_at: RUN_AT,
    completed_at: RUN_AT,
    outcome: 'success',
    response_class: 'http_200',
    fetched_count: 0,
    accepted_count: 0,
    duplicate_count: 0,
    rejected_count: 0,
    next_retry_at: null,
    error_code: null,
    ...overrides,
  };
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return structuredClone(payload);
    },
    async text() {
      return UPSTREAM_ERROR_BODY;
    },
  };
}

function normalizeFixturePayload(payload) {
  if (!Array.isArray(payload?.events)) {
    const error = new TypeError('Fixture payload events must be an array.');
    error.code = 'invalid_payload';
    throw error;
  }

  return payload.events.map((event) => ({
    external_event_key: `usgs:${event.id}`,
    kind: 'greenfeed_snapshot',
    observed_at: event.observed_at,
    source_class: 'green_public',
    caveats: ['public_report_not_local_observation'],
  }));
}

function createHarness({ fetchError = null, fetchResponse = null } = {}) {
  const sourceRuns = [];
  const snapshotWrites = [];
  const enableCalls = [];
  const errorLogs = [];
  let fetchCalls = 0;

  return {
    sourceRuns,
    snapshotWrites,
    enableCalls,
    errorLogs,
    get fetchCalls() {
      return fetchCalls;
    },
    async fetch() {
      fetchCalls += 1;
      if (fetchError) throw fetchError;
      return fetchResponse;
    },
    normalize: normalizeFixturePayload,
    async writeSnapshots({ source, snapshots }) {
      snapshotWrites.push({ source_id: source.id, snapshots: structuredClone(snapshots) });
      return {
        accepted_count: snapshots.length,
        duplicate_count: 0,
        rejected_count: 0,
      };
    },
    async recordRun(run) {
      sourceRuns.push(structuredClone(run));
    },
    async enableSource(sourceId) {
      enableCalls.push(sourceId);
    },
    logger: {
      error(event) {
        errorLogs.push(structuredClone(event));
      },
    },
  };
}

async function run(harness, source = reviewedSource()) {
  return runGreenfeedWorker({
    source,
    fetch: harness.fetch,
    normalize: harness.normalize,
    writeSnapshots: harness.writeSnapshots,
    recordRun: harness.recordRun,
    enableSource: harness.enableSource,
    logger: harness.logger,
    now: () => new Date(RUN_AT),
    backoffMs: { rate_limited: 60_000, failed: 30_000 },
  });
}

function assertNoSeedOrEnable(harness, source) {
  assert.deepEqual(harness.snapshotWrites, []);
  assert.deepEqual(harness.enableCalls, []);
  assert.equal(Object.isFrozen(source), true);
}

function assertNoSensitiveOutput(value) {
  const encoded = JSON.stringify(value);
  assert.equal(encoded.includes(UPSTREAM_CREDENTIAL), false, 'output leaks a provider credential');
  assert.equal(encoded.includes(UPSTREAM_ERROR_BODY), false, 'output leaks a provider error body');
}

test('records a successful fixture fetch and writes its normalized snapshots', async () => {
  const fixture = await readFixture('usgs-earthquakes-success.json');
  const harness = createHarness({ fetchResponse: response(200, fixture) });

  const result = await run(harness);

  const snapshots = normalizeFixturePayload(fixture);
  const expected = expectedRun({ fetched_count: 2, accepted_count: 2 });
  assert.deepEqual(result, expected);
  assert.deepEqual(harness.sourceRuns, [expected]);
  assert.deepEqual(harness.snapshotWrites, [{ source_id: 'source-usgs-earthquakes', snapshots }]);
  assert.equal(harness.fetchCalls, 1);
  assert.deepEqual(harness.enableCalls, []);
});

test('records an empty fixture outcome without seeding snapshots', async () => {
  const fixture = await readFixture('usgs-earthquakes-empty.json');
  const harness = createHarness({ fetchResponse: response(200, fixture) });
  const source = reviewedSource();

  const result = await run(harness, source);

  const expected = expectedRun({ outcome: 'empty' });
  assert.deepEqual(result, expected);
  assert.deepEqual(harness.sourceRuns, [expected]);
  assert.equal(harness.fetchCalls, 1);
  assertNoSeedOrEnable(harness, source);
});

test('records a rate-limited outcome with bounded backoff and no seed or sensitive output leakage', async () => {
  const harness = createHarness({ fetchResponse: response(429, { error: 'rate limited' }) });
  const source = reviewedSource();

  const result = await run(harness, source);

  const expected = expectedRun({
    outcome: 'rate_limited',
    response_class: 'http_429',
    next_retry_at: RATE_LIMIT_RETRY_AT,
    error_code: 'rate_limited',
  });
  assert.deepEqual(result, expected);
  assert.deepEqual(harness.sourceRuns, [expected]);
  assert.equal(harness.fetchCalls, 1);
  assertNoSeedOrEnable(harness, source);
  assertNoSensitiveOutput([result, harness.sourceRuns, harness.errorLogs]);
});

test('records an invalid fixture payload without seeding snapshots or leaking its body', async () => {
  const fixture = await readFixture('usgs-earthquakes-invalid.json');
  const harness = createHarness({ fetchResponse: response(200, fixture) });
  const source = reviewedSource();

  const result = await run(harness, source);

  const expected = expectedRun({
    outcome: 'failed',
    response_class: 'invalid_payload',
    next_retry_at: FAILURE_RETRY_AT,
    error_code: 'invalid_payload',
  });
  assert.deepEqual(result, expected);
  assert.deepEqual(harness.sourceRuns, [expected]);
  assert.equal(harness.fetchCalls, 1);
  assertNoSeedOrEnable(harness, source);
  assertNoSensitiveOutput([result, harness.sourceRuns, harness.errorLogs]);
});

test('records a timeout with bounded backoff without seeding snapshots or leaking errors', async () => {
  const timeout = new Error(`provider timeout ${UPSTREAM_ERROR_BODY}`);
  timeout.name = 'AbortError';
  const harness = createHarness({ fetchError: timeout });
  const source = reviewedSource();

  const result = await run(harness, source);

  const expected = expectedRun({
    outcome: 'failed',
    response_class: 'timeout',
    next_retry_at: FAILURE_RETRY_AT,
    error_code: 'timeout',
  });
  assert.deepEqual(result, expected);
  assert.deepEqual(harness.sourceRuns, [expected]);
  assert.equal(harness.fetchCalls, 1);
  assertNoSeedOrEnable(harness, source);
  assertNoSensitiveOutput([result, harness.sourceRuns, harness.errorLogs]);
});

test('records terms-unreviewed as disabled without fetching, seeding, or enabling the source', async () => {
  const harness = createHarness();
  const source = reviewedSource({ terms_reviewed_at: null });

  const result = await run(harness, source);

  const expected = expectedRun({
    outcome: 'disabled',
    response_class: 'terms_unreviewed',
    error_code: 'terms_unreviewed',
  });
  assert.deepEqual(result, expected);
  assert.deepEqual(harness.sourceRuns, [expected]);
  assert.equal(harness.fetchCalls, 0);
  assertNoSeedOrEnable(harness, source);
  assertNoSensitiveOutput([result, harness.sourceRuns, harness.errorLogs]);
});
