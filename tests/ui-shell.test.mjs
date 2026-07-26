import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const rootMainJs = readFileSync(new URL('../app/main.js', import.meta.url), 'utf8');
const operatorHtml = readFileSync(new URL('../app/operator/index.html', import.meta.url), 'utf8');
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
  for (const privateSurface of [
    'X-Blue-Swallow-Operator-Token',
    '/api/operator-shell',
    '/api/operator-assets',
    'Nacre-Moiré',
    'blue-swallow-wardriver',
  ]) {
    assert.ok(!rootMainJs.includes(privateSurface), `root client leaked ${privateSurface}`);
  }
});

test('successful root authentication replaces passcode entry with a sealed handoff before navigation', () => {
  assert.match(indexHtml, /id="loginControls"/);
  assert.match(indexHtml, /id="operatorHandoff"/);
  assert.match(indexHtml, /id="operatorHandoff"[^>]*role="status"/);
  assert.match(rootMainJs, /function showOperatorHandoff\(\)/);
  assert.match(rootMainJs, /operatorHandoffStarted\s*=\s*true/);
  assert.match(rootMainJs, /persistOperatorSession\(session\);\s*showOperatorHandoff\(\);\s*window\.location\.assign\('\/operator'\)/);
  assert.match(rootMainJs, /if \(loginBtn && !operatorHandoffStarted\)/);
});

test('successful root authentication replaces passcode entry with a sealed handoff before navigation', () => {
  assert.match(indexHtml, /id="loginControls"/);
  assert.match(indexHtml, /id="operatorHandoff"/);
  assert.match(indexHtml, /id="operatorHandoff"[^>]*role="status"/);
  assert.match(rootMainJs, /function showOperatorHandoff\(\)/);
  assert.match(rootMainJs, /operatorHandoffStarted\s*=\s*true/);
  assert.match(rootMainJs, /persistOperatorSession\(session\);\s*showOperatorHandoff\(\);\s*window\.location\.assign\('\/operator'\)/);
  assert.match(rootMainJs, /if \(loginBtn && !operatorHandoffStarted\)/);
});

test('root login and standard public branch use the restored white/blue theme, not the operator dark shell', () => {
  assert.match(indexHtml, /<meta name="color-scheme" content="light" \/>/);
  assert.match(indexHtml, /<meta name="theme-color" content="#f8fafc" \/>/);

  assert.match(rootStylesCss, /color-scheme:\s*light\s*;/);
  assert.match(rootStylesCss, /linear-gradient\(180deg, #f8fafc 0%, #e5ecf6 100%\)/);
  assert.match(rootStylesCss, /\.standard-site\s*\{[\s\S]*background:[\s\S]*linear-gradient\(180deg, #f8fafc 0%, #e5ecf6 100%\)/);
  assert.match(rootStylesCss, /\.standard-site \.panel\s*\{[\s\S]*background:\s*rgba\(255, 255, 255, 0\.92\)/);
  assert.doesNotMatch(rootStylesCss, /color-scheme:\s*dark\s*;/);
  assert.doesNotMatch(rootStylesCss, /--neon-|#040611|#070c18|repeating-linear-gradient/);
});

test('root login and anonymous operator handoff use one public-safe loader stylesheet', () => {
  const sharedLoaderUrl = new URL('../app/loader.css', import.meta.url);
  assert.equal(existsSync(sharedLoaderUrl), true, 'public loader structure must have one maintained stylesheet');

  const sharedLoaderCss = readFileSync(sharedLoaderUrl, 'utf8');
  const sharedLoginPanelRule = sharedLoaderCss.match(/\.terminal-panel\.login-panel\s*\{(?<body>[\s\S]*?)\}/)?.groups.body || '';
  assert.match(indexHtml, /<link rel="stylesheet" href="\/loader\.css" \/>/);
  assert.match(sharedLoaderCss, /\.terminal-panel\.login-panel\s*\{[\s\S]*background:\s*linear-gradient\(180deg, rgba\(255, 255, 255, 0\.96\), rgba\(247, 250, 255, 0\.9\)\)/);
  assert.match(sharedLoginPanelRule, /text-align:\s*center\s*;/);
  assert.match(sharedLoaderCss, /\.login-btn\.btn\s*\{[\s\S]*background:\s*linear-gradient\(180deg, #2563eb, #1d4ed8\)/);
  assert.match(operatorLoaderCss, /^@import url\('\.\.\/loader\.css'\);\s*$/);
  assert.match(rootStylesCss, /\.operator-handoff\s*\{[\s\S]*background:\s*rgba\(239, 246, 255, 0\.8\)/);
  assert.doesNotMatch(rootStylesCss, /\.terminal-(?:screen|container|panel|title|input-field)|\.login-(?:controls|btn)/);
  assert.doesNotMatch(sharedLoaderCss, /\.operator-handoff/);
  assert.doesNotMatch(sharedLoaderCss, /Nacre-Moiré|nacre-moire|--nacre-|--street-/i);
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
  assert.match(indexHtml, /Dates, venues, and supply claims\./);
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
  assert.ok(operatorHtml.includes('/operator/loader.css'));
  assert.ok(!operatorHtml.includes('mainInterface'));
  assert.ok(!operatorHtml.includes('/api/operator-downloads/wardriver/apk'));
  assert.ok(operatorLoaderJs.includes("fetch('/api/operator-shell'"));
  assert.ok(operatorLoaderJs.includes("'X-Blue-Swallow-Operator-Token': session.token"));
  assert.ok(operatorLoaderJs.includes("loadPrivateStylesheet('styles.css')"));
  assert.ok(operatorLoaderJs.includes("loadPrivateStylesheet('theme.css')"));
  assert.match(operatorLoaderJs, /return new Promise\(/, 'private stylesheet delivery must expose a failure-aware Promise');
  assert.match(operatorLoaderJs, /link\.onload\s*=\s*\(\)\s*=>\s*resolve\(\)/, 'private stylesheet delivery must resolve only after load');
  assert.match(operatorLoaderJs, /link\.onerror\s*=\s*\(\)\s*=>\s*reject\(/, 'private stylesheet delivery must reject a failed private stylesheet request');
  assert.match(operatorLoaderJs, /await Promise\.all\(\[\s*loadPrivateStylesheet\('styles\.css'\),\s*loadPrivateStylesheet\('theme\.css'\),\s*\]\)/, 'the private shell must wait for both private stylesheets before rendering');
  assert.ok(operatorLoaderJs.includes("import('/api/operator-assets/main.js')"));
  assert.ok(operatorShell.includes('terminalScreen'));
  assert.ok(operatorShell.includes('mainInterface'));
  assert.ok(mainJs.includes("window.location.replace('/')"));
  assert.ok(mainJs.includes('getOperatorSession()'));
  assert.ok(mainJs.includes('unlockConsole()'));
});

test('public cover and private console put controls before explanatory copy', () => {
  for (const publicCopy of [
    'Gatherings, dates, supplies.',
    'Dates, venues, and supply claims.',
    'Name required to claim or release supplies.',
  ]) {
    assert.ok(indexHtml.includes(publicCopy), publicCopy);
  }
  for (const publicControl of [
    'id="eventClaimName"',
    'id="eventClaimNameStatus"',
    'aria-live="polite"',
    'id="eventsCalendar"',
    'id="eventsList"',
  ]) {
    assert.ok(indexHtml.includes(publicControl), publicControl);
  }
  assert.match(rootMainJs, /action\.textContent = 'Claim';/);
  assert.match(rootMainJs, /action\.textContent = 'Release';/);
  assert.doesNotMatch(indexHtml, /A lightweight personal planning page for private gatherings/);
  assert.doesNotMatch(indexHtml, /Enter a name, then mark an open supply as yours/);

  for (const operatorControl of [
    'data-tab="tzeentch"',
    'data-tab="godeye"',
    'data-tab="morning-brief"',
    'data-operator-download="apk"',
    'data-operator-release="sha256"',
    'id="tzeentchStatus"',
    'id="godeyeWigleStatus"',
    'aria-label="Global source provenance ledger"',
    'id="briefStatus"',
    'aria-live="polite"',
  ]) {
    assert.ok(operatorShell.includes(operatorControl), operatorControl);
  }
  for (const operatorCopy of [
    'Signed release. Provenance attached.',
    'Verify the release record before install. Captures stay local.',
    'Enter a target.',
    'Method &amp; privacy',
    'Managed Cybermap observations. No camera overlays.',
    'Verified packets. Retention: seven days.',
    'House terms. Use sparingly.',
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
  assert.match(operatorShellApiJs, /createOperatorAssetGrant/);
  assert.match(operatorAssetsApiJs, /verifyOperatorAssetGrant/);
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

test('tzeentch shell exposes Mosaic before Murmurs and Positions after Actionable Intel', () => {
  [
    'data-surface="seek"',
    'data-surface="mosaic"',
    'data-surface="murmurs"',
    'data-surface="intel"',
    'data-surface="positions"',
  ].forEach((needle) => assert.ok(operatorShell.includes(needle), needle));

  assert.ok(operatorShell.includes('Actionable Intel'));
  assert.ok(operatorShell.indexOf('data-surface="mosaic"') < operatorShell.indexOf('data-surface="murmurs"'));
  assert.ok(operatorShell.indexOf('data-surface="intel"') < operatorShell.indexOf('data-surface="positions"'));
  assert.ok(!operatorShell.includes('data-surface="crypto"'));
  assert.ok(!operatorShell.includes('data-surface="polymarket"'));
  assert.ok(!operatorShell.includes('data-surface="markets"'));
  assert.ok(!operatorShell.includes('tzeentchSurfaceMarkets'));
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
  assert.match(mainJs, /function hydrateWardriverRelease/);
  assert.match(mainJs, /'X-Blue-Swallow-Operator-Token': session\.token/);
  assert.doesNotMatch(mainJs, /fetch\(link\.href/);
  assert.doesNotMatch(operatorShell, /download="[^\"]+\.apk"/);
});
