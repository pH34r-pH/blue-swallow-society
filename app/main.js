import {
  buildTileGrid,
  clamp,
  formatCoordinatePair,
  metersPerPixel,
} from './map-math.mjs';
import { initTzeentchDashboard, stopTzeentchDashboard } from './tzeentch.mjs';

const PASSCODE_FALLBACK = 'blue-swallow';
const TILE_BASE_URL = 'https://tile.openstreetmap.org';
const MAP_ZOOM = 15;
const GEO_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 10000,
};

const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

const state = {
  authenticated: false,
  activeTab: 'landing',
  tabSystemBound: false,
  arBound: false,
  arReady: false,
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
};

function init() {
  bindLoginFlow();
  bindTabSystem();
  resetConsoleToLogin();
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
  const terminalError = $('terminalError');
  const passcode = passcodeInput ? passcodeInput.value.trim() : '';

  if (!passcode) {
    showTerminalError('Enter the passcode to continue.');
    return;
  }

  if (loginBtn) {
    loginBtn.disabled = true;
  }

  showTerminalError('');

  try {
    const isValid = await validatePasscode(passcode);
    if (!isValid) {
      showTerminalError('Passcode rejected.');
      return;
    }

    unlockConsole();
  } catch (error) {
    console.error('Login failed', error);
    showTerminalError('Login failed. Please try again.');
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
    }
    if (terminalError && !terminalError.textContent) {
      terminalError.classList.remove('show');
    }
  }
}

async function validatePasscode(passcode) {
  try {
    const response = await fetch('/api/validate-passcode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ passcode }),
    });

    if (!response.ok) {
      throw new Error(`Validation request failed (${response.status})`);
    }

    const data = await response.json();
    if (data && typeof data.ok === 'boolean') {
      return data.ok;
    }

    throw new Error('Validation response missing ok flag.');
  } catch (error) {
    // Local fallback for development shells where the API route is not mounted.
    if (passcode === PASSCODE_FALLBACK) {
      return true;
    }

    throw error;
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

  hideTerminalError();
  stopTzeentchDashboard();
  stopArFeed();
  stopGodeyeFeed();
  state.currentLocation = null;
  setText('arStatusText', 'Camera idle. Tap enable to start passthrough.');
  setText('geoStatusText', 'Geolocation permission has not been requested yet.');
  renderArHud();
  renderGodeyeFields();
  renderGodeyeMap();
  resetTabSelection();
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
  initTzeentchDashboard();
  initArTab();
  initGodeyeTab();
  renderArHud();
  renderGodeyeMap();
}

function handleLogout() {
  stopTzeentchDashboard();
  stopArFeed();
  stopGodeyeFeed();
  resetConsoleToLogin();
}

function getTabButtons() {
  return Array.from($$('.tab-btn'));
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
  if (state.arBound) {
    return;
  }

  const enableBtn = $('arEnableBtn');
  if (enableBtn) {
    enableBtn.addEventListener('click', startArFeed);
  }

  state.arBound = true;
  renderArHud();
}

async function startArFeed() {
  const status = $('arStatusText');
  const enableBtn = $('arEnableBtn');

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
  }

  try {
    await ensureMotionTracking();
    messages.push('motion overlay active');
  } catch (error) {
    console.error('Motion unavailable', error);
    messages.push(`motion unavailable: ${error.message}`);
  }

  if (status) {
    status.textContent = messages.join(' · ') || 'AR feed ready.';
  }

  if (enableBtn) {
    enableBtn.disabled = false;
  }

  renderArHud();
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
      await video.play();
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
  }

  const fallback = $('arFallback');
  if (fallback) {
    fallback.classList.remove('hidden');
  }

  const status = $('arStatusText');
  if (status && state.authenticated) {
    status.textContent = 'Camera idle. Tap enable to start passthrough.';
  }

  renderArHud();
}

function renderArHud() {
  const frame = $('arFrame');
  const attitude = $('arAttitude');
  const acceleration = $('arAcceleration');
  const rotation = $('arRotation');

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
    frame.style.setProperty('--yaw', `${numberOrZero(state.motion.alpha)}deg`);
    frame.style.setProperty('--pitch', `${clamp(numberOrZero(state.motion.beta), -90, 90)}deg`);
    frame.style.setProperty('--roll', `${numberOrZero(state.motion.gamma)}deg`);
    frame.style.setProperty('--pitch-offset', `${clamp(numberOrZero(state.motion.beta), -45, 45) * 0.35}px`);
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
}

function initGodeyeTab() {
  if (state.godeyeBound) {
    return;
  }

  const locationBtn = $('locationBtn');
  if (locationBtn) {
    locationBtn.addEventListener('click', startGodeyeFeed);
  }

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
  renderGodeyeFields();
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
  scheduleGodeyeRender();
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
  renderGodeyeMap();
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
  const location = state.currentLocation;

  setText('geoLat', location ? location.lat.toFixed(6) : '—');
  setText('geoLon', location ? location.lon.toFixed(6) : '—');
  setText('geoAccuracy', location ? `${Math.round(location.accuracy)} m` : '—');
  setText('geoHeading', location && location.heading !== null ? `${Math.round(location.heading)}°` : '—');
  setText('geoSpeed', location && location.speed !== null ? `${location.speed.toFixed(1)} m/s` : '—');

  const coords = $('godeyeCoords');
  if (coords) {
    coords.textContent = location
      ? `${formatCoordinatePair(location.lat, location.lon)} · ±${Math.round(location.accuracy)}m`
      : 'Awaiting geolocation permission.';
  }

  if (!location && state.authenticated) {
    updateGodeyeStatus('Tap enable to request GPS and center the map on your current fix.');
  }
}

function renderGodeyeMap() {
  const viewport = $('godeyeMap');
  const tilesLayer = $('godeyeTiles');
  const marker = $('godeyeMarker');
  const accuracy = $('godeyeAccuracy');
  const location = state.currentLocation;

  if (!viewport || !tilesLayer || !marker || !accuracy) {
    return;
  }

  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  if (!width || !height) {
    return;
  }

  if (!location) {
    viewport.classList.remove('has-fix');
    tilesLayer.replaceChildren();
    marker.style.opacity = '0';
    accuracy.style.opacity = '0';
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

  const coords = $('godeyeCoords');
  if (coords) {
    coords.textContent = `${formatCoordinatePair(location.lat, location.lon)} · ±${Math.round(location.accuracy)}m`;
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

window.addEventListener('DOMContentLoaded', init);
