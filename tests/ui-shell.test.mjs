import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const operatorHtml = readFileSync(new URL('../app/operator/index.html', import.meta.url), 'utf8');
const mainJs = readFileSync(new URL('../app/operator/main.js', import.meta.url), 'utf8');
const tzeentchJs = readFileSync(new URL('../app/operator/tzeentch.mjs', import.meta.url), 'utf8');
const stylesCss = readFileSync(new URL('../app/operator/styles.css', import.meta.url), 'utf8');

test('public face is a standalone download surface with no login shell', () => {
  assert.match(indexHtml, /<body data-mode="public">/);
  assert.match(indexHtml, /href="\/public\.css"/);
  assert.match(indexHtml, /\/downloads\/blue-swallow-wardriver-2\.109-bss\.1-debug\.apk/);
  assert.ok(!indexHtml.includes('passcodeInput'));
  assert.ok(!indexHtml.includes('terminalScreen'));
  assert.ok(!indexHtml.includes('mainInterface'));
  assert.ok(!indexHtml.includes('/operator/'));
});

test('operator login shell is stripped to the bare passcode form', () => {
  assert.match(operatorHtml, /<button id="loginBtn" class="btn login-btn" type="button">login<\/button>/);
  assert.match(operatorHtml, /aria-label="Passcode"/);
  assert.ok(!operatorHtml.includes('terminal-badge'));
  assert.ok(!operatorHtml.includes('terminal-subtitle'));
  assert.ok(!operatorHtml.includes('terminal-label'));
  assert.ok(!operatorHtml.includes('terminalError'));
  assert.ok(!operatorHtml.includes('placeholder="Passcode"'));
});

test('tzeentch shell exposes the restored sub-tabs', () => {
  [
    'data-surface="seek"',
    'data-surface="murmurs"',
    'data-surface="crypto"',
    'data-surface="polymarket"',
    'data-surface="intel"',
  ].forEach((needle) => assert.ok(operatorHtml.includes(needle), needle));

  assert.ok(operatorHtml.includes('Actionable Intel'));
  assert.ok(!operatorHtml.includes('data-surface="markets"'));
  assert.ok(!operatorHtml.includes('tzeentchSurfaceMarkets'));
});

test('tzeentch client uses one surface manifest and no legacy market carousel state', () => {
  assert.match(tzeentchJs, /export const TZEENTCH_SURFACES\s*=\s*\[/);
  assert.doesNotMatch(tzeentchJs, /TZEENTCH_MARKET_TABS/);
  assert.doesNotMatch(tzeentchJs, /\bmarketTab\b/);
  assert.doesNotMatch(tzeentchJs, /\bmarketTouch\b/);
  assert.doesNotMatch(tzeentchJs, /renderTzeentchMarketTabs/);
  assert.doesNotMatch(tzeentchJs, /renderTzeentchMarketSurface/);
});

test('tzeentch sub-tabs wrap instead of hiding overflow off-canvas', () => {
  const subtabsRule = stylesCss.match(/\.tzeentch-subtabs\s*\{(?<body>[\s\S]*?)\}/)?.groups.body || '';
  const subtabRule = stylesCss.match(/\.tzeentch-subtab\s*\{(?<body>[\s\S]*?)\}/)?.groups.body || '';

  assert.match(subtabsRule, /flex-wrap:\s*wrap\s*;/);
  assert.doesNotMatch(subtabsRule, /overflow-x:\s*auto\s*;/);
  assert.doesNotMatch(subtabsRule, /scroll-snap-type\s*:/);
  assert.doesNotMatch(subtabRule, /flex:\s*0\s+0\s+auto\s*;/);
});

test('AR tab is removed while Godeye remains the hosted viewer', () => {
  assert.ok(!operatorHtml.includes('data-tab="ar"'));
  assert.ok(!operatorHtml.includes('id="ar-tab"'));
  assert.ok(!operatorHtml.includes('Camera passthrough'));
  assert.ok(operatorHtml.includes('data-tab="godeye"'));
  assert.ok(operatorHtml.includes('Hosted viewer'));
  assert.ok(operatorHtml.includes('Godeye'));
});

test('Wardriver APK download is linked from the public page', () => {
  assert.ok(indexHtml.includes('/downloads/blue-swallow-wardriver-2.109-bss.1-debug.apk'));
  assert.ok(indexHtml.includes('/downloads/blue-swallow-wardriver.json'));
  assert.ok(indexHtml.includes('f50d2dcf726ef52297968e1a0af9119c7569b7692e1813d70a1ed0274ba95a0e'));
});
