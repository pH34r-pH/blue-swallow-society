import test from 'node:test';
import assert from 'node:assert/strict';

import { createGodeyeLiveFeedClient } from '../api/_private/operator/assets/godeye-live-feed.mjs';

const location = { lat: 47.6205, lon: -122.3493 };
const snapshot = {
  live: true,
  source: 'cybermap-postgis',
  accessPoints: [{
    ssid: 'Blue Swallow Router',
    bssid: 'aa:bb:cc:dd:ee:ff',
    lat: 47.6205,
    lon: -122.3493,
    signalDbm: -54,
  }],
};

test('Godeye live feed preserves the authenticated bounded viewport request and normalizes JSON', async () => {
  const requests = [];
  const client = createGodeyeLiveFeedClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    },
    getHeaders: () => ({
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'X-Blue-Swallow-Operator-Token': 'operator-session-token',
    }),
    buildRequestPayload: (value) => ({
      ...value,
      radiusMeters: 100,
      limit: 100,
      maxAgeMs: 45_000,
    }),
  });

  const result = await client.read(location);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/operator-signals');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(requests[0].options.headers, {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'X-Blue-Swallow-Operator-Token': 'operator-session-token',
  });
  assert.equal(requests[0].options.body, JSON.stringify({
    ...location,
    radiusMeters: 100,
    limit: 100,
    maxAgeMs: 45_000,
  }));
  assert.equal(result.current, true);
  assert.equal(result.sourceLabel, 'cybermap-postgis');
  assert.equal(result.parsed.accessPoints.length, 1);
  assert.match(result.message, /connected/);
});

test('Godeye live feed accepts JSON text responses', async () => {
  const textPayload = JSON.stringify({
    source: 'managed-text',
    accessPoints: [{ bssid: 'aa:bb:cc:dd:ee:01', lat: 47.62, lon: -122.34 }],
  });
  const client = createGodeyeLiveFeedClient({
    fetchImpl: async () => new Response(textPayload, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }),
  });

  const result = await client.read(location);

  assert.equal(result.current, false);
  assert.equal(result.sourceLabel, 'managed-text');
  assert.equal(result.parsed.accessPoints.length, 1);
  assert.match(result.message, /no recent observations/);
});

test('Godeye live feed parses genuine line-oriented CSV text without promoting it to live state', async () => {
  const client = createGodeyeLiveFeedClient({
    fetchImpl: async () => new Response([
      'ssid,bssid,lat,lon,signalDbm',
      'Managed AP,aa:bb:cc:dd:ee:02,47.62,-122.34,-48',
    ].join('\n'), {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }),
  });

  const result = await client.read(location);

  assert.equal(result.current, false);
  assert.equal(result.parsed.accessPoints.length, 1);
  assert.equal(result.parsed.accessPoints[0].ssid, 'Managed AP');
  assert.equal(result.parsed.accessPoints[0].signalDbm, -48);
});

test('Godeye live feed keeps null JSON as an unavailable current snapshot', async () => {
  const client = createGodeyeLiveFeedClient({
    fetchImpl: async () => new Response('null', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  const result = await client.read(location);

  assert.equal(result.current, false);
  assert.deepEqual(result.parsed.accessPoints, []);
  assert.equal(result.sourceLabel, 'cybermap-postgis');
});

test('Godeye live feed surfaces malformed JSON responses', async () => {
  const client = createGodeyeLiveFeedClient({
    fetchImpl: async () => new Response('{malformed', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  await assert.rejects(() => client.read(location), SyntaxError);
});

test('Godeye live feed preserves transport failures for the retained caller boundary', async () => {
  const client = createGodeyeLiveFeedClient({
    fetchImpl: async () => {
      throw new Error('network offline');
    },
  });

  await assert.rejects(() => client.read(location), /network offline/);
});

test('Godeye live feed surfaces proxy HTTP failures for the retained caller boundary', async () => {
  const client = createGodeyeLiveFeedClient({
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
  });

  await assert.rejects(() => client.read(location), /HTTP 503/);
});
