import test from 'node:test';
import assert from 'node:assert/strict';

import { createCybermapApiServer, createRequestHandler } from '../src/server.mjs';
import { IngestError } from '../src/auth.mjs';
import { MemoryObservationStore } from '../src/memory-store.mjs';
import { DEVICE_ID, validBatch, withServer } from './helpers.mjs';

const CLIENT_FINGERPRINT = 'a'.repeat(64);
const PROXY_SECRET = 'test-loopback-proxy-secret';

function makeServer({
  storedFingerprint = CLIENT_FINGERPRINT,
  logger = null,
  authenticateMtls = null,
  omitAuthenticateMtls = false,
  mtlsProxySecret = PROXY_SECRET,
} = {}) {
  const store = new MemoryObservationStore({
    credentials: [{
      device_id: DEVICE_ID,
      source_id: 'source-owned-device-1',
      source_class: 'owned_device',
      mtls_certificate_fingerprint: storedFingerprint,
      scopes: ['observations:write', 'cybermap:read'],
      enabled: true,
    }],
    now: () => new Date('2026-07-26T18:43:00.000Z'),
    randomUuid: () => '00000000-0000-4000-8000-000000000001',
  });
  if (authenticateMtls) store.authenticateMtls = authenticateMtls;
  if (omitAuthenticateMtls) store.authenticateMtls = undefined;
  return createCybermapApiServer({
    store,
    logger,
    now: () => Date.parse('2026-07-26T18:43:00.000Z'),
    mtlsProxySecret,
  });
}

function mtlsHeaders(extra = {}) {
  return {
    'content-type': 'application/json',
    'x-blue-swallow-mtls-proxy-secret': PROXY_SECRET,
    'x-blue-swallow-mtls-client-fingerprint': CLIENT_FINGERPRINT,
    'x-blue-swallow-device-id': DEVICE_ID,
    ...extra,
  };
}

test('early mTLS assertion rejection drains the request before responding', async () => {
  let resumeCalls = 0;
  let statusCode = null;
  const handler = createRequestHandler({
    store: {},
    mtlsProxySecret: PROXY_SECRET,
    logger: { error: () => {} },
  });
  const response = {
    headersSent: false,
    writableEnded: false,
    writeHead(status) { statusCode = status; },
    end() { this.writableEnded = true; },
    destroy() { this.writableEnded = true; },
  };
  await handler({
    method: 'POST',
    url: '/api/v1/observations/batch',
    headers: mtlsHeaders({ 'x-blue-swallow-mtls-proxy-secret': 'client-controlled-value' }),
    socket: { remoteAddress: '127.0.0.1' },
    resume() { resumeCalls += 1; },
  }, response);
  assert.equal(resumeCalls, 1);
  assert.equal(statusCode, 403);
});

test('direct mTLS routes reject an absent or spoofed proxy assertion', async () => {
  const server = makeServer();
  await withServer(server, async (baseUrl) => {
    const body = JSON.stringify(validBatch());
    const absent = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    });
    assert.equal(absent.status, 403);

    const spoofed = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: mtlsHeaders({ 'x-blue-swallow-mtls-proxy-secret': 'client-controlled-value' }),
      body,
    });
    assert.equal(spoofed.status, 403);
  });
});

test('direct batch logs a missing-credential stage without an assertion or ingest token', async () => {
  const records = [];
  const server = makeServer({ logger: { error: (record) => records.push(record) } });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBatch()),
    });
    assert.equal(response.status, 403);
  });
  assert.deepEqual(records, [{
    code: 'forbidden',
    statusCode: 403,
    diagnostic_code: 'missing_ingest_credentials',
  }]);
});

test('direct batch logs an invalid mTLS proxy assertion stage', async () => {
  const records = [];
  const server = makeServer({ logger: { error: (record) => records.push(record) } });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: mtlsHeaders({ 'x-blue-swallow-mtls-proxy-secret': 'client-controlled-value' }),
      body: JSON.stringify(validBatch()),
    });
    assert.equal(response.status, 403);
  });
  assert.deepEqual(records, [{
    code: 'forbidden',
    statusCode: 403,
    diagnostic_code: 'invalid_proxy_assertion',
  }]);
});

test('direct batch keeps the public forbidden response when proxy assertion configuration is absent', async () => {
  const records = [];
  const server = makeServer({
    mtlsProxySecret: '',
    logger: { error: (record) => records.push(record) },
  });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: mtlsHeaders(), body: JSON.stringify(validBatch()),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: 'forbidden' });
  });
  assert.deepEqual(records, [{
    code: 'forbidden',
    statusCode: 403,
    diagnostic_code: 'invalid_proxy_assertion',
  }]);
});

test('direct mTLS batch accepts a trusted proxy assertion without an ingest token', async () => {
  const server = makeServer();
  await withServer(server, async (baseUrl) => {
    const batch = validBatch();
    const response = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: mtlsHeaders(), body: JSON.stringify(batch),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).accepted_count, 1);
  });
});

test('direct mTLS batch fails closed when the credential authenticator is unavailable', async () => {
  const records = [];
  const server = makeServer({
    omitAuthenticateMtls: true,
    logger: { error: (record) => records.push(record) },
  });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: mtlsHeaders(), body: JSON.stringify(validBatch()),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: 'forbidden' });
  });
  assert.deepEqual(records, [{ code: 'forbidden', statusCode: 403 }]);
});

test('direct mTLS batch logs a sanitized credential-rejection reason', async () => {
  const records = [];
  const server = makeServer({
    storedFingerprint: 'b'.repeat(64),
    logger: { error: (record) => records.push(record) },
  });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: mtlsHeaders(), body: JSON.stringify(validBatch()),
    });
    assert.equal(response.status, 403);
  });
  assert.deepEqual(records, [{
    code: 'forbidden',
    statusCode: 403,
    diagnostic_code: 'mtls_credential_rejected',
  }]);
});

test('direct mTLS batch does not mislabel a forbidden credential-store outage', async () => {
  const records = [];
  const server = makeServer({
    authenticateMtls: async () => {
      const outage = new IngestError('forbidden', 'Credential store is unavailable.', { statusCode: 503 });
      outage.diagnosticCode = 'request-derived-value';
      throw outage;
    },
    logger: { error: (record) => records.push(record) },
  });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: mtlsHeaders(), body: JSON.stringify(validBatch()),
    });
    assert.equal(response.status, 503);
  });
  assert.deepEqual(records, [{ code: 'forbidden', statusCode: 503 }]);
});

test('direct mTLS viewport logs a missing proxy assertion as an invalid assertion', async () => {
  const records = [];
  const server = makeServer({ logger: { error: (record) => records.push(record) } });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/cybermap/viewport`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lat: 47.61, lon: -122.33, radiusMeters: 250, limit: 20 }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: 'forbidden' });
  });
  assert.deepEqual(records, [{
    code: 'forbidden',
    statusCode: 403,
    diagnostic_code: 'invalid_proxy_assertion',
  }]);
});

test('direct mTLS viewport logs missing device identity without exposing it', async () => {
  const records = [];
  const server = makeServer({ logger: { error: (record) => records.push(record) } });
  await withServer(server, async (baseUrl) => {
    const headers = mtlsHeaders();
    delete headers['x-blue-swallow-device-id'];
    const response = await fetch(`${baseUrl}/api/v1/cybermap/viewport`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ lat: 47.61, lon: -122.33, radiusMeters: 250, limit: 20 }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: 'forbidden' });
  });
  assert.deepEqual(records, [{
    code: 'forbidden',
    statusCode: 403,
    diagnostic_code: 'missing_ingest_credentials',
  }]);
});

test('direct mTLS viewport logs a rejected credential without changing the response', async () => {
  const records = [];
  const server = makeServer({
    storedFingerprint: 'd'.repeat(64),
    logger: { error: (record) => records.push(record) },
  });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/cybermap/viewport`, {
      method: 'POST',
      headers: mtlsHeaders(),
      body: JSON.stringify({ lat: 47.61, lon: -122.33, radiusMeters: 250, limit: 20 }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: 'forbidden' });
  });
  assert.deepEqual(records, [{
    code: 'forbidden',
    statusCode: 403,
    diagnostic_code: 'mtls_credential_rejected',
  }]);
});

test('direct mTLS viewport accepts body coordinates and does not use a token or query coordinates', async () => {
  const server = makeServer();
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/cybermap/viewport?lat=1&lon=2`, {
      method: 'POST',
      headers: mtlsHeaders(),
      body: JSON.stringify({ lat: 47.61, lon: -122.33, radiusMeters: 250, limit: 20 }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.source, 'cybermap-postgis');
    assert.equal(payload.totalResults, 0);
    assert.equal(Object.hasOwn(payload, 'accessPoints'), false);

    const mismatchedDevice = await fetch(`${baseUrl}/api/v1/cybermap/viewport`, {
      method: 'POST',
      headers: mtlsHeaders({ 'x-blue-swallow-device-id': 'wrong-device' }),
      body: JSON.stringify({ lat: 47.61, lon: -122.33, radiusMeters: 250, limit: 20 }),
    });
    assert.equal(mismatchedDevice.status, 403);
  });
});
