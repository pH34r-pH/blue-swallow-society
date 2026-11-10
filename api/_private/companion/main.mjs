const VIEWS = Object.freeze({ map: 'Map', encounters: 'Encounters', trips: 'Trips', downloads: 'Downloads & devices' });
function node(tag, text = '', className = '') {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
}
function action(text, path, primary = false) {
  const element = node('a', text, 'edge-button' + (primary ? ' primary' : ''));
  element.href = path; return element;
}
function unavailable(root, title, copy, downloads = true) {
  const box = node('div', '', 'canvas-empty');
  const mark = node('span', '⌖'); mark.setAttribute('aria-hidden', 'true');
  box.append(mark, node('h2', title), node('p', copy));
  if (downloads) { const link = action('Get Wardriver ↗', '/operator/downloads'); link.dataset.route = 'downloads'; box.append(link); }
  root.replaceChildren(box);
}
function releaseCard(root, release) {
  // The server validates the receipt/signature pin; these checks constrain DOM links.
  if (release.packageId !== 'co.blueswallow.wardriver.vnext' || release.channel !== 'private-vnext'
    || !Number.isSafeInteger(release.versionCode) || !/^[a-f0-9]{40}$/.test(release.sourceCommit)
    || release.apk?.fileName !== 'wardriver-vnext-' + release.versionCode + '.apk') throw new Error('invalid_release');
  const prefix = '/api/companion-downloads/' + release.versionCode + '/' + release.sourceCommit + '/';
  const card = node('article', '', 'release-card');
  card.append(node('p', 'PRIVATE VNEXT · ANDROID', 'field-label'), node('h2', 'Wardriver ' + release.versionName),
    node('p', 'The development app, with its matching Flipper extension. This package is separate from the legacy production app.'));
  const metadata = node('dl', '', 'release-meta');
  for (const [label, value] of [['Package', release.packageId], ['Version code', release.versionCode],
    ['Published', new Date(release.publishedAt).toLocaleString()], ['APK size', (release.apk.sizeBytes / 1048576).toFixed(1) + ' MiB'],
    ['Source revision', release.sourceCommit], ['APK SHA-256', release.apk.sha256], ['Signing certificate SHA-256', release.signerSha256]]) {
    metadata.append(node('dt', label), node('dd', String(value)));
  }
  const actions = node('div', '', 'release-actions');
  actions.append(action('Download Android APK ↓', prefix + release.apk.fileName, true), action('Release receipt ↗', prefix + 'release.json'));
  for (const extension of release.extensions || []) {
    if (!/^[a-z][a-z0-9_]{0,63}\.fap$/.test(extension.fileName)) throw new Error('invalid_extension');
    actions.append(action(extension.name + ' .fap ↓', prefix + extension.fileName));
  }
  card.append(metadata, actions); root.replaceChildren(card);
  const guide = node('section', '', 'install-guide'); const steps = node('ol');
  guide.append(node('h2', 'From this PC to your phone'));
  for (const text of ['Download the APK above and transfer it to your Android phone, or open this private site on the phone.',
    'Open the APK. If Android asks, allow installation from the app you used to open it, then complete installation.',
    'Open Wardriver vNext and review its requested permissions. Install later versions over the same vNext app when Android accepts the update.',
    'Shared viewing and device contribution are separate. Ask the group owner for a device invitation when you are ready to contribute.',
    'The APK includes its matching Flipper extension. Use Wardriver’s supported Bluetooth installation flow, or keep the paired FAP and receipt together.']) steps.append(node('li', text));
  guide.append(steps, node('p', 'This page provides a specific version and source revision. Refresh to check for a newer published build. Phone installation and update acceptance still need to be verified on your device.'));
  root.append(guide);
}
function setupPanels(signal) {
  const toggle = document.getElementById('toggleScope'), controls = document.getElementById('scopeControls');
  function collapse(value) { controls.hidden = value; toggle.textContent = value ? 'Show' : 'Hide'; toggle.setAttribute('aria-expanded', String(!value)); }
  collapse(matchMedia('(max-width:760px)').matches);
  toggle.addEventListener('click', () => collapse(!controls.hidden), { signal });
  const divider = document.getElementById('panelResizer');
  let width = 280;
  function resize(value) {
    width = Math.min(420, Math.max(220, value));
    document.body.style.setProperty('--scope-width', width + 'px'); divider.setAttribute('aria-valuenow', String(Math.round(width)));
  }
  divider.addEventListener('keydown', (event) => {
    const changes = { ArrowLeft: width - 20, ArrowRight: width + 20, Home: 220, End: 420 };
    if (changes[event.key] === undefined) return;
    event.preventDefault(); resize(changes[event.key]);
  }, { signal });
  divider.addEventListener('pointerdown', (event) => { divider.setPointerCapture(event.pointerId); }, { signal });
  divider.addEventListener('pointermove', (event) => { if (divider.hasPointerCapture(event.pointerId)) resize(event.clientX); }, { signal });
  divider.addEventListener('pointerup', (event) => { if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId); }, { signal });
}
export function mount(context) {
  const { signal } = context;
  const root = document.getElementById('viewContent');
  const status = document.getElementById('workspaceStatus');
  let requestController;
  let generation = 0;
  async function show(view, push = false) {
    if (!VIEWS[view]) view = 'map';
    if (push) history.pushState(null, '', '/operator/' + view);
    document.body.dataset.view = view;
    document.getElementById('workspaceTitle').textContent = VIEWS[view];
    document.getElementById('viewName').textContent = VIEWS[view];
    document.querySelectorAll('[data-route]').forEach((link) => {
      if (link.dataset.route === view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    document.title = VIEWS[view] + ' — Blue Swallow';
    status.textContent = '';
    requestController?.abort(); requestController = new AbortController();
    const current = ++generation;
    if (view !== 'downloads') {
      const copy = { map: 'A compatible shared dataset is not connected yet. No observations or locations are being displayed.',
        encounters: 'Encounters will appear when compatible shared observations are available. No encounter history is loaded.',
        trips: 'Trip history is not connected yet. Capture points alone are not treated as complete trips.' };
      unavailable(root, view === 'map' ? 'Your shared map starts here' : 'No ' + view + ' loaded', copy[view]); return;
    }
    unavailable(root, 'Checking the current release', 'Reading the private, validated development release…', false);
    try {
      const response = await context.request('/api/companion-downloads/current.json', { signal: requestController.signal });
      if (!response.ok) throw new Error('release_unavailable');
      const release = await response.json();
      if (current === generation && !signal.aborted) releaseCard(root, release);
    } catch {
      if (current !== generation || signal.aborted) return;
      unavailable(root, 'Downloads are temporarily unavailable', 'The private release could not be verified. Try again later; no substitute or older build is offered.', false);
      const retry = node('button', 'Retry release check', 'edge-button');
      retry.addEventListener('click', () => show('downloads'), { signal }); root.append(retry);
    }
  }
  document.body.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-route]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
    event.preventDefault(); void show(link.dataset.route, true);
  }, { signal });
  window.addEventListener('popstate', () => {
    const view = location.pathname.split('/').at(-1);
    if (VIEWS[view]) void show(view); else location.replace('/');
  }, { signal });
  document.getElementById('lockCompanion').addEventListener('click', () => context.lock(), { signal });
  document.getElementById('renewSession').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try { await context.renew(); status.textContent = 'Session extended.'; }
    catch { if (!signal.aborted) status.textContent = 'Unable to extend the session. Please try again before it expires.'; }
    finally { event.target.disabled = false; updateTime(); }
  }, { signal });
  function updateTime() {
    const remaining = Math.max(0, Math.ceil((Date.parse(context.expiresAt()) - Date.now()) / 60000));
    const label = document.getElementById('sessionTime');
    if (label) label.textContent = 'Locks in ' + remaining + ' min';
  }
  const clock = setInterval(updateTime, 10000); updateTime();
  setupPanels(signal);
  void show(location.pathname.split('/').at(-1));
  document.getElementById('workspace').focus({ preventScroll: true });
  return () => { generation++; requestController?.abort(); clearInterval(clock); root.replaceChildren(); document.body.style.removeProperty('--scope-width'); };
}
