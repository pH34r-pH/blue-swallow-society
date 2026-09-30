import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const rootMainJs = readFileSync(new URL('../app/main.js', import.meta.url), 'utf8');
const operatorHtml = readFileSync(new URL('../app/operator/index.html', import.meta.url), 'utf8');
const archivedShell = readFileSync(new URL('../api/_private/operator/archive/pre-companion-shell.html', import.meta.url), 'utf8');
const operatorShell = readFileSync(new URL('../api/_private/operator/shell.html', import.meta.url), 'utf8');
const operatorLoaderJs = readFileSync(new URL('../app/operator/loader.js', import.meta.url), 'utf8');
const operatorLoaderCss = readFileSync(new URL('../app/operator/loader.css', import.meta.url), 'utf8');
const operatorShellApiJs = readFileSync(new URL('../api/operator-shell/index.js', import.meta.url), 'utf8');
const operatorAssetsApiJs = readFileSync(new URL('../api/operator-assets/index.js', import.meta.url), 'utf8');
const mainJs = readFileSync(new URL('../api/_private/operator/assets/main.js', import.meta.url), 'utf8');
const tzeentchJs = readFileSync(new URL('../api/_private/operator/assets/tzeentch.mjs', import.meta.url), 'utf8');
const stylesCss = readFileSync(new URL('../api/_private/operator/assets/styles.css', import.meta.url), 'utf8');
const nacreStylesUrl = new URL('../api/_private/operator/assets/theme.css', import.meta.url);
const nacreStylesCss = readFileSync(nacreStylesUrl, 'utf8');
const rootStylesCss = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');
const nacreMarkUrl = new URL('../api/_private/operator/assets/nacre-moire-mark.svg', import.meta.url);

test('companion console retains functional controls and provenance', () => {
  for (const operatorControl of [
    'data-tab="world"',
    'data-tab="godeye"',
    'data-tab="devices"',
    'data-operator-download="apk"',
    'data-operator-release="sha256"',
    'id="godeyeSourceHealth"',
    'aria-label="Global source provenance ledger"',
    'aria-live="polite"',
  ]) {
    assert.ok(operatorShell.includes(operatorControl), operatorControl);
  }
  for (const operatorCopy of [
    'Signed release. Provenance attached.',
    'Verify the release record before install. Captures stay local.',
    'Personal observations are evidence of collection, not proof of emitter location or identity.',
  ]) {
    assert.ok(operatorShell.includes(operatorCopy), operatorCopy);
  }
  assert.doesNotMatch(operatorShell, /Operator tools/);
  assert.doesNotMatch(operatorShell, /Telemetry, evidence, and signed releases/);
  assert.doesNotMatch(operatorShell, /Operator surfaces are evidence rooms, not arcades/);
  assert.doesNotMatch(operatorShell, /I keep the cover clean and the operator layer exact/);
  assert.doesNotMatch(operatorShell, /tzeentch-operator-brief/);
  assert.doesNotMatch(operatorShell, /slang-guidance/);
  assert.doesNotMatch(operatorShell, /Modern usage notes/);
});

test('Nacre-Moiré identity is disclosed only inside token-gated operator responses', () => {
  assert.match(operatorShell, /data-persona="nacre-moire"/);
  assert.match(operatorShell, /<h1 class="console-heading">Nacre-Moiré<\/h1>/);
  assert.match(operatorShell, /class="persona-pronouns">they \/ them<\/span>/);
  assert.doesNotMatch(operatorShell, /lorem ipsum|mobile-first cyberpunk console/i);

  const anonymousOperatorBundle = [operatorHtml, operatorLoaderJs, operatorLoaderCss].join('\n');
  assert.doesNotMatch(anonymousOperatorBundle, /Nacre-Moiré|nacre-moire|--nacre-/i);
  assert.doesNotMatch(indexHtml, /Nacre-Moiré|nacre-moire/i);
  assert.doesNotMatch(rootStylesCss, /--nacre-|nacre-moire|moire-field/i);
  assert.match(operatorAssetsApiJs, /theme\.css/);
  assert.match(operatorAssetsApiJs, /nacre-moire-mark\.svg/);
});

test('operator design system uses protected material layers, not generic neon', () => {
  assert.match(stylesCss, /--material-pearl:/);
  assert.match(stylesCss, /--oxidized-patina:/);
  assert.match(stylesCss, /--bruised-violet:/);
  assert.match(stylesCss, /--street-ink:/);
  assert.match(stylesCss, /--corpo-paper:/);
  assert.match(nacreStylesCss, /\.moire-field/);
  assert.match(nacreStylesCss, /Street-built competence under executive restraint/);
  assert.match(operatorShellApiJs, /requireOperatorToken/);
  assert.match(operatorAssetsApiJs, /verifyOperatorRequest/);
  assert.match(operatorLoaderJs, /URL\.createObjectURL/);
  assert.doesNotMatch(`${stylesCss}\n${nacreStylesCss}`, /--neon-|same cyberpunk shell/i);
  assert.doesNotMatch(`${stylesCss}\n${nacreStylesCss}`, /#72ff9f|#55e8ff|#ff4fd8|rgba\(71,\s*227,\s*130/i);
});

test('Nacre-Moiré interference mark is a committed accessible vector asset', () => {
  assert.equal(existsSync(nacreMarkUrl), true);
  const nacreMark = readFileSync(nacreMarkUrl, 'utf8');
  assert.match(nacreMark, /<svg/);
  assert.match(nacreMark, /<title(?:\s+[^>]*)?>Nacre-Moiré interference mark<\/title>/);
  assert.match(nacreMark, /id="nacre-iridescence"/);
  assert.match(nacreMark, /class="moire-line"/);
});

test('archived tzeentch shell exposes Mosaic before Murmurs and Positions after Actionable Intel', () => {
  [
    'data-surface="seek"',
    'data-surface="mosaic"',
    'data-surface="murmurs"',
    'data-surface="intel"',
    'data-surface="positions"',
  ].forEach((needle) => assert.ok(archivedShell.includes(needle), needle));

  assert.ok(archivedShell.includes('Actionable Intel'));
  assert.ok(archivedShell.indexOf('data-surface="mosaic"') < archivedShell.indexOf('data-surface="murmurs"'));
  assert.ok(archivedShell.indexOf('data-surface="intel"') < archivedShell.indexOf('data-surface="positions"'));
  assert.ok(!archivedShell.includes('data-surface="crypto"'));
  assert.ok(!archivedShell.includes('data-surface="polymarket"'));
  assert.ok(!archivedShell.includes('data-surface="markets"'));
  assert.ok(!archivedShell.includes('tzeentchSurfaceMarkets'));
});

test('tzeentch client uses one surface manifest and no legacy market carousel state', () => {
  assert.match(tzeentchJs, /export const TZEENTCH_SURFACES\s*=\s*\[/);
  assert.match(tzeentchJs, /const TZEENTCH_INTEL_VIEWS\s*=\s*\[/);
  assert.match(tzeentchJs, /label:\s*'Crypto'/);
  assert.match(tzeentchJs, /label:\s*'Polymarket'/);
  assert.match(tzeentchJs, /label:\s*'Proposals'/);
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

test('Actionable Intel child tabs and the paper matrix stay responsive', () => {
  const intelViewsRule = stylesCss.match(/\.tzeentch-intel-views\s*\{(?<body>[\s\S]*?)\}/)?.groups.body || '';
  const intelViewRule = stylesCss.match(/\.tzeentch-intel-view\s*\{(?<body>[\s\S]*?)\}/)?.groups.body || '';
  const positionsGridRule = stylesCss.match(/\.tzeentch-position-grid\s*\{(?<body>[\s\S]*?)\}/)?.groups.body || '';

  assert.match(intelViewsRule, /flex-wrap:\s*wrap\s*;/);
  assert.match(intelViewsRule, /overflow-x:\s*visible\s*;/);
  assert.match(intelViewRule, /min-height:\s*44px\s*;/);
  assert.match(positionsGridRule, /repeat\(auto-fit,\s*minmax\(/);
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
  assert.ok(operatorShell.includes('Personal observations'));
  assert.ok(operatorShell.includes('Cybermap'));
});

test('archived operator shell preserves the slang dictionary as a top-level tab', () => {
  assert.ok(archivedShell.includes('data-tab="slang"'));
  assert.ok(archivedShell.includes('id="slang-tab"'));
  assert.ok(archivedShell.includes('Blue Swallow Society slang dictionary'));
  assert.ok(archivedShell.includes('Choom / Choombah'));
  assert.ok(archivedShell.includes('Wire-digest'));
  assert.ok(!indexHtml.includes('Blue Swallow Society slang dictionary'));
});

test('Godeye is a fixed-route workbench rather than an arbitrary endpoint loader', () => {
  ['godeyeLayerLedger', 'godeyeSourceHealth', 'godeyeSelectedCell', 'godeyeTimeline', 'godeyeMapCanvas'].forEach((id) => {
    assert.ok(operatorShell.includes(`id="${id}"`), id);
  });
  assert.ok(!operatorShell.includes('wigleEndpointInput'));
  assert.ok(!operatorShell.includes('wigleConnectBtn'));
  assert.ok(mainJs.includes('/api/operator-signals'));
});

test('Wardriver APK links are only operator-token API links', () => {
  assert.ok(!indexHtml.includes('/downloads/blue-swallow-wardriver-2.109-bss.1-debug.apk'));
  assert.ok(!indexHtml.includes('/downloads/blue-swallow-wardriver.json'));
  assert.ok(!operatorHtml.includes('/api/operator-downloads/wardriver/apk'));
  assert.ok(operatorShell.includes('/api/operator-downloads/wardriver/apk'));
  assert.ok(operatorShell.includes('/api/operator-downloads/wardriver/metadata'));
  assert.ok(operatorShell.includes('data-operator-download="apk"'));
  assert.match(mainJs, /function handleOperatorDownload/);
  assert.match(mainJs, /function hydrateWardriverRelease/);
  assert.match(mainJs, /operatorRequestHeaders/);
  assert.match(readFileSync(new URL('../api/_private/operator/assets/operator-session.mjs', import.meta.url), 'utf8'), /X-Blue-Swallow-Operator-Token/);
  assert.match(mainJs, /fetch\(link\.href, \{[\s\S]*buildOperatorHeaders\(\{ Accept: 'application\/vnd\.blue-swallow\.wardriver-download-url\+json' \}\)/);
  assert.match(mainJs, /isBoundedWardriverDownloadUrl/);
  assert.match(mainJs, /window\.location\.replace\(downloadUrl\)/);
  assert.doesNotMatch(mainJs, /document\.cookie|localStorage/);
  assert.doesNotMatch(operatorShell, /download="[^\"]+\.apk"/);
});
