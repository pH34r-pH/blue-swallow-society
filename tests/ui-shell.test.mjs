import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const rootMainJs = readFileSync(new URL('../app/main.js', import.meta.url), 'utf8');
const operatorHtml = readFileSync(new URL('../app/operator/index.html', import.meta.url), 'utf8');
const operatorShell = readFileSync(new URL('../api/_private/operator/shell.html', import.meta.url), 'utf8');
const operatorLoaderJs = readFileSync(new URL('../app/operator/loader.js', import.meta.url), 'utf8');
const mainJs = readFileSync(new URL('../app/operator/main.js', import.meta.url), 'utf8');
const tzeentchJs = readFileSync(new URL('../app/operator/tzeentch.mjs', import.meta.url), 'utf8');
const stylesCss = readFileSync(new URL('../app/operator/styles.css', import.meta.url), 'utf8');
const rootStylesCss = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');

test('root face is the unchanged Blue Swallow Society passcode split screen', () => {
  assert.match(indexHtml, /<body data-mode="login">/);
  assert.match(indexHtml, /<h1 class="terminal-title">Blue Swallow Society<\/h1>/);
  assert.match(indexHtml, /id="passcodeInput"/);
  assert.match(indexHtml, /aria-label="Passcode"/);
  assert.match(indexHtml, /<button id="loginBtn" class="btn login-btn" type="button">login<\/button>/);
  assert.match(indexHtml, /<script src="\/main\.js" type="module"><\/script>/);
  assert.ok(!indexHtml.includes('/downloads/blue-swallow-wardriver-2.109-bss.1-debug.apk'));
  assert.ok(!indexHtml.includes('/downloads/blue-swallow-wardriver.json'));
  assert.ok(!indexHtml.includes('/operator/'));
  assert.ok(!indexHtml.includes('OPERATOR CONSOLE'));
});

test('root login and standard public branch use the restored white/blue theme, not the operator dark shell', () => {
  assert.match(indexHtml, /<meta name="color-scheme" content="light" \/>/);
  assert.match(indexHtml, /<meta name="theme-color" content="#f8fafc" \/>/);

  assert.match(rootStylesCss, /color-scheme:\s*light\s*;/);
  assert.match(rootStylesCss, /linear-gradient\(180deg, #f8fafc 0%, #e5ecf6 100%\)/);
  assert.match(rootStylesCss, /\.terminal-panel\.login-panel\s*\{[\s\S]*background:\s*linear-gradient\(180deg, rgba\(255, 255, 255, 0\.96\), rgba\(247, 250, 255, 0\.9\)\)/);
  assert.match(rootStylesCss, /\.login-btn\.btn\s*\{[\s\S]*background:\s*linear-gradient\(180deg, #2563eb, #1d4ed8\)/);
  assert.match(rootStylesCss, /\.standard-site\s*\{[\s\S]*background:[\s\S]*linear-gradient\(180deg, #f8fafc 0%, #e5ecf6 100%\)/);
  assert.match(rootStylesCss, /\.standard-site \.panel\s*\{[\s\S]*background:\s*rgba\(255, 255, 255, 0\.92\)/);
  assert.doesNotMatch(rootStylesCss, /color-scheme:\s*dark\s*;/);
  assert.doesNotMatch(rootStylesCss, /--neon-|#040611|#070c18|repeating-linear-gradient/);
});

test('root login branches server-side: operator token opens /operator, every non-token response opens the standard site', () => {
  assert.match(rootMainJs, /fetch\('\/api\/validate-passcode'/);
  assert.match(rootMainJs, /operatorSession\?\.token/);
  assert.match(rootMainJs, /sessionStorage\.setItem\(OPERATOR_SESSION_KEY/);
  assert.match(rootMainJs, /window\.location\.assign\('\/operator'\)/);
  assert.match(rootMainJs, /showStandardSite\(\)/);
  assert.doesNotMatch(rootMainJs, /tzeentch/i);
  assert.doesNotMatch(rootMainJs, /ea7b2d9f4b6ba94bf277201956fa74b88597188eaa065bb12c57421d86c1d0d5/i);
});

test('standard personal site is the non-operator branch and contains no wardriver artifact links', () => {
  assert.match(indexHtml, /id="standardSite"/);
  assert.match(indexHtml, /Event Planning/);
  assert.match(indexHtml, /private gatherings/i);
  assert.ok(!indexHtml.includes('Wardriver APK'));
  assert.ok(!indexHtml.includes('co.blueswallow.wardriver'));
});

test('standard personal site exposes event calendar, list view, and name-based supply claim hooks', () => {
  [
    'id="eventsCalendar"',
    'id="eventsList"',
    'id="eventClaimName"',
    'id="eventClaimNameStatus"',
    'Events calendar',
    'List view',
    'Supply claims',
  ].forEach((needle) => assert.ok(indexHtml.includes(needle), needle));

  assert.match(rootMainJs, /initPublicEvents\(\)/);
  assert.match(rootMainJs, /renderEventsCalendar\(/);
  assert.match(rootMainJs, /renderEventsList\(/);
  assert.match(rootMainJs, /handleSupplyClaim\(/);
});

test('operator entrypoint requires an existing passcode-issued session before showing the console', () => {
  assert.ok(operatorHtml.includes('operatorLoader'));
  assert.ok(operatorHtml.includes('/operator/loader.js'));
  assert.ok(!operatorHtml.includes('mainInterface'));
  assert.ok(!operatorHtml.includes('/api/operator-downloads/wardriver/apk'));
  assert.ok(operatorLoaderJs.includes("fetch('/api/operator-shell'"));
  assert.ok(operatorLoaderJs.includes("'X-Blue-Swallow-Operator-Token': session.token"));
  assert.ok(operatorLoaderJs.includes("import('/operator/main.js')"));
  assert.ok(operatorShell.includes('terminalScreen'));
  assert.ok(operatorShell.includes('mainInterface'));
  assert.ok(mainJs.includes("window.location.replace('/')"));
  assert.ok(mainJs.includes('getOperatorSession()'));
  assert.ok(mainJs.includes('unlockConsole()'));
});

test('tzeentch shell exposes the restored sub-tabs', () => {
  [
    'data-surface="seek"',
    'data-surface="murmurs"',
    'data-surface="crypto"',
    'data-surface="polymarket"',
    'data-surface="intel"',
  ].forEach((needle) => assert.ok(operatorShell.includes(needle), needle));

  assert.ok(operatorShell.includes('Actionable Intel'));
  assert.ok(!operatorShell.includes('data-surface="markets"'));
  assert.ok(!operatorShell.includes('tzeentchSurfaceMarkets'));
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

test('operator top-level tabs wrap so every peer tab is visible on mobile', () => {
  const tabBarRule = stylesCss.match(/\.tab-bar\s*\{(?<body>[\s\S]*?)\}/)?.groups.body || '';
  const tabButtonRule = stylesCss.match(/\.tab-btn\s*\{(?<body>[\s\S]*?)\}/)?.groups.body || '';

  assert.match(tabBarRule, /flex-wrap:\s*wrap\s*;/);
  assert.doesNotMatch(tabBarRule, /overflow-x:\s*auto\s*;/);
  assert.doesNotMatch(tabBarRule, /scroll-snap-type\s*:/);
  assert.doesNotMatch(tabButtonRule, /flex:\s*0\s+0\s+auto\s*;/);
});

test('AR tab is removed while Godeye remains the hosted viewer', () => {
  assert.ok(!operatorShell.includes('data-tab="ar"'));
  assert.ok(!operatorShell.includes('id="ar-tab"'));
  assert.ok(!operatorShell.includes('Camera passthrough'));
  assert.ok(operatorShell.includes('data-tab="godeye"'));
  assert.ok(operatorShell.includes('Hosted viewer'));
  assert.ok(operatorShell.includes('Godeye'));
});

test('operator shell exposes the slang dictionary as a top-level tab', () => {
  assert.ok(operatorShell.includes('data-tab="slang"'));
  assert.ok(operatorShell.includes('id="slang-tab"'));
  assert.ok(operatorShell.includes('Blue Swallow Society slang dictionary'));
  assert.ok(operatorShell.includes('Choom / Choombah'));
  assert.ok(operatorShell.includes('Wire-digest'));
  assert.ok(!indexHtml.includes('Blue Swallow Society slang dictionary'));
});

test('Wardriver APK links are only operator-token API links', () => {
  assert.ok(!indexHtml.includes('/downloads/blue-swallow-wardriver-2.109-bss.1-debug.apk'));
  assert.ok(!indexHtml.includes('/downloads/blue-swallow-wardriver.json'));
  assert.ok(!operatorHtml.includes('/api/operator-downloads/wardriver/apk'));
  assert.ok(operatorShell.includes('/api/operator-downloads/wardriver/apk'));
  assert.ok(operatorShell.includes('/api/operator-downloads/wardriver/metadata'));
  assert.ok(operatorShell.includes('data-operator-download="apk"'));
  assert.match(mainJs, /function handleOperatorDownload/);
  assert.match(mainJs, /'X-Blue-Swallow-Operator-Token': session\.token/);
  assert.match(mainJs, /fetch\(link\.href/);
});
