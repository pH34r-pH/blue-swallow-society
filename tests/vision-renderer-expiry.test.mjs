import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createVisionController } from '../api/_private/operator/assets/vision-controller.mjs';

// Execute the dormant renderer with a tiny DOM/timer seam, without starting camera/auth flows.
const source = readFileSync(new URL('../api/_private/operator/assets/main.js', import.meta.url), 'utf8');
const renderSource = source.slice(source.indexOf('function renderArDetectionLayer()'), source.indexOf('function renderVisionList('));

test('renderer clears an expired overlay without requiring a new sensor event', () => {
  let now = Date.parse('2026-09-30T00:00:00Z');
  const visionController = createVisionController({ now: () => now });
  const element = () => ({ style: {}, appendChild() {}, replaceChildren(...children) { this.children = children; } });
  const overlay = element();
  const status = element();
  let timer;
  const state = { visionData: visionController.reduceDataset({ updatedAt: new Date(now).toISOString(), detections: [
    { label: 'person', box: [0.1, 0.1, 0.2, 0.2] },
  ] }), visionStatus: 'Loaded', visionSourceLabel: 'test' };
  const context = vm.createContext({ state, visionController,
    $: (id) => ({ arDetections: overlay, visionStatusText: status })[id],
    window: { clearTimeout() { timer = null; }, setTimeout(fn, delay) { timer = { fn, delay }; return 1; } },
    document: { createElement: element, createDocumentFragment: element },
    renderVisionViews: () => vm.runInContext('renderArDetectionLayer()', context),
    getDetectionConfidenceBand: () => 'unknown',
    buildArDetectionBoxes: () => ({ boxes: [] }),
  });
  vm.runInContext(renderSource + '\nrenderArDetectionLayer();', context);
  assert.equal(timer.delay, 1000);
  assert.match(status.textContent, /current/);
  now += timer.delay;
  timer.fn();
  assert.equal(timer, null);
  assert.match(status.textContent, /stale/);
  assert.equal(overlay.children[0].textContent, 'No current overlay: stale.');
});
