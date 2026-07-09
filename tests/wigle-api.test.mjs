import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wigleRoute = require('../api/wigle/index.js');

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
        query: {
          mode: 'database',
          lat: '47.6205',
          lon: '-122.3493',
          radiusMeters: '100',
          limit: '10',
        },
      },
      {
        WIGLE_LOCAL_DB_PATH: tempFile,
        WIGLE_LIVE_BRIDGE_URL: undefined,
        WIGLE_API_NAME: undefined,
        WIGLE_API_TOKEN: undefined,
      },
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
      query: {
        mode: 'live',
        lat: '47.6205',
        lon: '-122.3493',
        radiusMeters: '100',
        limit: '10',
      },
    },
    {
      WIGLE_LIVE_BRIDGE_URL: 'https://bridge.local/wigle',
      WIGLE_LOCAL_DB_PATH: undefined,
      WIGLE_API_NAME: undefined,
      WIGLE_API_TOKEN: undefined,
    },
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
