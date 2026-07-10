import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArCandidateBoxes,
  buildCurrentWigleState,
  buildWigleMapState,
  filterWigleRecordsByRadius,
  isLiveWigleSnapshot,
  normalizeWigleRecord,
} from '../app/wigle.mjs';

test('normalizeWigleRecord standardizes WiGLE-like inputs', () => {
  const record = normalizeWigleRecord({
    ssid: 'Blue Swallow Router',
    bssid: 'aa:bb:cc:dd:ee:ff',
    lat: 47.6205,
    lon: -122.3493,
    signal_dbm: -54,
    channel: 11,
    vendor: 'Ubiquiti',
    lastSeen: '2026-07-09T11:00:00Z',
    source: 'live',
  });

  assert.equal(record.ssid, 'Blue Swallow Router');
  assert.equal(record.bssid, 'aa:bb:cc:dd:ee:ff');
  assert.equal(record.signalDbm, -54);
  assert.equal(record.signalBand, 'good');
  assert.ok(record.estimatedRange.max > record.estimatedRange.min);
});

test('normalizeWigleRecord accepts WiGLE sqlite/export field names', () => {
  const record = normalizeWigleRecord({
    MAC: 'aa:bb:cc:dd:ee:10',
    SSID: 'WiGLE Export AP',
    AuthMode: '[WPA2-PSK-CCMP][ESS]',
    RSSI: '-47',
    Channel: '11',
    CurrentLatitude: '47.62051',
    CurrentLongitude: '-122.34931',
    FirstSeen: '2026-07-09 12:00:07',
    Type: 'WIFI',
  });

  assert.equal(record.bssid, 'aa:bb:cc:dd:ee:10');
  assert.equal(record.ssid, 'WiGLE Export AP');
  assert.equal(record.security, '[WPA2-PSK-CCMP][ESS]');
  assert.equal(record.signalDbm, -47);
  assert.equal(record.channel, 11);
  assert.equal(record.lat, 47.62051);
  assert.equal(record.lon, -122.34931);
  assert.equal(record.lastSeen, '2026-07-09T12:00:07.000Z');
  assert.equal(record.deviceClass, 'WIFI');
});

test('buildCurrentWigleState keeps recent local DB observations ordered by signal strength', () => {
  const now = Date.parse('2026-07-09T12:00:30Z');
  const snapshot = buildCurrentWigleState({
    now,
    maxAgeMs: 45_000,
    accessPoints: [
      {
        ssid: 'Stale Strong AP',
        bssid: 'aa:bb:cc:dd:ee:01',
        signalDbm: -30,
        lastSeen: '2026-07-09T11:57:00Z',
      },
      {
        ssid: 'Recent Near AP',
        bssid: 'aa:bb:cc:dd:ee:02',
        signalDbm: -42,
        lastSeen: '2026-07-09T12:00:18Z',
      },
      {
        ssid: 'Recent Far AP',
        bssid: 'aa:bb:cc:dd:ee:03',
        signalDbm: -68,
        lastSeen: '2026-07-09T12:00:24Z',
      },
    ],
  });

  assert.equal(snapshot.live, true);
  assert.equal(snapshot.accessPoints.length, 2);
  assert.deepEqual(snapshot.accessPoints.map((record) => record.ssid), ['Recent Near AP', 'Recent Far AP']);
  assert.equal(snapshot.accessPoints[0].current, true);
  assert.equal(snapshot.accessPoints[0].ageMs, 12_000);
  assert.equal(snapshot.accessPoints[0].rangeText, 'very near · ~0-8m');
});

test('buildCurrentWigleState prefers newest observation for duplicate device identity', () => {
  const now = Date.parse('2026-07-09T12:00:30Z');
  const snapshot = buildCurrentWigleState({
    now,
    maxAgeMs: 45_000,
    accessPoints: [
      {
        ssid: 'Moving AP',
        bssid: 'aa:bb:cc:dd:ee:04',
        signalDbm: -35,
        lastSeen: '2026-07-09T12:00:04Z',
      },
      {
        ssid: 'Moving AP',
        bssid: 'aa:bb:cc:dd:ee:04',
        signalDbm: -71,
        lastSeen: '2026-07-09T12:00:26Z',
      },
    ],
  });

  assert.equal(snapshot.accessPoints.length, 1);
  assert.equal(snapshot.accessPoints[0].signalDbm, -71);
  assert.equal(snapshot.accessPoints[0].ageMs, 4_000);
  assert.equal(snapshot.accessPoints[0].rangeText, 'far · ~25-75m');
});

test('filterWigleRecordsByRadius keeps the local database inside a 100m radius', () => {
  const center = { lat: 47.6205, lon: -122.3493 };
  const records = [
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
  ];

  const filtered = filterWigleRecordsByRadius(records, center, 100);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].ssid, 'Near AP');
  assert.ok(filtered[0].distanceMeters > 0);
  assert.ok(filtered[0].distanceMeters <= 100);
});

test('isLiveWigleSnapshot only promotes explicit live snapshots', () => {
  assert.equal(isLiveWigleSnapshot({ live: true, accessPoints: [] }), true);
  assert.equal(isLiveWigleSnapshot({ mode: 'live', accessPoints: [] }), true);
  assert.equal(isLiveWigleSnapshot({ streamState: 'bridge', accessPoints: [] }), true);
  assert.equal(isLiveWigleSnapshot({ mode: 'database', accessPoints: [] }), false);
  assert.equal(isLiveWigleSnapshot({ source: 'sample', accessPoints: [] }), false);
});

test('buildWigleMapState keeps the Godeye map inside a 100m local radius', () => {
  const layout = buildWigleMapState({
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
    viewportWidth: 1024,
    viewportHeight: 768,
    zoom: 17,
    radiusMeters: 100,
  });

  assert.equal(layout.markers.length, 1);
  assert.equal(layout.markers[0].label, 'Near AP');
  assert.equal(layout.stats.total, 1);
});

test('buildWigleMapState projects nearby access points into viewport coordinates', () => {
  const layout = buildWigleMapState({
    location: { lat: 47.6205, lon: -122.3493 },
    accessPoints: [
      {
        ssid: 'Office Router',
        bssid: 'aa:bb:cc:dd:ee:11',
        lat: 47.6207,
        lon: -122.3491,
        signalDbm: -48,
        channel: 6,
      },
      {
        ssid: 'Lobby AP',
        bssid: 'aa:bb:cc:dd:ee:22',
        lat: 47.6213,
        lon: -122.3500,
        signalDbm: -72,
        channel: 1,
      },
    ],
    viewportWidth: 1024,
    viewportHeight: 768,
    zoom: 17,
  });

  assert.equal(layout.markers.length, 2);
  assert.equal(layout.markers[0].label, 'Office Router');
  assert.ok(layout.markers[0].left >= 0 && layout.markers[0].left <= 1024);
  assert.ok(layout.markers[0].top >= 0 && layout.markers[0].top <= 768);
  assert.equal(layout.stats.strongest.ssid, 'Office Router');
});

test('buildArCandidateBoxes returns upright candidate overlays ordered by confidence', () => {
  const overlay = buildArCandidateBoxes({
    accessPoints: [
      { ssid: 'Far AP', bssid: 'aa:bb:cc:dd:ee:33', signalDbm: -80, deviceClass: 'router' },
      { ssid: 'Near AP', bssid: 'aa:bb:cc:dd:ee:44', signalDbm: -42, deviceClass: 'router' },
    ],
    viewportWidth: 1080,
    viewportHeight: 1920,
    orientationAngle: 180,
  });

  assert.equal(overlay.boxes.length, 2);
  assert.equal(overlay.boxes[0].label, 'Near AP');
  assert.equal(overlay.orientationAngle, 180);
  assert.ok(overlay.boxes[0].confidence >= overlay.boxes[1].confidence);
  assert.ok(overlay.boxes[0].x >= 0 && overlay.boxes[0].x <= 1080);
  assert.ok(overlay.boxes[0].y >= 0 && overlay.boxes[0].y <= 1920);
});
