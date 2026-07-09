import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArCandidateBoxes,
  buildWigleMapState,
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
