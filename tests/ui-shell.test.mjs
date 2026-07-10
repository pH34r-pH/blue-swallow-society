import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const mainJs = readFileSync(new URL('../app/main.js', import.meta.url), 'utf8');

test('login shell is stripped to the bare passcode form', () => {
  assert.match(indexHtml, /<button id="loginBtn" class="btn login-btn" type="button">login<\/button>/);
  assert.match(indexHtml, /aria-label="Passcode"/);
  assert.ok(!indexHtml.includes('terminal-badge'));
  assert.ok(!indexHtml.includes('terminal-subtitle'));
  assert.ok(!indexHtml.includes('terminal-label'));
  assert.ok(!indexHtml.includes('terminalError'));
  assert.ok(!indexHtml.includes('placeholder="Passcode"'));
});

test('tzeentch shell exposes the restored sub-tabs', () => {
  [
    'data-surface="seek"',
    'data-surface="murmurs"',
    'data-surface="crypto"',
    'data-surface="polymarket"',
    'data-surface="intel"',
  ].forEach((needle) => assert.ok(indexHtml.includes(needle), needle));

  assert.ok(indexHtml.includes('Actionable Intel'));
  assert.ok(!indexHtml.includes('data-surface="markets"'));
  assert.ok(!indexHtml.includes('tzeentchSurfaceMarkets'));
});

test('AR shell no longer advertises sample detections as the default state', () => {
  assert.ok(indexHtml.includes('Live object detections are not connected yet.'));
  assert.ok(!indexHtml.includes('visionSampleBtn'));
  assert.ok(!mainJs.includes('Sample object detections are ready.'));
  assert.ok(!mainJs.includes('visionSampleBtn'));
  assert.ok(!mainJs.includes('createSampleVisionDataset()'));
});

test('AR WiGLE polling uses the device-local current-state mode', () => {
  assert.ok(mainJs.includes("mode: 'current'"));
  assert.ok(mainJs.includes('maxAgeSeconds: 45'));
  assert.ok(indexHtml.includes('device-local WiGLE current state'));
  assert.ok(!indexHtml.includes('browser Wi-Fi scan'));
});
