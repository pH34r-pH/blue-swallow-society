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

test('AR tab is removed while Godeye remains the hosted viewer', () => {
  assert.ok(!indexHtml.includes('data-tab="ar"'));
  assert.ok(!indexHtml.includes('id="ar-tab"'));
  assert.ok(!indexHtml.includes('Camera passthrough'));
  assert.ok(indexHtml.includes('data-tab="godeye"'));
  assert.ok(indexHtml.includes('Hosted viewer'));
  assert.ok(indexHtml.includes('Godeye'));
});

test('Wardriver APK download is linked from the landing page', () => {
  assert.ok(indexHtml.includes('/downloads/blue-swallow-wardriver-2.109-bss.1-debug.apk'));
  assert.ok(indexHtml.includes('/downloads/blue-swallow-wardriver.json'));
  assert.ok(indexHtml.includes('f50d2dcf726ef52297968e1a0af9119c7569b7692e1813d70a1ed0274ba95a0e'));
});
