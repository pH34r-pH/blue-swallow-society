import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const controllerFiles = {
  godeye: new URL('../api/_private/operator/assets/godeye-controller.mjs', import.meta.url),
  vision: new URL('../api/_private/operator/assets/vision-controller.mjs', import.meta.url),
};

test('Godeye controller keeps request shaping and unavailable state independent from the bootstrap', async () => {
  assert.equal(existsSync(controllerFiles.godeye), true, 'the Godeye controller must be a private module');

  const { createGodeyeController } = await import(controllerFiles.godeye.href);
  const controller = createGodeyeController({ now: () => '2026-07-26T18:00:00.000Z' });

  assert.deepEqual(controller.buildRequestPayload({
    lat: 47.6205,
    lon: -122.3493,
    radiusMeters: 100,
    limit: null,
    maxAgeMs: '',
  }), {
    lat: 47.6205,
    lon: -122.3493,
    radiusMeters: 100,
  });
  assert.deepEqual(controller.emptyDataset(), {
    location: null,
    accessPoints: [],
    source: 'cybermap-postgis',
    mode: 'viewport',
    live: false,
    updatedAt: null,
  });

  const live = controller.reduceDataset({
    location: { lat: 47.6205, lon: -122.3493 },
    accessPoints: [{ bssid: 'aa:bb:cc:dd:ee:ff', ssid: 'Live AP', signalDbm: -51 }],
    updatedAt: '2026-07-26T17:59:00.000Z',
  }, { live: true });
  assert.equal(live.live, true);
  assert.equal(live.accessPoints[0].ssid, 'Live AP');
  assert.equal(live.updatedAt, '2026-07-26T17:59:00.000Z');
});

test('vision controller merges explicit imported data without manufacturing detections', async () => {
  assert.equal(existsSync(controllerFiles.vision), true, 'the vision controller must be a private module');

  const { createVisionController } = await import(controllerFiles.vision.href);
  const controller = createVisionController({ now: () => '2026-07-26T18:00:00.000Z' });
  const unavailable = controller.emptyDataset();
  assert.deepEqual(unavailable, {
    frame: null,
    detections: [],
    source: 'unavailable',
    updatedAt: null,
  });

  const imported = controller.reduceDataset({
    frame: { width: 640, height: 480 },
    detections: [{ label: 'person', confidence: 0.88, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4, normalized: true } }],
    updatedAt: '2026-07-26T17:59:00.000Z',
  }, { sourceLabel: 'local-file', merge: false });
  assert.equal(imported.detections.length, 1);
  assert.equal(imported.source, 'local-file');
  assert.equal(imported.updatedAt, '2026-07-26T17:59:00.000Z');
});
