import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArDetectionBoxes,
  createSampleVisionDataset,
  normalizeVisionDetection,
  parseVisionPayload,
} from '../app/vision.mjs';

test('normalizeVisionDetection standardizes object detection inputs', () => {
  const detection = normalizeVisionDetection({
    className: 'person',
    confidence: 0.91,
    box: { x: 0.25, y: 0.1, width: 0.4, height: 0.5, normalized: true },
    trackId: 'track-1',
    source: 'live',
  });

  assert.equal(detection.label, 'person');
  assert.equal(detection.confidence, 91);
  assert.equal(detection.box.normalized, true);
  assert.equal(detection.trackId, 'track-1');
  assert.equal(detection.source, 'live');
});

test('parseVisionPayload accepts structured payloads and preserves frame metadata', () => {
  const parsed = parseVisionPayload(JSON.stringify({
    frame: { width: 640, height: 480 },
    detections: [
      { label: 'bike', score: 0.76, box: { left: 32, top: 48, right: 160, bottom: 220 }, source: 'live' },
    ],
    updatedAt: '2026-07-09T12:00:00Z',
  }), { source: 'live' });

  assert.equal(parsed.detections.length, 1);
  assert.equal(parsed.detections[0].label, 'bike');
  assert.equal(parsed.frame.width, 640);
  assert.equal(parsed.updatedAt, '2026-07-09T12:00:00Z');
});

test('buildArDetectionBoxes orders overlays by confidence and maps them to viewport pixels', () => {
  const overlay = buildArDetectionBoxes({
    detections: [
      { label: 'car', confidence: 0.52, box: { x: 0.2, y: 0.35, width: 0.3, height: 0.25, normalized: true } },
      { label: 'person', confidence: 0.94, box: { x: 0.55, y: 0.12, width: 0.18, height: 0.46, normalized: true } },
    ],
    viewportWidth: 1080,
    viewportHeight: 1920,
    orientationAngle: 90,
  });

  assert.equal(overlay.boxes[0].label, 'person');
  assert.equal(overlay.orientationAngle, 90);
  assert.ok(overlay.boxes[0].x >= 0 && overlay.boxes[0].x <= 1080);
  assert.ok(overlay.boxes[0].y >= 0 && overlay.boxes[0].y <= 1920);
});

test('createSampleVisionDataset returns sample detections', () => {
  const dataset = createSampleVisionDataset();

  assert.equal(dataset.source, 'sample');
  assert.ok(dataset.detections.length >= 3);
});
