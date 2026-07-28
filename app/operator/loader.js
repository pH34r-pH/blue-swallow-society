import {
  clearOperatorSession,
  getActiveOperatorSession,
} from './operator-session.mjs';

const PRIVATE_ASSET_PREFIX = '/api/operator-assets/';

const PRIVATE_ASSETS = Object.freeze([
  'styles.css',
  'theme.css',
  'maplibre-gl.css',
  'operator-mark.svg',
  'operator-session.mjs',
  'map-math.mjs',
  'chained-daemon.mjs',
  'tzeentch-dashboard.mjs',
  'tzeentch.mjs',
  'wigle.mjs',
  'godeye-controller.mjs',
  'vision.mjs',
  'vision-controller.mjs',
  'godeye-global.mjs',
  'godeye-layers.mjs',
  'godeye-session-analysis.mjs',
  'maplibre-gl-shared.mjs',
  'maplibre-gl-worker.mjs',
  'maplibre-gl.mjs',
  'godeye-map.mjs',
  'morning-brief.mjs',
  'osint-applications.mjs',
  'main.js',
]);

const MODULE_BOOT_ORDER = Object.freeze([
  'operator-session.mjs',
  'map-math.mjs',
  'chained-daemon.mjs',
  'tzeentch-dashboard.mjs',
  'tzeentch.mjs',
  'wigle.mjs',
  'godeye-controller.mjs',
  'vision.mjs',
  'vision-controller.mjs',
  'godeye-global.mjs',
  'godeye-layers.mjs',
  'godeye-session-analysis.mjs',
  'maplibre-gl-shared.mjs',
  'maplibre-gl-worker.mjs',
  'maplibre-gl.mjs',
  'godeye-map.mjs',
  'morning-brief.mjs',
  'osint-applications.mjs',
  'main.js',
]);

let activeObjectUrls = [];

function clearPrivateObjectUrls() {
  for (const url of activeObjectUrls) {
    URL.revokeObjectURL(url);
  }
  activeObjectUrls = [];
}

function redirectHome() {
  clearPrivateObjectUrls();
  clearOperatorSession();
  window.location.replace('/');
}

function operatorHeaders(session, headers = {}) {
  return {
    Accept: 'text/plain, text/css, application/javascript, image/svg+xml',
    'X-Blue-Swallow-Operator-Token': session.token,
    ...headers,
  };
}

async function fetchPrivateAsset(assetName, session) {
  const response = await fetch(`${PRIVATE_ASSET_PREFIX}${assetName}`, {
    headers: operatorHeaders(session),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Private operator asset unavailable: ${assetName}`);
  }
  return response.text();
}

function createPrivateObjectUrl(assetName, source, type) {
  const url = URL.createObjectURL(new Blob([source], { type }));
  activeObjectUrls.push(url);
  return url;
}

function replaceAssetReference(source, assetName, replacement) {
  return source
    .replaceAll(`'./${assetName}'`, `'${replacement}'`)
    .replaceAll(`"./${assetName}"`, `"${replacement}"`)
    .replaceAll(`${PRIVATE_ASSET_PREFIX}${assetName}`, replacement);
}

function rewriteModule(assetName, source, assetUrls) {
  let rewritten = source.replace(/\n\/\/# sourceMappingURL=[^\n]+\s*$/u, '\n');
  for (const [dependency, url] of Object.entries(assetUrls)) {
    rewritten = replaceAssetReference(rewritten, dependency, url);
  }

  if (assetName === 'maplibre-gl.mjs') {
    const workerUrl = assetUrls['maplibre-gl-worker.mjs'];
    const marker = 'function fi(){let e=import.meta.url;';
    if (!workerUrl || !rewritten.includes(marker)) {
      throw new Error('MapLibre worker bootstrap could not be sealed.');
    }
    rewritten = rewritten.replace(marker, `function fi(){let e=${JSON.stringify(workerUrl)};if(e)return e;e=import.meta.url;`);
  }

  return rewritten;
}

function installPrivateStyle(id, source) {
  const existing = document.getElementById(id);
  if (existing) {
    existing.textContent = source;
    return;
  }
  const style = document.createElement('style');
  style.id = id;
  style.textContent = source;
  document.head.appendChild(style);
}

async function preparePrivateAssets(session) {
  const entries = await Promise.all(PRIVATE_ASSETS.map(async (assetName) => [
    assetName,
    await fetchPrivateAsset(assetName, session),
  ]));
  const sources = Object.fromEntries(entries);
  const assetUrls = {};

  for (const assetName of MODULE_BOOT_ORDER) {
    assetUrls[assetName] = createPrivateObjectUrl(
      assetName,
      rewriteModule(assetName, sources[assetName], assetUrls),
      'text/javascript',
    );
  }

  assetUrls['operator-mark.svg'] = createPrivateObjectUrl(
    'operator-mark.svg',
    sources['operator-mark.svg'],
    'image/svg+xml',
  );
  installPrivateStyle('bss-operator-styles', sources['styles.css']);
  installPrivateStyle('bss-operator-theme', sources['theme.css']);
  installPrivateStyle('bss-maplibre-styles', sources['maplibre-gl.css']);
  return Object.freeze(assetUrls);
}

function renderPrivateShell(shell, assetUrls) {
  return shell.replaceAll(
    `${PRIVATE_ASSET_PREFIX}operator-mark.svg`,
    assetUrls['operator-mark.svg'],
  );
}

export async function bootOperatorSurface() {
  const session = getActiveOperatorSession();
  if (!session) {
    redirectHome();
    return;
  }

  const response = await fetch('/api/operator-shell', {
    headers: operatorHeaders(session, { Accept: 'text/html' }),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    redirectHome();
    return;
  }

  const [shell, assetUrls] = await Promise.all([
    response.text(),
    preparePrivateAssets(session),
  ]);
  const privateSession = await import(assetUrls['operator-session.mjs']);
  if (!privateSession.activateOperatorSession(session)) {
    throw new Error('Private operator session activation failed.');
  }

  document.body.innerHTML = renderPrivateShell(shell, assetUrls);
  document.body.dataset.mode = 'operator';
  const privateMain = await import(assetUrls['main.js']);
  privateMain.bootOperatorSurface();
}

function isDirectOperatorRoute() {
  return window.location.pathname === '/operator' || window.location.pathname.startsWith('/operator/');
}

window.addEventListener('pagehide', clearPrivateObjectUrls, { once: true });
if (isDirectOperatorRoute()) {
  redirectHome();
}
