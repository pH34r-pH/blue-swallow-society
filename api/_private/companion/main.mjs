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
function renderFixDetails(details, inspector, emptyInspector, point) {
  details.replaceChildren(); inspector.replaceChildren(...emptyInspector.map((child) => child.cloneNode(true)));
  if (!point) return;
  const facts = [['Location', `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`],
    ['Horizontal accuracy', point.accuracyMetres === null ? 'Not recorded' : `${point.accuracyMetres.toFixed(1)} m`],
    ['Contributor', point.publisher], ['Session', point.sessionId], ['Boot epoch', point.bootEpoch],
    ['Capture elapsed nanoseconds', point.captureElapsedNs], ['Wall time milliseconds', point.wallTimeMs]];
  const list = node('dl', '', 'receiver-facts');
  for (const [key, value] of facts) list.append(node('dt', key), node('dd', value));
  details.append(node('h2', 'Receiver fix'), list); inspector.replaceChildren(details.cloneNode(true));
}
function createReceiverMap(root, context) {
  let map = null; let run = 0; let library;
  const inspector = document.querySelector('.inspector-empty');
  const emptyInspector = [...inspector.childNodes].map((child) => child.cloneNode(true));
  function clear() { run++; map?.remove(); map = null; inspector.replaceChildren(...emptyInspector.map((child) => child.cloneNode(true))); }
  function ready(status, client) { return Boolean(client && status.rosterRevision && !status.suspended && ['ready', 'partial'].includes(status.phase)); }
  async function update(status, client) {
    clear();
    if (document.body.dataset.view !== 'map') return;
    if (!ready(status, client)) {
      unavailable(root, 'Your shared map starts here', 'Read shared data to display verified receiver locations.'); return;
    }
    const current = run;
    unavailable(root, 'Preparing receiver map', 'Checking the current dataset generation…', false);
    try {
      const projection = await client.receiverFixes();
      if (current !== run || context.signal.aborted) return;
      if (!projection.points.length) { unavailable(root, 'No receiver fixes available', 'No eligible receiver locations are present in this dataset scope.', false); return; }
      library ||= context.openMap(); const renderer = await library;
      if (current !== run || context.signal.aborted) return;
      const canvas = node('div', '', 'receiver-map'); canvas.setAttribute('aria-label', 'Map of receiver capture locations');
      const description = node('p', `Receiver capture locations · ${projection.points.length} shown${projection.truncated ? ' · additional fixes omitted' : ''}. These are not transmitter locations.`, 'panel-copy');
      const basemap = node('button', 'Show OpenStreetMap basemap', 'edge-button');
      basemap.disabled = true;
      const privacy = node('p', 'Loading the basemap sends the map area to OpenStreetMap.', 'panel-copy');
      const label = node('label', 'Inspect a receiver fix', 'field-label'); label.htmlFor = 'receiverSelection';
      const select = node('select'); select.id = 'receiverSelection';
      const prompt = node('option', 'Choose a receiver fix'); prompt.value = ''; select.append(prompt);
      const details = node('div', '', 'receiver-details'); details.setAttribute('aria-live', 'polite');
      const byId = new Map(projection.points.map((point) => [point.id, point]));
      for (const [index, point] of projection.points.entries()) {
        const option = node('option', `Fix ${index + 1} · ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`);
        option.value = point.id; select.append(option);
      }
      function inspect(id) {
        renderFixDetails(details, inspector, emptyInspector, byId.get(id));
      }
      select.addEventListener('change', () => inspect(select.value), { signal: context.signal });
      root.replaceChildren(canvas, description, basemap, privacy, label, select, details);
      const points = projection.points.map((point) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] }, properties: { id: point.id } }));
      map = new renderer.Map({ container: canvas, center: points[0].geometry.coordinates, zoom: 12,
        style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#102633' } }] } });
      map.addControl(new renderer.NavigationControl());
      const activeMap = map;
      activeMap.on('load', () => {
        if (current !== run) return;
        activeMap.addSource('fixes', { type: 'geojson', data: { type: 'FeatureCollection', features: points } });
        activeMap.addLayer({ id: 'fixes', type: 'circle', source: 'fixes', paint: { 'circle-radius': 5, 'circle-color': '#5de8f5', 'circle-stroke-width': 1, 'circle-stroke-color': '#05212d' } });
        activeMap.on('click', 'fixes', (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === 'string' && byId.has(id)) { select.value = id; inspect(id); }
        });
        basemap.disabled = false;
        if (points.length > 1) { const bounds = new renderer.LngLatBounds(); points.forEach((point) => bounds.extend(point.geometry.coordinates)); activeMap.fitBounds(bounds, { padding: 45, maxZoom: 15, duration: 0 }); }
      });
      basemap.addEventListener('click', () => {
        if (!activeMap.isStyleLoaded() || activeMap.getSource('basemap')) return;
        activeMap.addSource('basemap', { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256,
          maxzoom: 19, attribution: '© OpenStreetMap contributors' });
        activeMap.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' }, 'fixes'); basemap.disabled = true;
      }, { signal: context.signal });
    } catch {
      library = null;
      if (current === run && !context.signal.aborted) unavailable(root, 'Receiver map unavailable', 'The current receiver locations could not be displayed. Refresh the shared data and try again.', false);
    }
  }
  return { update, clear };
}
function setupDataset(context, onData) {
  const refresh = document.getElementById('refreshDataset'), cancel = document.getElementById('cancelDataset');
  const clear = document.getElementById('clearDataset'), title = document.getElementById('datasetTitle');
  const summary = document.getElementById('datasetSummary'), coverage = document.getElementById('datasetCoverage');
  const peers = document.getElementById('datasetPeers'); let client = null; let opening = false; let lastStatus = { phase: 'idle' };
  const failures = { invalid_dataset: 'A dataset could not be verified.', invalid_roster: 'Group membership could not be verified.',
    roster_changed: 'Membership changed. Refresh to verify the new revision.', dataset_capacity: 'This session reached its data limit.',
    budget: 'More history remains. Continue reading to make progress.', cancelled: 'Refresh cancelled; accepted batches are retained.',
    dataset_unavailable: 'Shared data is unavailable. The owner may need to enable access.', session_expired: 'The session has expired.' };
  function renderPeers(value) {
    peers.replaceChildren();
    for (const peer of value.peers || []) {
      const row = node('li'); const labels = { pending: 'waiting', processing: 'reading', more: 'more history', empty: 'no accepted batches',
        up_to_date: 'checked', error: 'verification incomplete' };
      const cutoff = peer.acceptedThrough === null ? '' : ` · accepted through ${peer.acceptedThrough}`;
      row.append(node('strong', peer.displayName), node('span', `${peer.active ? '' : 'Revoked · '}${labels[peer.status] || 'incomplete'} · batch ${peer.cursor}${cutoff}`)); peers.append(row);
    }
  }
  function description(value) {
    if (value.failure) return failures[value.failure] || 'Some data could not be verified.';
    if (value.phase === 'idle') return 'Read the shared observation history for this session.';
    return `Batches accepted: ${value.commits || 0} · Records retained: ${value.records || 0} · Disputed identities: ${value.conflicts || 0}`;
  }
  function status(value) {
    if (context.signal.aborted) return;
    onData(value, client);
    lastStatus = value;
    const busy = value.phase === 'refreshing'; refresh.disabled = busy; cancel.hidden = !busy || !client;
    clear.hidden = value.phase === 'idle' || !client;
    refresh.textContent = value.more ? 'Continue reading' : value.phase === 'idle' ? 'Read shared data' : 'Refresh shared data';
    title.textContent = busy ? 'Reading shared history' : value.phase === 'ready' ? 'Observation chains checked'
      : value.phase === 'idle' ? 'No shared dataset loaded' : 'Shared history is incomplete';
    summary.textContent = description(value);
    coverage.textContent = value.phase === 'idle' ? ''
      : 'Receiver fixes only. Encounters, trips, independent evidence and emitter estimates are not included.';
    renderPeers(value);
    document.getElementById('connectionState').textContent = title.textContent;
    if (value.phase === 'failed') { client?.destroy(); client = null; }
  }
  refresh.addEventListener('click', async () => {
    if (opening) return;
    opening = true; status({ ...lastStatus, phase: 'refreshing', failure: null });
    try { if (!client) client = await context.openDataset(status); if (!context.signal.aborted) client.refresh(); }
    catch { status({ phase: 'failed', failure: 'dataset_unavailable' }); }
    finally { opening = false; }
  }, { signal: context.signal });
  cancel.addEventListener('click', () => client?.cancel(), { signal: context.signal });
  clear.addEventListener('click', () => { onData({ phase: 'idle' }, client); client?.clear(); }, { signal: context.signal });
  return { current: () => ({ status: lastStatus, client }), destroy: () => { client?.destroy(); client = null; peers.replaceChildren(); } };
}
export function mount(context) {
  const { signal } = context;
  const root = document.getElementById('viewContent');
  const status = document.getElementById('workspaceStatus');
  let requestController;
  let generation = 0;
  const receiverMap = createReceiverMap(root, context);
  let dataset;
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
    receiverMap.clear();
    if (view === 'map' && dataset) { const data = dataset.current(); void receiverMap.update(data.status, data.client); return; }
    if (view !== 'downloads') {
      const copy = { map: 'The shared map projection is not available yet. No observations or locations are being displayed.',
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
  dataset = setupDataset(context, (value, client) => { if (document.body.dataset.view === 'map') void receiverMap.update(value, client); });
  void show(location.pathname.split('/').at(-1));
  document.getElementById('workspace').focus({ preventScroll: true });
  return () => { generation++; requestController?.abort(); receiverMap.clear(); dataset.destroy(); clearInterval(clock); root.replaceChildren(); document.body.style.removeProperty('--scope-width'); };
}
