import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wigleRoute = require('../api/wigle/index.js');
const { createOperatorToken } = require('../api/_lib/operator-auth');

const TEST_OPERATOR_DIGEST = '0'.repeat(64);
const TEST_SIGNING_KEY = 'wigle-route-token-signing-key-32-bytes-minimum';

function makeOperatorHeaders() {
  const previousDigest = process.env.BLUE_SWALLOW_PASSCODE_SHA256;
  const previousSigningKey = process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = TEST_OPERATOR_DIGEST;
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = TEST_SIGNING_KEY;
  try {
    const session = createOperatorToken({ ttlMs: 60_000 });
    return {
      Authorization: `Bearer ${session.token}`,
    };
  } finally {
    if (previousDigest === undefined) {
      delete process.env.BLUE_SWALLOW_PASSCODE_SHA256;
    } else {
      process.env.BLUE_SWALLOW_PASSCODE_SHA256 = previousDigest;
    }
    if (previousSigningKey === undefined) {
      delete process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY;
    } else {
      process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = previousSigningKey;
    }
  }
}

function withOperatorEnv(env = {}) {
  return {
    ...env,
    BLUE_SWALLOW_PASSCODE_SHA256: TEST_OPERATOR_DIGEST,
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY,
  };
}

function makeContext() {
  return {
    log: {
      error() {},
      warn() {},
      info() {},
    },
  };
}

async function invokeRoute(req, env = {}, fetchImpl = global.fetch) {
  const previousEnv = {};
  for (const [key, value] of Object.entries(env)) {
    previousEnv[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const originalFetch = global.fetch;
  global.fetch = fetchImpl;

  try {
    const context = makeContext();
    await wigleRoute(context, req);
    return context.res;
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('wigle API requires a passcode-issued operator bearer token', async () => {
  const response = await invokeRoute(
    {
      body: {
        mode: 'live',
      },
    },
    withOperatorEnv({
      WIGLE_LIVE_BRIDGE_URL: undefined,
      WIGLE_LOCAL_DB_PATH: undefined,
      WIGLE_API_NAME: undefined,
      WIGLE_API_TOKEN: undefined,
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /Operator session required/);
});

test('wigle API rejects location coordinates in URL query strings', async () => {
  const response = await invokeRoute(
    {
      headers: makeOperatorHeaders(),
      query: {
        mode: 'live',
        lat: '47.6205',
        lon: '-122.3493',
      },
    },
    withOperatorEnv({
      WIGLE_LIVE_BRIDGE_URL: undefined,
      WIGLE_LOCAL_DB_PATH: undefined,
      WIGLE_API_NAME: undefined,
      WIGLE_API_TOKEN: undefined,
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.match(response.body.message, /POST body/);
});

test('wigle API fails closed instead of sending coordinates to upstream URL queries', async () => {
  const fetchCalls = [];
  const response = await invokeRoute(
    {
      headers: makeOperatorHeaders(),
      body: {
        mode: 'live',
        lat: 47.6205,
        lon: -122.3493,
      },
    },
    withOperatorEnv({
      WIGLE_LIVE_BRIDGE_URL: undefined,
      WIGLE_LOCAL_DB_PATH: undefined,
      WIGLE_API_NAME: 'operator',
      WIGLE_API_TOKEN: 'token',
    }),
    async (url) => {
      fetchCalls.push(String(url));
      throw new Error('fetch should not run');
    },
  );

  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
  assert.match(response.body.message, /coordinate-bearing URLs/);
  assert.deepEqual(fetchCalls, []);
});

test('wigle API exposes a local database snapshot clipped to 100m', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'wigle-db-'));
  const tempFile = path.join(tempDir, 'wigle.json');

  try {
    await writeFile(tempFile, JSON.stringify({
      location: { lat: 47.6205, lon: -122.3493 },
      accessPoints: [
        {
          ssid: 'Near AP',
          bssid: 'aa:bb:cc:dd:ee:55',
          lat: 47.62058,
          lon: -122.34918,
          signalDbm: -51,
        },
        {
          ssid: 'Far AP',
          bssid: 'aa:bb:cc:dd:ee:66',
          lat: 47.6226,
          lon: -122.3600,
          signalDbm: -68,
        },
      ],
      updatedAt: '2026-07-09T11:00:00Z',
    }), 'utf8');

    const response = await invokeRoute(
      {
        headers: makeOperatorHeaders(),
        body: {
          mode: 'database',
          lat: 47.6205,
          lon: -122.3493,
          radiusMeters: 100,
          limit: 10,
        },
      },
      withOperatorEnv({
        WIGLE_LOCAL_DB_PATH: tempFile,
        WIGLE_LIVE_BRIDGE_URL: undefined,
        WIGLE_API_NAME: undefined,
        WIGLE_API_TOKEN: undefined,
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.mode, 'database');
    assert.equal(response.body.live, false);
    assert.equal(response.body.source, 'local-db');
    assert.equal(response.body.totalResults, 1);
    assert.equal(response.body.accessPoints.length, 1);
    assert.equal(response.body.accessPoints[0].ssid, 'Near AP');
    assert.ok(response.body.accessPoints[0].distanceMeters <= 100);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('wigle API exposes current local DB observations for AR from recent rows', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'wigle-current-'));
  const tempFile = path.join(tempDir, 'wigle.json');

  try {
    await writeFile(tempFile, JSON.stringify({
      location: { lat: 47.6205, lon: -122.3493 },
      accessPoints: [
        {
          ssid: 'Old Strong AP',
          bssid: 'aa:bb:cc:dd:ee:81',
          lat: 47.62058,
          lon: -122.34918,
          signalDbm: -31,
          lastSeen: '2026-07-09T11:58:00Z',
        },
        {
          ssid: 'Current Near AP',
          bssid: 'aa:bb:cc:dd:ee:82',
          lat: 47.62058,
          lon: -122.34918,
          signalDbm: -44,
          lastSeen: '2026-07-09T12:00:20Z',
        },
      ],
      updatedAt: '2026-07-09T12:00:25Z',
    }), 'utf8');

    const response = await invokeRoute(
      {
        headers: makeOperatorHeaders(),
        body: {
          mode: 'current',
          lat: 47.6205,
          lon: -122.3493,
          radiusMeters: 100,
          limit: 10,
          maxAgeSeconds: 45,
          now: '2026-07-09T12:00:30Z',
        },
      },
      withOperatorEnv({
        WIGLE_LOCAL_DB_PATH: tempFile,
        WIGLE_LIVE_BRIDGE_URL: undefined,
        WIGLE_API_NAME: undefined,
        WIGLE_API_TOKEN: undefined,
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.mode, 'current');
    assert.equal(response.body.live, true);
    assert.equal(response.body.source, 'local-db');
    assert.equal(response.body.totalResults, 1);
    assert.equal(response.body.accessPoints[0].ssid, 'Current Near AP');
    assert.equal(response.body.accessPoints[0].current, true);
    assert.equal(response.body.accessPoints[0].ageMs, 10_000);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('wigle API proxies a live bridge snapshot and keeps the live flag', async () => {
  const bridgePayload = {
    live: true,
    source: 'bridge',
    location: { lat: 47.6205, lon: -122.3493 },
    accessPoints: [
      {
        ssid: 'Bridge AP',
        bssid: 'aa:bb:cc:dd:ee:77',
        lat: 47.6206,
        lon: -122.3492,
        signalDbm: -49,
      },
    ],
    updatedAt: '2026-07-09T11:00:00Z',
  };

  const response = await invokeRoute(
    {
      headers: makeOperatorHeaders(),
      body: {
        mode: 'live',
        lat: 47.6205,
        lon: -122.3493,
        radiusMeters: 100,
        limit: 10,
      },
    },
    withOperatorEnv({
      WIGLE_LIVE_BRIDGE_URL: 'https://bridge.local/wigle',
      WIGLE_LOCAL_DB_PATH: undefined,
      WIGLE_API_NAME: undefined,
      WIGLE_API_TOKEN: undefined,
    }),
    async (url) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(bridgePayload),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.mode, 'live');
  assert.equal(response.body.live, true);
  assert.equal(response.body.source, 'bridge');
  assert.equal(response.body.totalResults, 1);
  assert.equal(response.body.accessPoints[0].ssid, 'Bridge AP');
  assert.ok(response.body.accessPoints[0].distanceMeters <= 100);
});
