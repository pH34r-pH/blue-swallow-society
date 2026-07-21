import {
  buildTileGrid,
  clamp,
  formatCoordinatePair,
  metersPerPixel,
} from './map-math.mjs';
import { initTzeentchDashboard, stopTzeentchDashboard } from './tzeentch.mjs';
import {
  buildArCandidateBoxes,
  buildWigleMapState,
  filterWigleRecordsByRadius,
  isLiveWigleSnapshot,
  mergeWigleRecords,
  parseWiglePayload,
} from './wigle.mjs';
import {
  buildArDetectionBoxes,
  mergeVisionDetections,
  parseVisionPayload,
} from './vision.mjs';

const TILE_BASE_URL = 'https://tile.openstreetmap.org';
const MAP_ZOOM = 15;
const GEO_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 10000,
};
const OPERATOR_SESSION_KEY = 'blue-swallow-society:operator-session';
const GODEYE_VIEWPORT_ENDPOINT = '/api/cybermap/viewport';

function emptyWigleDataset(source = 'cybermap-postgis') {
  return {
    location: null,
    accessPoints: [],
    source,
    mode: 'viewport',
    live: false,
    updatedAt: null,
  };
}

const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

function getOperatorSession() {
  try {
    const raw = sessionStorage.getItem(OPERATOR_SESSION_KEY);
    const session = raw ? JSON.parse(raw) : null;
    return session && typeof session.token === 'string' && session.token ? session : null;
  } catch {
    return null;
  }
}

function buildOperatorHeaders(headers = {}) {
  const session = getOperatorSession();
  return session?.token
    ? {
      ...headers,
      Authorization: `Bearer ${session.token}`,
      'X-Blue-Swallow-Operator-Token': session.token,
    }
    : { ...headers };
}

function sameOriginPath(endpoint, pathname) {
  try {
    const url = new URL(endpoint, window.location.origin);
    return url.origin === window.location.origin && url.pathname === pathname;
  } catch {
    return false;
  }
}

const state = {
  authenticated: false,
  activeTab: 'landing',
  tabSystemBound: false,
  arBound: false,
  arReady: false,
  arEnabled: false,
  arFullscreen: false,
  arOrientationAngle: 0,
  arOrientationBound: false,
  arLivePollId: 0,
  cameraStream: null,
  motionBound: false,
  motionReady: false,
  motion: {
    alpha: null,
    beta: null,
    gamma: null,
    ax: null,
    ay: null,
    az: null,
    rotationAlpha: null,
    rotationBeta: null,
    rotationGamma: null,
  },
  godeyeBound: false,
  godeyeReady: false,
  geolocationWatchId: null,
  currentLocation: null,
  godeyeRenderFrame: 0,
  godeyeResizeObserver: null,
  godeyeResizeBound: false,
  wigleBound: false,
  wigleRenderFrame: 0,
  wigleData: emptyWigleDataset(),
  wigleLiveData: null,
  wigleLiveReady: false,
  wigleLiveStatus: 'Godeye Cybermap viewport is not connected yet.',
  wigleLiveSourceLabel: 'cybermap-postgis',
  wigleLivePollId: 0,
  wigleEndpoint: GODEYE_VIEWPORT_ENDPOINT,
  wigleStatus: 'Godeye Cybermap viewport is not connected yet.',
  wigleSourceLabel: 'cybermap-postgis',
  visionBound: false,
  visionRenderFrame: 0,
  visionData: { frame: null, detections: [] },
  visionEndpoint: '',
  visionStatus: 'Live object detections are not connected yet.',
  visionSourceLabel: 'live',
};

function init() {
  bindTabSystem();
  bindOperatorDownloads();

  if (isOperatorEntrypoint()) {
    if (!getOperatorSession()) {
      window.location.replace('/');
      return;
    }

    unlockConsole();
    return;
  }

  bindLoginFlow();
  resetConsoleToLogin();
}

function isOperatorEntrypoint() {
  return window.location.pathname === '/operator' || window.location.pathname.startsWith('/operator/');
}

function bindLoginFlow() {
  const loginBtn = $('loginBtn');
  const passcodeInput = $('passcodeInput');

  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  if (passcodeInput) {
    passcodeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        handleLogin();
      }
    });
  }
}

async function handleLogin() {
  const passcodeInput = $('passcodeInput');
  const loginBtn = $('loginBtn');
  const passcode = passcodeInput ? passcodeInput.value.trim() : '';

  if (!passcode) {
    return;
  }

  if (loginBtn) {
    loginBtn.disabled = true;
  }

  try {
    const session = await validatePasscode(passcode);
    if (!session) {
      return;
    }

    persistOperatorSession(session);
    unlockConsole();
  } catch (error) {
    console.error('Login failed', error);
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
    }
  }
}

async function validatePasscode(passcode) {
  const response = await fetch('/api/validate-passcode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ passcode }),
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  if (data?.ok === true && data.operatorSession?.token) {
    return data.operatorSession;
  }

  return null;
}

function persistOperatorSession(session) {
  try {
    sessionStorage.setItem(OPERATOR_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Session storage is best-effort; API calls will fail closed without a bearer token.
  }
}

function unlockConsole() {
  state.authenticated = true;
  state.activeTab = 'landing';

  document.body.dataset.mode = 'operator';

  const terminalScreen = $('terminalScreen');
  const mainInterface = $('mainInterface');

  if (terminalScreen) {
    terminalScreen.classList.remove('active');
    terminalScreen.setAttribute('aria-hidden', 'true');
  }

  if (mainInterface) {
    mainInterface.classList.add('active');
    mainInterface.removeAttribute('aria-hidden');
  }

  initTabDefaults();
  activateTab('landing', { focus: false });
  void hydrateWardriverRelease();
}

function resetConsoleToLogin() {
  state.authenticated = false;
  state.activeTab = 'landing';
  document.body.dataset.mode = 'login';

  const terminalScreen = $('terminalScreen');
  const mainInterface = $('mainInterface');
  const passcodeInput = $('passcodeInput');
  const loginBtn = $('loginBtn');

  if (terminalScreen) {
    terminalScreen.classList.add('active');
    terminalScreen.removeAttribute('aria-hidden');
  }

  if (mainInterface) {
    mainInterface.classList.remove('active');
    mainInterface.setAttribute('aria-hidden', 'true');
  }

  if (passcodeInput) {
    passcodeInput.value = '';
    passcodeInput.focus();
  }

  if (loginBtn) {
    loginBtn.disabled = false;
  }

  stopTzeentchDashboard();
  stopArFeed();
  stopGodeyeFeed();
  state.currentLocation = null;
  state.wigleData = emptyWigleDataset();
  state.wigleLiveData = null;
  state.wigleLiveReady = false;
  state.wigleLiveStatus = 'Godeye Cybermap viewport is not connected yet.';
  state.wigleLiveSourceLabel = 'cybermap-postgis';
  state.wigleEndpoint = GODEYE_VIEWPORT_ENDPOINT;
  state.wigleStatus = 'Godeye Cybermap viewport is not connected yet.';
  state.wigleSourceLabel = 'cybermap-postgis';
  state.visionData = { frame: null, detections: [] };
  state.visionEndpoint = '';
  state.visionStatus = 'Live object detections are not connected yet.';
  state.visionSourceLabel = 'live';
  state.arEnabled = false;
  state.arFullscreen = false;
  const endpointInput = $('wigleEndpointInput');
  if (endpointInput) {
    endpointInput.value = GODEYE_VIEWPORT_ENDPOINT;
  }
  const visionEndpointInput = $('visionEndpointInput');
  if (visionEndpointInput) {
    visionEndpointInput.value = '/api/ar-detections';
  }
  const visionFileInput = $('visionFileInput');
  if (visionFileInput) {
    visionFileInput.value = '';
  }
  setText('arStatusText', 'Camera feed off. Toggle on to request permissions and connect the Godeye Cybermap viewport.');
  setText('geoStatusText', 'Geolocation permission has not been requested yet.');
  setText('wigleStatusText', state.wigleStatus);
  setText('visionStatusText', state.visionStatus);
  syncArFeedToggle();
  renderArHud();
  renderGodeyeFields();
  renderGodeyeMap();
  renderWigleViews();
  updateArFullscreenState(false);
  try {
    sessionStorage.removeItem(OPERATOR_SESSION_KEY);
  } catch {
    // no-op
  }
  resetTabSelection();
}

function bindOperatorDownloads() {
  document.querySelectorAll('[data-operator-download]').forEach((link) => {
    link.addEventListener('click', handleOperatorDownload);
  });
}

function handleOperatorDownload(event) {
  if (event.currentTarget?.getAttribute('aria-disabled') === 'true') {
    event.preventDefault();
    return;
  }
  // Downloads are navigations, not XHR payloads: the HttpOnly operator cookie
  // authorizes the same-origin gate, then the gate issues a per-object Blob SAS.
  // This avoids buffering a release APK in the operator console and keeps the
  // signed Blob URL out of DOM state.
  if (getOperatorSession()?.token) {
    return;
  }
  event.preventDefault();
  window.location.replace('/');
}

async function hydrateWardriverRelease() {
  const card = document.querySelector('[data-operator-release-card]');
  const endpoint = card?.dataset.operatorReleaseMetadata;
  if (!endpoint || !getOperatorSession()?.token) {
    return;
  }

  try {
    const response = await fetch(endpoint, {
      headers: buildOperatorHeaders({ Accept: 'application/json' }),
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Release manifest unavailable (${response.status})`);
    }
    const payload = await response.json();
    const artifact = payload?.artifact;
    if (!artifact || artifact.buildType !== 'release' || artifact.downloadPath !== '/api/operator-downloads/wardriver/apk') {
      throw new Error('Release manifest was rejected.');
    }

    setReleaseField('package', artifact.packageId);
    setReleaseField('version', `${artifact.versionName} / ${artifact.versionCode}`);
    setReleaseField('size', formatReleaseSize(artifact.sizeBytes));
    setReleaseField('signer', compactFingerprint(artifact.signerSha256));
    setReleaseField('source', `${artifact.sourceTag} @ ${artifact.sourceCommit.slice(0, 12)}`);
    setReleaseField('sha256', artifact.sha256);
    setReleaseField('notes', artifact.notes.join(' · '));

    const apkLink = document.querySelector('[data-operator-download="apk"]');
    if (apkLink instanceof HTMLAnchorElement) {
      apkLink.href = artifact.downloadPath;
      apkLink.removeAttribute('aria-disabled');
    }
    const metadataLink = document.querySelector('[data-operator-download="metadata"]');
    if (metadataLink instanceof HTMLAnchorElement) {
      metadataLink.href = artifact.metadataPath;
      metadataLink.removeAttribute('aria-disabled');
    }
  } catch (error) {
    console.error('Wardriver release record unavailable', error);
    setReleaseField('notes', 'Current signed release record is unavailable. Do not substitute the retired debug build.');
    document.querySelectorAll('[data-operator-download]').forEach((link) => link.setAttribute('aria-disabled', 'true'));
  }
}

function setReleaseField(name, value) {
  const field = document.querySelector(`[data-operator-release="${name}"]`);
  if (field) {
    field.textContent = String(value);
  }
}

function formatReleaseSize(sizeBytes) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    return 'Unspecified';
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function compactFingerprint(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    return 'Unverified';
  }
  return `${value.slice(0, 16)}…${value.slice(-8)}`.toUpperCase();
}

function bindTabSystem() {
  if (state.tabSystemBound) {
    return;
  }

  const tabButtons = getTabButtons();
  const tabPanels = getTabPanels();

  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => activateTabByIndex(index, { focus: false }));
    button.addEventListener('keydown', (event) => handleTabKeydown(event, index));
  });

  const logoutBtn = $('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  state.tabSystemBound = true;
  setTabAria(tabButtons, tabPanels, 0);
}

function initTabDefaults() {
  initArTab();
  initGodeyeTab();
  updateArOrientation();
  renderArHud();
  renderGodeyeMap();
  renderWigleViews();
}

async function handleLogout() {
  stopTzeentchDashboard();
  stopArFeed();
  stopGodeyeFeed();
  clearOperatorSession();

  try {
    await fetch('/api/operator-logout', { method: 'POST' });
  } catch {
    // The session storage token is already gone; the HttpOnly cookie will expire by TTL if this fails.
  }

  window.location.replace('/');
}

function clearOperatorSession() {
  try {
    sessionStorage.removeItem(OPERATOR_SESSION_KEY);
  } catch {
    // no-op
  }
}

function getTabButtons() {
  return Array.from($$('.tab-btn[data-tab]'));
}

function getTabPanels() {
  return Array.from($$('.tab-content'));
}

function resetTabSelection() {
  const tabButtons = getTabButtons();
  const tabPanels = getTabPanels();
  setTabAria(tabButtons, tabPanels, 0);
}

function activateTab(tabKey, { focus = false } = {}) {
  const tabButtons = getTabButtons();
  const tabPanels = getTabPanels();
  const nextIndex = tabButtons.findIndex((button) => button.dataset.tab === tabKey);

  if (nextIndex === -1) {
    return;
  }

  activateTabByIndex(nextIndex, { focus, tabButtons, tabPanels });
}

function activateTabByIndex(index, { focus = false, tabButtons = getTabButtons(), tabPanels = getTabPanels() } = {}) {
  if (!tabButtons.length) {
    return;
  }

  const normalizedIndex = ((index % tabButtons.length) + tabButtons.length) % tabButtons.length;
  const nextButton = tabButtons[normalizedIndex];
  const nextTabKey = nextButton?.dataset.tab || 'landing';

  if (nextTabKey === state.activeTab && state.authenticated) {
    if (focus && nextButton) {
      nextButton.focus();
    }
    return;
  }

  if (state.activeTab === 'ar' && nextTabKey !== 'ar') {
    stopArFeed();
  }

  if (state.activeTab === 'godeye' && nextTabKey !== 'godeye') {
    stopGodeyeFeed();
  }

  if (nextTabKey === 'tzeentch') {
    initTzeentchDashboard();
  }

  setTabAria(tabButtons, tabPanels, normalizedIndex);
  state.activeTab = nextTabKey;

  if (nextTabKey === 'ar') {
    initArTab();
  }

  if (nextTabKey === 'godeye') {
    initGodeyeTab();
    scheduleGodeyeRender();
  }

  if (focus && nextButton) {
    nextButton.focus();
  }
}

function setTabAria(tabButtons, tabPanels, activeIndex) {
  tabButtons.forEach((button, index) => {
    const isActive = index === activeIndex;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
  });

  tabPanels.forEach((panel, index) => {
    panel.classList.toggle('active', index === activeIndex);
    panel.setAttribute('aria-hidden', index === activeIndex ? 'false' : 'true');
  });
}

function handleTabKeydown(event, index) {
  const tabButtons = getTabButtons();
  if (!tabButtons.length) {
    return;
  }

  let nextIndex = index;

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (index + 1) % tabButtons.length;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = tabButtons.length - 1;
      break;
    case 'Enter':
    case ' ':
      activateTabByIndex(index, { focus: true, tabButtons });
      event.preventDefault();
      return;
    default:
      return;
  }

  event.preventDefault();
  activateTabByIndex(nextIndex, { focus: true, tabButtons });
}

function initArTab() {
  if (!state.arBound) {
    const enableBtn = $('arEnableBtn');
    if (enableBtn) {
      enableBtn.addEventListener('click', toggleArFeed);
    }

    const fullscreenBtn = $('arFullscreenBtn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', toggleArFullscreen);
    }

    bindVisionControls();

    if (!state.arOrientationBound) {
      window.addEventListener('resize', updateArOrientation);
      window.addEventListener('orientationchange', updateArOrientation);
      document.addEventListener('fullscreenchange', updateArFullscreenState);
      state.arOrientationBound = true;
    }

    state.arBound = true;
  }

  syncArFeedToggle();
  updateArOrientation();
  renderArHud();
}

function syncArFeedToggle() {
  const button = $('arEnableBtn');
  if (!button) {
    return;
  }

  button.classList.toggle('is-on', state.arEnabled);
  button.setAttribute('aria-pressed', state.arEnabled ? 'true' : 'false');
  button.textContent = state.arEnabled ? 'Camera feed: ON' : 'Camera feed: OFF';
}

function buildWigleRequestPayload(params = {}) {
  const payload = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    payload[key] = value;
  });
  return payload;
}

async function toggleArFeed() {
  if (state.arEnabled) {
    disableArFeed();
    return;
  }

  await enableArFeed();
}

async function enableArFeed() {
  const status = $('arStatusText');
  const enableBtn = $('arEnableBtn');

  state.arEnabled = true;
  syncArFeedToggle();

  if (enableBtn) {
    enableBtn.disabled = true;
  }

  if (status) {
    status.textContent = 'Requesting camera and motion permissions…';
  }

  const messages = [];

  try {
    await ensureCameraStream();
    messages.push('camera passthrough live');
  } catch (error) {
    console.error('Camera unavailable', error);
    messages.push(`camera unavailable: ${error.message}`);
    state.arEnabled = false;
    stopArFeed();
    if (enableBtn) {
      enableBtn.disabled = false;
    }
    if (status) {
      status.textContent = messages.join(' · ');
    }
    syncArFeedToggle();
    return;
  }

  try {
    await ensureMotionTracking();
    messages.push('motion overlay active');
  } catch (error) {
    console.error('Motion unavailable', error);
    messages.push(`motion unavailable: ${error.message}`);
  }

  const live = await refreshLiveWigleFeed();
  messages.push(live ? 'Godeye Cybermap viewport connected' : state.wigleLiveStatus || 'Godeye Cybermap viewport unavailable');
  startWigleLivePolling();

  if (status) {
    status.textContent = messages.join(' · ') || 'AR feed ready.';
  }

  if (enableBtn) {
    enableBtn.disabled = false;
  }

  renderArHud();
  renderWigleViews();
}

function disableArFeed() {
  stopArFeed();
  syncArFeedToggle();
  renderArHud();
  renderWigleViews();
}

function startWigleLivePolling() {
  stopWigleLivePolling();
  if (!state.arEnabled) {
    return;
  }

  state.arLivePollId = window.setInterval(() => {
    if (!state.arEnabled) {
      return;
    }

    void refreshLiveWigleFeed({ quiet: true });
  }, 10000);
}

function stopWigleLivePolling() {
  if (state.arLivePollId) {
    window.clearInterval(state.arLivePollId);
    state.arLivePollId = 0;
  }
}

async function refreshLiveWigleFeed({ quiet = false } = {}) {
  const endpointInput = $('wigleEndpointInput');
  const target = (endpointInput?.value.trim() || state.wigleEndpoint || GODEYE_VIEWPORT_ENDPOINT).trim();
  const location = state.currentLocation || state.wigleData?.location;

  if (!target) {
    setLiveWigleStatus('Godeye Cybermap viewport endpoint is not configured.');
    setWigleStatus('Godeye Cybermap viewport endpoint is not configured.');
    state.wigleLiveReady = false;
    state.wigleLiveData = null;
    renderArCandidateLayer();
    return false;
  }

  if (!location) {
    const message = 'Godeye Cybermap viewport needs a current GPS fix before querying managed PostGIS.';
    setLiveWigleStatus(message);
    setWigleStatus(message);
    state.wigleLiveReady = false;
    state.wigleLiveData = null;
    renderArCandidateLayer();
    return false;
  }

  state.wigleEndpoint = target;
  if (!quiet) {
    setLiveWigleStatus(`Checking Godeye Cybermap viewport from ${target}…`);
    setWigleStatus(`Checking Godeye Cybermap viewport from ${target}…`);
  }

  try {
    const requestPayload = buildWigleRequestPayload({
      lat: location.lat,
      lon: location.lon,
      radiusMeters: 100,
      limit: 100,
      maxAgeMs: 45_000,
    });

    const endpointUrl = new URL(target, window.location.origin).toString();
    const sameOriginGodeye = sameOriginPath(target, GODEYE_VIEWPORT_ENDPOINT);
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: sameOriginGodeye
        ? buildOperatorHeaders({
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          })
        : {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let payload;
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    const current = payload?.live === true || isLiveWigleSnapshot(payload);
    const parsed = parseWiglePayload(payload, { source: 'cybermap-postgis' });
    const sourceLabel = parsed.source || payload?.source || 'cybermap-postgis';
    const message = current
      ? `Godeye Cybermap viewport connected from ${sourceLabel}.`
      : `Godeye Cybermap viewport from ${sourceLabel} returned no recent observations.`;

    applyWigleDataset(parsed, {
      target: 'local',
      sourceLabel,
      message,
      merge: false,
      live: current,
    });
    applyWigleDataset(parsed, {
      target: 'live',
      sourceLabel,
      message,
      merge: false,
      live: current,
    });

    return current;
  } catch (error) {
    console.error('Failed to load Godeye Cybermap viewport', error);
    state.wigleLiveData = null;
    state.wigleLiveReady = false;
    state.wigleLiveSourceLabel = target;
    const message = `Godeye Cybermap viewport unavailable: ${error.message}`;
    setLiveWigleStatus(message);
    setWigleStatus(message);
    renderArCandidateLayer();
    return false;
  }
}

async function toggleArFullscreen() {
  const frame = $('arFrame');
  if (!frame) {
    return;
  }

  try {
    if (document.fullscreenElement === frame) {
      await document.exitFullscreen();
    } else {
      await frame.requestFullscreen();
    }
  } catch (error) {
    console.warn('Fullscreen unavailable', error);
  } finally {
    updateArFullscreenState();
  }
}

function updateArFullscreenState() {
  const frame = $('arFrame');
  const isFullscreen = document.fullscreenElement === frame;
  state.arFullscreen = isFullscreen;

  if (frame) {
    frame.classList.toggle('is-fullscreen', isFullscreen);
  }

  const button = $('arFullscreenBtn');
  if (button) {
    button.textContent = isFullscreen ? 'Exit fullscreen' : 'Fullscreen feed';
  }

  renderArHud();
}

function updateArOrientation() {
  state.arOrientationAngle = getScreenOrientationAngle();
  const stage = $('arStage');
  if (stage) {
    const slide = getOrientationSlide(state.arOrientationAngle);
    stage.style.setProperty('--ar-rotation', `-${state.arOrientationAngle}deg`);
    stage.style.setProperty('--ar-slide-x', slide.x);
    stage.style.setProperty('--ar-slide-y', slide.y);
    stage.dataset.orientation = getOrientationMode(state.arOrientationAngle);
  }

  renderArHud();
}

function getScreenOrientationAngle() {
  if (window.screen?.orientation && typeof window.screen.orientation.angle === 'number') {
    return normalizeAngle(window.screen.orientation.angle);
  }

  if (typeof window.orientation === 'number') {
    return normalizeAngle(window.orientation);
  }

  return state.arOrientationAngle || 0;
}

function getOrientationSlide(angle) {
  const normalized = normalizeAngle(angle);
  if (normalized === 90) {
    return { x: '8px', y: '0px' };
  }

  if (normalized === 270) {
    return { x: '-8px', y: '0px' };
  }

  if (normalized === 180) {
    return { x: '0px', y: '6px' };
  }

  return { x: '0px', y: '0px' };
}

function getOrientationMode(angle) {
  const normalized = normalizeAngle(angle);
  if (normalized === 90 || normalized === 270) {
    return 'landscape';
  }

  const viewportLandscape = typeof window !== 'undefined'
    && Number.isFinite(window.innerWidth)
    && Number.isFinite(window.innerHeight)
    && window.innerWidth > window.innerHeight;

  if (viewportLandscape) {
    return 'landscape';
  }

  return 'portrait';
}

function getArVideoScale(orientationMode) {
  if (!state.arFullscreen || orientationMode !== 'landscape') {
    return 1;
  }

  const viewportWidth = window.visualViewport?.width || window.innerWidth || 0;
  const viewportHeight = window.visualViewport?.height || window.innerHeight || 0;
  if (!viewportWidth || !viewportHeight) {
    return 1;
  }

  return clamp(viewportWidth / viewportHeight, 1, 4);
}

function normalizeAngle(angle) {
  return ((Math.round(angle || 0) % 360) + 360) % 360;
}

async function ensureCameraStream() {
  if (state.cameraStream) {
    return state.cameraStream;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    throw new Error('camera not supported');
  }

  const video = $('arVideo');
  const frame = $('arFrame');

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
    },
    audio: false,
  });

  state.cameraStream = stream;

  if (video) {
    video.srcObject = stream;
    try {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === 'function') {
        await Promise.race([
          playPromise.catch((error) => {
            throw error;
          }),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      }
    } catch (error) {
      console.warn('Camera autoplay blocked', error);
    }
  }

  if (frame) {
    frame.classList.add('has-stream');
  }

  const fallback = $('arFallback');
  if (fallback) {
    fallback.classList.add('hidden');
  }

  return stream;
}

async function ensureMotionTracking() {
  if (state.motionReady) {
    return;
  }

  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    const orientationPermission = await DeviceOrientationEvent.requestPermission();
    if (orientationPermission !== 'granted') {
      throw new Error('deviceorientation permission denied');
    }
  }

  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    const motionPermission = await DeviceMotionEvent.requestPermission();
    if (motionPermission !== 'granted') {
      throw new Error('devicemotion permission denied');
    }
  }

  window.addEventListener('deviceorientation', handleDeviceOrientation, true);
  window.addEventListener('devicemotion', handleDeviceMotion, true);
  state.motionReady = true;
}

function handleDeviceOrientation(event) {
  state.motion.alpha = event.alpha ?? state.motion.alpha;
  state.motion.beta = event.beta ?? state.motion.beta;
  state.motion.gamma = event.gamma ?? state.motion.gamma;
  renderArHud();
}

function handleDeviceMotion(event) {
  const acceleration = event.accelerationIncludingGravity || event.acceleration || {};
  const rotation = event.rotationRate || {};

  state.motion.ax = acceleration.x ?? state.motion.ax;
  state.motion.ay = acceleration.y ?? state.motion.ay;
  state.motion.az = acceleration.z ?? state.motion.az;
  state.motion.rotationAlpha = rotation.alpha ?? state.motion.rotationAlpha;
  state.motion.rotationBeta = rotation.beta ?? state.motion.rotationBeta;
  state.motion.rotationGamma = rotation.gamma ?? state.motion.rotationGamma;
  renderArHud();
}

function stopArFeed() {
  if (state.motionReady) {
    window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
    window.removeEventListener('devicemotion', handleDeviceMotion, true);
  }

  state.motionReady = false;
  state.motion = {
    alpha: null,
    beta: null,
    gamma: null,
    ax: null,
    ay: null,
    az: null,
    rotationAlpha: null,
    rotationBeta: null,
    rotationGamma: null,
  };

  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }

  state.arEnabled = false;
  stopWigleLivePolling();

  const video = $('arVideo');
  if (video) {
    video.srcObject = null;
  }

  const frame = $('arFrame');
  if (frame) {
    frame.classList.remove('has-stream');
    frame.style.removeProperty('--yaw');
    frame.style.removeProperty('--pitch');
    frame.style.removeProperty('--roll');
    frame.style.removeProperty('--pitch-offset');
    frame.style.removeProperty('--ar-rotation');
    frame.style.removeProperty('--ar-slide-x');
    frame.style.removeProperty('--ar-slide-y');
    frame.style.removeProperty('--ar-video-scale');
    frame.dataset.orientation = 'portrait';
  }

  if (document.fullscreenElement === frame && typeof document.exitFullscreen === 'function') {
    void document.exitFullscreen().catch(() => {});
  }

  updateArFullscreenState();

  const fallback = $('arFallback');
  if (fallback) {
    fallback.classList.remove('hidden');
  }

  const status = $('arStatusText');
  if (status && state.authenticated) {
    status.textContent = 'Camera feed off. Toggle on to request permissions and check the Godeye Cybermap viewport.';
  }

  syncArFeedToggle();
  renderArHud();
}

function renderArHud() {
  const frame = $('arFrame');
  const stage = $('arStage');
  const attitude = $('arAttitude');
  const acceleration = $('arAcceleration');
  const rotation = $('arRotation');
  const orientationAngle = state.arOrientationAngle;
  const orientationMode = getOrientationMode(orientationAngle);
  const slide = getOrientationSlide(orientationAngle);

  const alpha = formatAngle(state.motion.alpha);
  const beta = formatAngle(state.motion.beta);
  const gamma = formatAngle(state.motion.gamma);
  const ax = formatAxis(state.motion.ax);
  const ay = formatAxis(state.motion.ay);
  const az = formatAxis(state.motion.az);
  const rotationAlpha = formatAxis(state.motion.rotationAlpha);
  const rotationBeta = formatAxis(state.motion.rotationBeta);
  const rotationGamma = formatAxis(state.motion.rotationGamma);

  if (frame) {
    frame.dataset.orientation = orientationMode;
    frame.style.setProperty('--yaw', `${numberOrZero(state.motion.alpha)}deg`);
    frame.style.setProperty('--pitch', `${clamp(numberOrZero(state.motion.beta), -90, 90)}deg`);
    frame.style.setProperty('--roll', `${numberOrZero(state.motion.gamma)}deg`);
    frame.style.setProperty('--pitch-offset', `${clamp(numberOrZero(state.motion.beta), -45, 45) * 0.35}px`);
  }

  if (stage) {
    stage.dataset.orientation = orientationMode;
    stage.style.setProperty('--ar-rotation', `-${orientationAngle}deg`);
    stage.style.setProperty('--ar-slide-x', slide.x);
    stage.style.setProperty('--ar-slide-y', slide.y);
    stage.style.setProperty('--ar-video-scale', `${getArVideoScale(orientationMode)}`);
  }

  if (attitude) {
    attitude.textContent = `α ${alpha} · β ${beta} · γ ${gamma}`;
  }

  if (acceleration) {
    acceleration.textContent = `accel ${ax} · ${ay} · ${az}`;
  }

  if (rotation) {
    rotation.textContent = `spin ${rotationAlpha} · ${rotationBeta} · ${rotationGamma}`;
  }

  renderArCandidateLayer();
  renderVisionViews();
}

function renderArCandidateLayer() {
  const overlay = $('arWigleCandidates');
  const list = $('arCandidateList');
  const status = $('arWigleStatusText');
  const frame = $('arFrame');
  const records = state.arEnabled && state.wigleLiveReady ? (state.wigleLiveData?.accessPoints || []) : [];
  const sourceLabel = state.wigleLiveSourceLabel || state.wigleLiveData?.source || 'live';
  const summary = state.arEnabled
    ? (state.wigleLiveReady
        ? `${state.wigleLiveStatus} · ${records.length} access point${records.length === 1 ? '' : 's'} · ${sourceLabel}`
        : state.wigleLiveStatus || 'Godeye Cybermap viewport is not available yet.')
    : 'Camera feed off. Toggle on to request permissions and check the Godeye Cybermap viewport.';

  if (status) {
    status.textContent = summary;
  }

  if (list) {
    renderWigleList(list, records);
  }

  if (!overlay) {
    return;
  }

  if (!state.arEnabled || !state.wigleLiveReady || !records.length) {
    const empty = document.createElement('p');
    empty.className = 'dashboard-empty-state';
    if (!state.arEnabled) {
      empty.textContent = 'Toggle the camera feed on to check the Godeye Cybermap viewport.';
    } else if (!state.wigleLiveReady) {
      empty.textContent = 'Godeye Cybermap viewport is not online yet.';
    } else {
      empty.textContent = 'Godeye Cybermap viewport is online, but no recent observations have been reported yet.';
    }
    overlay.replaceChildren(empty);
    return;
  }

  const width = frame?.clientWidth || 1080;
  const height = frame?.clientHeight || 1920;
  const activeLocation = state.currentLocation || state.wigleLiveData?.location || null;
  const candidatePlan = buildArCandidateBoxes({
    accessPoints: records,
    viewportWidth: width,
    viewportHeight: height,
    orientationAngle: state.arOrientationAngle,
  });

  const fragment = document.createDocumentFragment();
  candidatePlan.boxes.forEach((box) => {
    const candidate = document.createElement('article');
    candidate.className = `ar-candidate ar-candidate-${box.signalBand || 'unknown'}`;
    candidate.style.left = `${box.x}px`;
    candidate.style.top = `${box.y}px`;
    candidate.style.width = `${box.width}px`;
    candidate.style.height = `${box.height}px`;
    candidate.style.transform = `translate(0, 0) rotate(${box.rotation || 0}deg)`;

    const meta = document.createElement('div');
    meta.className = 'candidate-meta';
    meta.textContent = `${box.confidence}% confidence · ${box.signalBand || 'unknown'}`;
    candidate.appendChild(meta);

    const label = document.createElement('strong');
    label.textContent = box.label;
    candidate.appendChild(label);

    const subtitle = document.createElement('span');
    subtitle.textContent = box.subtitle || box.detail;
    candidate.appendChild(subtitle);

    const detail = document.createElement('span');
    detail.textContent = `${box.rangeText || 'unknown range'} · ${box.signalDbm ?? '—'} dBm`;
    candidate.appendChild(detail);

    fragment.appendChild(candidate);
  });

  overlay.replaceChildren(fragment);

  if (frame && activeLocation) {
    frame.dataset.wigleCenter = formatCoordinatePair(activeLocation.lat, activeLocation.lon);
  }
}

function bindVisionControls() {
  if (state.visionBound) {
    return;
  }

  const endpointInput = $('visionEndpointInput');
  const connectBtn = $('visionConnectBtn');
  const fileInput = $('visionFileInput');

  if (endpointInput) {
    endpointInput.value = state.visionEndpoint || endpointInput.value || '/api/ar-detections';
    endpointInput.addEventListener('change', () => {
      state.visionEndpoint = endpointInput.value.trim();
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      const endpoint = endpointInput?.value.trim() || state.visionEndpoint || '/api/ar-detections';
      loadVisionEndpoint(endpoint);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', handleVisionFileChange);
  }

  state.visionBound = true;
}

async function loadVisionEndpoint(endpoint) {
  const target = (endpoint || '').trim() || '/api/ar-detections';
  state.visionEndpoint = target;

  setVisionStatus(`Connecting to ${target}…`);

  try {
    const response = await fetch(target, {
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const parsed = parseVisionPayload(text, { source: 'live' });
    applyVisionDataset(parsed, {
      sourceLabel: target,
      message: `Loaded ${parsed.detections.length} detections from ${target}.`,
      merge: true,
    });
  } catch (error) {
    console.error('Failed to load object detections', error);
    setVisionStatus('Live object detections are not connected yet.');
    renderVisionViews();
  }
}

async function handleVisionFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = parseVisionPayload(text, { source: 'file' });
    applyVisionDataset(parsed, {
      sourceLabel: file.name,
      message: `Loaded ${parsed.detections.length} detections from ${file.name}.`,
      merge: true,
    });
  } catch (error) {
    console.error('Failed to load local vision dataset', error);
    setVisionStatus(`Local detection feed unavailable: ${error.message}`);
  } finally {
    event.target.value = '';
  }
}

function applyVisionDataset(payload, { sourceLabel = 'sample', message = '', merge = true } = {}) {
  const parsed = payload && typeof payload === 'object' && Array.isArray(payload.detections)
    ? payload
    : parseVisionPayload(payload, { source: sourceLabel });

  const currentDetections = Array.isArray(state.visionData?.detections) ? state.visionData.detections : [];
  const nextDetections = merge ? mergeVisionDetections(currentDetections, parsed.detections) : mergeVisionDetections(parsed.detections);
  const nextFrame = parsed.frame || state.visionData?.frame || null;

  state.visionData = {
    frame: nextFrame,
    detections: nextDetections,
    source: sourceLabel,
    updatedAt: parsed.updatedAt || new Date().toISOString(),
  };
  state.visionSourceLabel = sourceLabel;

  setVisionStatus(message || `Loaded ${nextDetections.length} detections.`);
  renderVisionViews();
}

function setVisionStatus(message) {
  state.visionStatus = message;
  setText('visionStatusText', message);
}

function renderVisionViews() {
  renderArDetectionLayer();
}

function renderArDetectionLayer() {
  const overlay = $('arDetections');
  const list = $('arDetectionList');
  const status = $('visionStatusText');
  const frame = $('arFrame');
  const records = state.visionData?.detections || [];
  const sourceLabel = state.visionSourceLabel || state.visionData?.source || 'sample';
  const summary = records.length
    ? `${state.visionStatus} · ${records.length} detection${records.length === 1 ? '' : 's'} · ${sourceLabel}`
    : state.visionStatus;

  if (status) {
    status.textContent = summary;
  }

  if (list) {
    renderVisionList(list, records);
  }

  if (!overlay) {
    return;
  }

  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'dashboard-empty-state';
    empty.textContent = 'Object detections will populate here.';
    overlay.replaceChildren(empty);
    return;
  }

  const width = frame?.clientWidth || 1080;
  const height = frame?.clientHeight || 1920;
  const detectionPlan = buildArDetectionBoxes({
    detections: records,
    viewportWidth: width,
    viewportHeight: height,
    orientationAngle: state.arOrientationAngle,
    maxBoxes: 8,
  });

  const fragment = document.createDocumentFragment();
  detectionPlan.boxes.forEach((box) => {
    const detection = document.createElement('article');
    detection.className = `ar-detection ar-detection-${getDetectionConfidenceBand(box.confidence)}`;
    detection.style.left = `${box.x}px`;
    detection.style.top = `${box.y}px`;
    detection.style.width = `${box.width}px`;
    detection.style.height = `${box.height}px`;
    detection.style.transform = `translate(0, 0) rotate(${box.rotation || 0}deg)`;

    const meta = document.createElement('div');
    meta.className = 'detection-meta';
    meta.textContent = `${box.confidence}% confidence · ${box.source || 'live'}`;
    detection.appendChild(meta);

    const label = document.createElement('strong');
    label.textContent = box.label;
    detection.appendChild(label);

    const subtitle = document.createElement('span');
    subtitle.textContent = box.subtitle || box.detail;
    detection.appendChild(subtitle);

    const detail = document.createElement('span');
    detail.textContent = `${box.width}px × ${box.height}px · ${box.x}, ${box.y}`;
    detection.appendChild(detail);

    fragment.appendChild(detection);
  });

  overlay.replaceChildren(fragment);
}

function renderVisionList(container, detections, limit = 6) {
  if (!container) {
    return;
  }

  const limitedDetections = detections.slice(0, limit);
  if (!limitedDetections.length) {
    const empty = document.createElement('p');
    empty.className = 'dashboard-empty-state';
    empty.textContent = 'Vision detections will appear here when available.';
    container.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  limitedDetections.forEach((detection, index) => {
    const item = document.createElement('article');
    item.className = 'wigle-item vision-item';

    const title = document.createElement('strong');
    title.className = 'wigle-item-title';
    title.textContent = `${index + 1}. ${detection.label || 'Object'}`;
    item.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'wigle-item-meta';
    meta.textContent = [
      Number.isFinite(detection.confidence) ? `${detection.confidence}% confidence` : null,
      detection.source || null,
      detection.box?.normalized ? 'normalized' : 'pixel',
    ].filter(Boolean).join(' · ') || 'Vision detection';
    item.appendChild(meta);

    const detail = document.createElement('p');
    detail.className = 'wigle-item-detail';
    detail.textContent = [
      detection.detail || null,
      detection.box ? `${detection.box.normalized ? 'normalized' : 'pixel'} box` : null,
      detection.trackId ? `track ${detection.trackId}` : null,
    ].filter(Boolean).join(' · ') || 'Camera overlay ready';
    item.appendChild(detail);

    fragment.appendChild(item);
  });

  container.replaceChildren(fragment);
}

function getDetectionConfidenceBand(confidence) {
  if (!Number.isFinite(confidence)) {
    return 'unknown';
  }

  if (confidence >= 85) {
    return 'high';
  }

  if (confidence >= 65) {
    return 'medium';
  }

  return 'low';
}

function initGodeyeTab() {
  if (!state.godeyeBound) {
    const locationBtn = $('locationBtn');
    if (locationBtn) {
      locationBtn.addEventListener('click', startGodeyeFeed);
    }

    bindWigleControls();

    if (!state.godeyeResizeBound) {
      window.addEventListener('resize', scheduleGodeyeRender);
      state.godeyeResizeBound = true;
    }

    const viewport = $('godeyeMap');
    if (viewport && typeof ResizeObserver !== 'undefined') {
      state.godeyeResizeObserver = new ResizeObserver(() => scheduleGodeyeRender());
      state.godeyeResizeObserver.observe(viewport);
    }

    state.godeyeBound = true;
  }

  renderGodeyeFields();
  renderWigleViews();
  renderGodeyeMap();
}

async function startGodeyeFeed() {
  if (!navigator.geolocation) {
    updateGodeyeStatus('Geolocation is unavailable in this browser.');
    return;
  }

  const locationBtn = $('locationBtn');
  if (locationBtn) {
    locationBtn.disabled = true;
  }

  updateGodeyeStatus('Requesting geolocation permission…');

  try {
    const position = await getCurrentPosition();
    handleGeoPosition(position);
    startGeoWatch();
    updateGodeyeStatus('Current fix locked. Watching for movement…');
  } catch (error) {
    console.error('Unable to acquire location', error);
    updateGodeyeStatus(`Location unavailable: ${error.message}`);
  } finally {
    if (locationBtn) {
      locationBtn.disabled = false;
    }
  }
}

function bindWigleControls() {
  if (state.wigleBound) {
    return;
  }

  const endpointInput = $('wigleEndpointInput');
  const connectBtn = $('wigleConnectBtn');

  if (endpointInput) {
    endpointInput.value = state.wigleEndpoint || endpointInput.value || GODEYE_VIEWPORT_ENDPOINT;
    endpointInput.addEventListener('change', () => {
      state.wigleEndpoint = endpointInput.value.trim();
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      const endpoint = endpointInput?.value.trim() || state.wigleEndpoint || GODEYE_VIEWPORT_ENDPOINT;
      loadWigleEndpoint(endpoint);
    });
  }


  state.wigleBound = true;
}

async function loadWigleEndpoint(endpoint) {
  const target = (endpoint || '').trim() || GODEYE_VIEWPORT_ENDPOINT;
  state.wigleEndpoint = target;
  setLiveWigleStatus(`Connecting to ${target}…`);
  return refreshLiveWigleFeed({ quiet: false });
}

function applyWigleDataset(payload, { sourceLabel = 'cybermap-postgis', message = '', merge = true, target = 'local', live = target === 'live' } = {}) {
  const parsed = payload && typeof payload === 'object' && Array.isArray(payload.accessPoints)
    ? payload
    : parseWiglePayload(payload, { source: sourceLabel });

  if (target === 'live') {
    const currentRecords = Array.isArray(state.wigleLiveData?.accessPoints) ? state.wigleLiveData.accessPoints : [];
    const nextRecords = merge ? mergeWigleRecords(currentRecords, parsed.accessPoints) : mergeWigleRecords(parsed.accessPoints);
    const nextLocation = parsed.location || state.currentLocation || state.wigleLiveData?.location || null;

    state.wigleLiveData = {
      location: nextLocation,
      accessPoints: nextRecords,
      source: sourceLabel,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      live,
      mode: 'viewport',
    };
    state.wigleLiveReady = live;
    state.wigleLiveSourceLabel = sourceLabel;

    setLiveWigleStatus(message || (live
      ? `Godeye Cybermap viewport ready from ${sourceLabel}.`
      : `Godeye Cybermap viewport from ${sourceLabel} returned no recent observations.`));
  } else {
    const currentRecords = Array.isArray(state.wigleData?.accessPoints) ? state.wigleData.accessPoints : [];
    const nextRecords = merge ? mergeWigleRecords(currentRecords, parsed.accessPoints) : mergeWigleRecords(parsed.accessPoints);
    const nextLocation = parsed.location || state.currentLocation || state.wigleData?.location || null;

    state.wigleData = {
      location: nextLocation,
      accessPoints: nextRecords,
      source: sourceLabel,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      mode: 'viewport',
      live,
    };
    state.wigleSourceLabel = sourceLabel;

    setWigleStatus(message || `Loaded ${nextRecords.length} Cybermap observation${nextRecords.length === 1 ? '' : 's'}.`);
  }

  renderWigleViews();
}

function setWigleStatus(message) {
  state.wigleStatus = message;
  setText('wigleStatusText', message);
  setText('godeyeWigleStatus', message);
}

function setLiveWigleStatus(message) {
  state.wigleLiveStatus = message;
  setText('arWigleStatusText', message);
}


function renderWigleViews() {
  renderGodeyeMap();
  renderGodeyeWigleList();
  renderArCandidateLayer();
}

function renderWigleList(container, records, limit = 6) {
  if (!container) {
    return;
  }

  const limitedRecords = records.slice(0, limit);
  if (!limitedRecords.length) {
    const empty = document.createElement('p');
    empty.className = 'dashboard-empty-state';
    empty.textContent = 'Cybermap observations will appear here when available.';
    container.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  limitedRecords.forEach((record, index) => {
    const item = document.createElement('article');
    item.className = 'wigle-item';

    const title = document.createElement('strong');
    title.className = 'wigle-item-title';
    title.textContent = `${index + 1}. ${record.ssid || record.bssid || 'Unknown network'}`;
    item.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'wigle-item-meta';
    meta.textContent = [
      record.signalDbm === null || record.signalDbm === undefined ? null : `${record.signalDbm} dBm`,
      record.channel ? `ch ${record.channel}` : null,
      record.signalBand || null,
      record.source || null,
    ].filter(Boolean).join(' · ') || 'Cybermap observation';
    item.appendChild(meta);

    const detail = document.createElement('p');
    detail.className = 'wigle-item-detail';
    detail.textContent = [
      record.vendor || null,
      record.security || null,
      record.estimatedRange?.label || null,
      Number.isFinite(record.lat) && Number.isFinite(record.lon) ? formatCoordinatePair(record.lat, record.lon) : null,
      Number.isFinite(record.distanceMeters) ? `${Math.round(record.distanceMeters)} m away` : null,
    ].filter(Boolean).join(' · ') || 'Signal hint only';
    item.appendChild(detail);

    fragment.appendChild(item);
  });

  container.replaceChildren(fragment);
}

function renderGodeyeWigleList() {
  const list = $('godeyeWigleList');
  const records = state.wigleData?.accessPoints || [];
  const location = state.currentLocation || state.wigleData?.location || null;
  const nearbyRecords = location ? filterWigleRecordsByRadius(records, location, 100) : records;
  if (!list) {
    return;
  }

  renderWigleList(list, nearbyRecords);
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS);
  });
}

function startGeoWatch() {
  if (state.geolocationWatchId !== null || !navigator.geolocation) {
    return;
  }

  state.geolocationWatchId = navigator.geolocation.watchPosition(handleGeoPosition, handleGeoError, GEO_OPTIONS);
}

function handleGeoPosition(position) {
  state.currentLocation = {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
    altitude: position.coords.altitude,
    timestamp: position.timestamp,
  };

  renderGodeyeFields();
  renderWigleViews();
  scheduleGodeyeRender();
  if (state.authenticated) {
    void refreshLiveWigleFeed({ quiet: true });
  }
}

function handleGeoError(error) {
  updateGodeyeStatus(`Location unavailable: ${error.message}`);
}

function stopGodeyeFeed() {
  if (state.geolocationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.geolocationWatchId);
    state.geolocationWatchId = null;
  }

  if (!state.authenticated) {
    state.currentLocation = null;
  }

  if (state.godeyeRenderFrame) {
    cancelAnimationFrame(state.godeyeRenderFrame);
    state.godeyeRenderFrame = 0;
  }

  renderGodeyeFields();
  renderWigleViews();
}

function scheduleGodeyeRender() {
  if (state.godeyeRenderFrame) {
    return;
  }

  state.godeyeRenderFrame = requestAnimationFrame(() => {
    state.godeyeRenderFrame = 0;
    renderGodeyeMap();
  });
}

function renderGodeyeFields() {
  const location = state.currentLocation || state.wigleData?.location || null;

  setText('geoLat', location ? location.lat.toFixed(6) : '—');
  setText('geoLon', location ? location.lon.toFixed(6) : '—');
  setText('geoAccuracy', location ? `${Math.round(location.accuracy || 0)} m` : '—');
  setText('geoHeading', location && location.heading !== null ? `${Math.round(location.heading)}°` : '—');
  setText('geoSpeed', location && location.speed !== null ? `${location.speed.toFixed(1)} m/s` : '—');

  const coords = $('godeyeCoords');
  if (coords) {
    coords.textContent = location
      ? `${formatCoordinatePair(location.lat, location.lon)} · ±${Math.round(location.accuracy || 0)}m · 100m Cybermap radius`
      : 'No GPS fix yet · tap enable to query managed Cybermap data';
  }

  if (!state.currentLocation && state.authenticated) {
    updateGodeyeStatus('Tap enable to request GPS and query managed Cybermap observations around your current fix.');
  }
}

function renderGodeyeMap() {
  const viewport = $('godeyeMap');
  const tilesLayer = $('godeyeTiles');
  const marker = $('godeyeMarker');
  const wigleMarkers = $('godeyeWigleMarkers');
  const accuracy = $('godeyeAccuracy');
  const location = state.currentLocation || state.wigleData?.location || null;

  if (!viewport || !tilesLayer || !marker || !accuracy || !wigleMarkers) {
    return;
  }

  if (!location) {
    tilesLayer.replaceChildren();
    wigleMarkers.replaceChildren();
    viewport.classList.remove('has-fix');
    marker.style.opacity = '0';
    accuracy.style.opacity = '0';
    const coords = $('godeyeCoords');
    if (coords) {
      coords.textContent = 'No GPS fix yet · tap enable to query managed Cybermap data';
    }
    const status = $('godeyeWigleStatus');
    if (status) {
      status.textContent = state.wigleStatus;
    }
    return;
  }

  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  if (!width || !height) {
    return;
  }

  const tilePlan = buildTileGrid({
    lat: location.lat,
    lon: location.lon,
    zoom: MAP_ZOOM,
    width,
    height,
    tileSize: 256,
    tileBaseUrl: TILE_BASE_URL,
  });

  const fragment = document.createDocumentFragment();
  tilePlan.forEach((tile) => {
    const image = document.createElement('img');
    image.className = 'map-tile';
    image.alt = '';
    image.src = tile.url;
    image.decoding = 'async';
    image.loading = 'eager';
    image.width = tile.width;
    image.height = tile.height;
    image.style.left = `${tile.left}px`;
    image.style.top = `${tile.top}px`;
    fragment.appendChild(image);
  });

  tilesLayer.replaceChildren(fragment);
  viewport.classList.add('has-fix');

  marker.style.opacity = '1';
  marker.style.left = '50%';
  marker.style.top = '50%';
  marker.style.setProperty('--heading', `${numberOrZero(location.heading)}deg`);

  const accuracyRadius = clamp((location.accuracy || 24) / metersPerPixel(location.lat, MAP_ZOOM, 256), 24, Math.max(width, height) * 0.95);
  accuracy.style.opacity = '1';
  accuracy.style.left = '50%';
  accuracy.style.top = '50%';
  accuracy.style.width = `${accuracyRadius * 2}px`;
  accuracy.style.height = `${accuracyRadius * 2}px`;

  const mapState = buildWigleMapState({
    location,
    accessPoints: state.wigleData?.accessPoints || [],
    viewportWidth: width,
    viewportHeight: height,
    zoom: MAP_ZOOM,
    radiusMeters: 100,
  });

  const markerFragment = document.createDocumentFragment();
  mapState.markers.forEach((ap) => {
    const network = document.createElement('article');
    network.className = `map-wigle-marker map-wigle-marker-${ap.signalBand || 'unknown'}`;
    network.style.left = `${ap.left}px`;
    network.style.top = `${ap.top}px`;
    network.style.width = `${clamp(ap.rangeRadiusPx, 120, 240)}px`;

    const title = document.createElement('strong');
    title.textContent = ap.label;
    network.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'marker-meta';
    meta.textContent = `${ap.signalDbm ?? '—'} dBm · ${ap.signalBand || 'unknown'} · ${ap.source || 'live'}`;
    network.appendChild(meta);

    const detail = document.createElement('span');
    detail.textContent = `${ap.detail || 'Cybermap observation'}${Number.isFinite(ap.distanceMeters) ? ` · ${Math.round(ap.distanceMeters)} m away` : ''}${ap.bearing !== null && ap.bearing !== undefined ? ` · ${Math.round(ap.bearing)}°` : ''}`;
    network.appendChild(detail);

    markerFragment.appendChild(network);
  });

  wigleMarkers.replaceChildren(markerFragment);

  const coords = $('godeyeCoords');
  if (coords) {
    coords.textContent = state.currentLocation
      ? `${formatCoordinatePair(location.lat, location.lon)} · ±${Math.round(location.accuracy)}m`
      : `${formatCoordinatePair(location.lat, location.lon)} · Cybermap overlay active`;
  }

  const status = $('godeyeWigleStatus');
  if (status) {
    const strongest = mapState.stats.strongest;
    status.textContent = strongest
      ? `${state.wigleStatus} · ${mapState.stats.total} managed Cybermap observation${mapState.stats.total === 1 ? '' : 's'} within 100m · strongest ${strongest.ssid} ${strongest.signalDbm} dBm · ${strongest.signalBand}`
      : `${state.wigleStatus} · No managed Cybermap observations within 100m of this fix.`;
  }
}

function updateGodeyeStatus(message) {
  setText('geoStatusText', message);
}

function showTerminalError(message) {
  const terminalError = $('terminalError');
  if (!terminalError) {
    return;
  }

  if (message) {
    terminalError.textContent = message;
    terminalError.classList.add('show');
  } else {
    hideTerminalError();
  }
}

function hideTerminalError() {
  const terminalError = $('terminalError');
  if (!terminalError) {
    return;
  }

  terminalError.textContent = '';
  terminalError.classList.remove('show');
}

function setText(id, value) {
  const element = $(id);
  if (element) {
    element.textContent = value;
  }
}

function formatAngle(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }

  return `${Math.round(value)}°`;
}

function formatAxis(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }

  return `${value.toFixed(1)}`;
}

function numberOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
