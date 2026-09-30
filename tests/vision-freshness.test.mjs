import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisionController } from '../api/_private/operator/assets/vision-controller.mjs';
import { buildArDetectionBoxes, normalizeVisionDetection } from '../api/_private/operator/assets/vision.mjs';

const capture = '2026-09-30T00:00:00.000Z';
const detection = { label: 'person', trackId: 'one', confidence: 0.9, timestamp: capture,
  box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4, normalized: true } };

test('live loads replace, including empty results, without retaining old frames', () => {
  const controller = createVisionController({ now: () => capture });
  const previous = controller.reduceDataset({ frame: { width: 100 }, detections: [detection], updatedAt: capture });
  const next = controller.reduceDataset({ detections: [{ ...detection, trackId: 'two', confidence: 0.5 }] }, { previous, merge: true });
  assert.deepEqual(next.detections.map((item) => item.trackId), ['two']);
  assert.equal(next.frame, null);
  const empty = controller.reduceDataset({}, { previous: next, merge: true });
  assert.deepEqual(empty.detections, []);
  assert.equal(empty.updatedAt, null);
  assert.equal(controller.getView(empty).status, 'empty');
});

test('capture time, not repeated receipt time, determines expiry', () => {
  let clock = Date.parse(capture);
  const controller = createVisionController({ now: () => clock, maxAgeMs: 1000 });
  const payload = { detections: [detection], updatedAt: capture };
  const dataset = controller.reduceDataset(payload);
  assert.equal(controller.getView(dataset).status, 'current');
  assert.equal(controller.getView(dataset).expiresInMs, 1000);
  clock += 1000;
  const reloaded = controller.reduceDataset(payload, { previous: dataset });
  assert.equal(reloaded.updatedAt, capture);
  assert.equal(reloaded.detections[0].timestamp, capture);
  assert.equal(controller.getView(reloaded).status, 'stale');
  assert.deepEqual(controller.getView(reloaded).overlayDetections, []);
});

test('untimed, malformed or future evidence is never current; frame capture time is supported', () => {
  const controller = createVisionController({ now: () => capture });
  for (const timestamp of [undefined, null, '', 'invalid', '2026-10-01T00:00:00Z']) {
    const dataset = controller.reduceDataset({ detections: [{ ...detection, timestamp }] });
    assert.equal(dataset.updatedAt, null);
    assert.equal(controller.getView(dataset).status, 'unknown-time');
    assert.deepEqual(controller.getView(dataset).overlayDetections, []);
  }
  const dataset = controller.reduceDataset({ frame: { timestamp: capture }, detections: [{ ...detection, timestamp: null }] });
  assert.equal(dataset.detections[0].timestamp, capture);
  assert.equal(controller.getView(dataset).status, 'current');
});

test('new dataset timestamp cannot freshen an old detection', () => {
  const controller = createVisionController({ now: () => capture });
  const dataset = controller.reduceDataset({ updatedAt: capture, detections: [{ ...detection, timestamp: '2026-01-01T00:00:00Z' }] });
  assert.equal(controller.getView(dataset).status, 'stale');
});

test('historical imports can merge only with historical data and never become live overlays', () => {
  const controller = createVisionController({ now: () => capture });
  const live = controller.reduceDataset({ detections: [detection] });
  const historical = controller.reduceDataset({ detections: [{ ...detection, trackId: 'import' }] }, { mode: 'historical', previous: live, merge: true });
  assert.deepEqual(historical.detections.map((item) => item.trackId), ['import']);
  const merged = controller.reduceDataset({}, { mode: 'historical', previous: historical, merge: true });
  assert.equal(merged.detections.length, 1);
  assert.equal(merged.detections[0].timestamp, capture);
  assert.equal(controller.getView(merged).status, 'historical');
  assert.deepEqual(controller.getView(merged).overlayDetections, []);
});

test('absent and malformed geometry produces no measured overlay or box claim', () => {
  for (const box of [undefined, null, {}, [], [0, 0, 0, 1], { x: null, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: -1, height: 1 }, { x: 0, y: 0, width: Infinity, height: 1 }]) {
    const invalid = { ...detection, box };
    assert.equal(normalizeVisionDetection(invalid).box, null);
    assert.deepEqual(buildArDetectionBoxes({ detections: [invalid] }).boxes, []);
    assert.match(normalizeVisionDetection(invalid).detail, /geometry unavailable/);
  }
});

test('valid geometry preserves measured dimensions without minimum-size fallback and clips to frame', () => {
  const plan = buildArDetectionBoxes({ viewportWidth: 100, viewportHeight: 100, detections: [
    { ...detection, box: { x: 0, y: 0, width: 2, height: 3, normalized: false } },
    { ...detection, trackId: 'clipped', box: { x: -10, y: 90, width: 30, height: 30, normalized: false } },
  ] });
  const small = plan.boxes.find((item) => item.trackId === 'one');
  assert.deepEqual([small.x, small.y, small.width, small.height], [0, 0, 2, 3]);
  const clipped = plan.boxes.find((item) => item.trackId === 'clipped');
  assert.deepEqual([clipped.x, clipped.y, clipped.width, clipped.height], [0, 90, 20, 10]);
});

test('mixed-age results expose only current detections and expire at the earliest capture bound', () => {
  const controller = createVisionController({ now: () => Date.parse(capture) + 500, maxAgeMs: 1000 });
  const dataset = controller.reduceDataset({ detections: [detection,
    { ...detection, trackId: 'old', timestamp: '2026-01-01T00:00:00Z' },
    { ...detection, trackId: 'untimed', timestamp: null },
  ] });
  const view = controller.getView(dataset);
  assert.deepEqual(view.overlayDetections.map((item) => item.trackId), ['one']);
  assert.equal(view.expiresInMs, 500);
  assert.equal(dataset.detections.length, 3);
});

test('invalid modes and expiry configuration fail explicitly', () => {
  for (const maxAgeMs of [0, -1, Infinity, NaN, '1000']) {
    assert.throws(() => createVisionController({ maxAgeMs }), TypeError);
  }
  assert.throws(() => createVisionController().reduceDataset({}, { mode: 'demo' }), TypeError);
});
