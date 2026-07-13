import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const rootMainJs = readFileSync(new URL('../app/main.js', import.meta.url), 'utf8');
const operatorHtml = readFileSync(new URL('../app/operator/index.html', import.meta.url), 'utf8');
const operatorAgentHtml = readFileSync(new URL('../app/operator/agent.html', import.meta.url), 'utf8');
const operatorShell = readFileSync(new URL('../api/_private/operator/shell.html', import.meta.url), 'utf8');
const operatorPrivateAgentUrl = new URL('../api/_private/operator/agent.html', import.meta.url);
const operatorPrivateAgentHtml = existsSync(operatorPrivateAgentUrl) ? readFileSync(operatorPrivateAgentUrl, 'utf8') : '';
const operatorLoaderJs = readFileSync(new URL('../app/operator/loader.js', import.meta.url), 'utf8');
const operatorAgentLoaderUrl = new URL('../app/operator/agent-loader.js', import.meta.url);
const operatorAgentLoaderJs = existsSync(operatorAgentLoaderUrl) ? readFileSync(operatorAgentLoaderUrl, 'utf8') : '';
const operatorShellApiJs = readFileSync(new URL('../api/operator-shell/index.js', import.meta.url), 'utf8');
const mainJs = readFileSync(new URL('../app/operator/main.js', import.meta.url), 'utf8');
const tzeentchJs = readFileSync(new URL('../app/operator/tzeentch.mjs', import.meta.url), 'utf8');
const stylesCss = readFileSync(new URL('../app/operator/styles.css', import.meta.url), 'utf8');
const nacreStylesUrl = new URL('../api/_private/operator/nacre-moire.css', import.meta.url);
const nacreStylesCss = existsSync(nacreStylesUrl) ? readFileSync(nacreStylesUrl, 'utf8') : '';
const rootStylesCss = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');
const nacreMarkUrl = new URL('../api/_private/operator/nacre-moire-mark.svg', import.meta.url);

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

test('Nacre-Moiré identity is disclosed only inside token-gated operator responses', () => {
  assert.match(operatorShell, /data-persona="nacre-moire"/);
  assert.match(operatorShell, /<h1 class="console-heading">Nacre-Moiré<\/h1>/);
  assert.match(operatorShell, /class="persona-pronouns">they \/ them<\/span>/);
  assert.match(operatorShell, /I keep the operator surface disciplined/);
  assert.match(operatorShell, /Operator surfaces are evidence rooms/);
  assert.doesNotMatch(operatorShell, /lorem ipsum|mobile-first cyberpunk console/i);
  assert.match(operatorPrivateAgentHtml, /Nacre-Moiré Interface Lab/);
  assert.match(operatorPrivateAgentHtml, /They are the operator-side persona/);

  const anonymousOperatorBundle = [operatorHtml, operatorAgentHtml, operatorLoaderJs, operatorAgentLoaderJs, stylesCss].join('\n');
  assert.doesNotMatch(anonymousOperatorBundle, /Nacre-Moiré|nacre-moire|--nacre-/i);
  assert.doesNotMatch(indexHtml, /Nacre-Moiré|nacre-moire/i);
  assert.doesNotMatch(rootStylesCss, /--nacre-|nacre-moire|moire-field/i);
  assert.match(operatorAgentLoaderJs, /fetch\('\/api\/operator-shell\?view=agent'/);
  assert.match(operatorAgentLoaderJs, /'X-Blue-Swallow-Operator-Token': session\.token/);
});

test('operator design system uses protected material layers, not generic neon', () => {
  assert.match(stylesCss, /--material-pearl:/);
  assert.match(stylesCss, /--oxidized-patina:/);
  assert.match(stylesCss, /--bruised-violet:/);
  assert.match(stylesCss, /--street-ink:/);
  assert.match(stylesCss, /--corpo-paper:/);
  assert.match(nacreStylesCss, /\.moire-field/);
  assert.match(nacreStylesCss, /Street-built competence under executive restraint/);
  assert.match(operatorShellApiJs, /NACRE_STYLE_PATH/);
  assert.match(operatorShellApiJs, /NACRE_MARK_PATH/);
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
  assert.match(mainJs, /'X-Blue-Swallow-Operator-Token': session\.token/);
  assert.match(mainJs, /fetch\(link\.href/);
});
