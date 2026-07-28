import test from 'node:test';
import assert from 'node:assert/strict';

import { createCybermapApiServer } from '../src/server.mjs';
import { MemoryObservationStore } from '../src/memory-store.mjs';
import { DEVICE_ID, validBatch, withServer } from './helpers.mjs';

const CLIENT_FINGERPRINT = 'a'.repeat(64);
const PROXY_SECRET = 'test-loopback-proxy-secret';

function makeServer() {
  const store = new MemoryObservationStore({
    credentials: [{
      device_id: DEVICE_ID,
      source_id: 'source-owned-device-1',
      source_class: 'owned_device',
      mtls_certificate_fingerprint: CLIENT_FINGERPRINT,
      scopes: ['observations:write', 'cybermap:read'],
      enabled: true,
    }],
    now: () => new Date('2026-07-26T18:43:00.000Z'),
    randomUuid: () => '00000000-0000-4000-8000-000000000001',
  });
  return createCybermapApiServer({
    store,
    now: () => Date.parse('2026-07-26T18:43:00.000Z'),
    mtlsProxySecret: PROXY_SECRET,
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

test('direct mTLS viewport accepts body coordinates and does not use a token or query coordinates', async () => {
  const server = makeServer();
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/cybermap/viewport`, {
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
