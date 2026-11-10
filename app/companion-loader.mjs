const ROUTES = new Set(['/operator/map', '/operator/encounters', '/operator/trips', '/operator/downloads']);
let session = null;
let controller = null;
let expiryTimer;
let destroyView;
let objectUrls = [];
let active = false;
let generation = 0;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('bss-companion-lock') : null;

export function safeDestination(value) {
  try {
    const url = new URL(value || '/operator/map', location.origin);
    return url.origin === location.origin && ROUTES.has(url.pathname) ? url.pathname : '/operator/map';
  } catch { return '/operator/map'; }
}
function validSession(value) {
  return value?.role === 'viewer' && typeof value.token === 'string' && value.token.length <= 2048
    && Number.isFinite(Date.parse(value.expiresAt)) && Date.parse(value.expiresAt) > Date.now();
}
function clearPrivate() {
  generation++;
  active = false;
  window.clearTimeout(expiryTimer);
  controller?.abort(); controller = null;
  destroyView?.(); destroyView = null;
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
  document.getElementById('companionStyles')?.remove();
  document.getElementById('companionMapStyles')?.remove();
  session = null;
  document.body.removeAttribute('data-mode');
  document.body.className = 'journal';
  document.body.replaceChildren();
  document.title = 'Blue Swallow Society';
}
function publicLocation(reason) { return '/?auth=' + encodeURIComponent(reason); }
function leave(reason = 'expired') {
  clearPrivate();
  location.replace(publicLocation(reason));
}
function scheduleExpiry() {
  window.clearTimeout(expiryTimer);
  expiryTimer = window.setTimeout(() => leave('expired'), Math.max(0, Date.parse(session.expiresAt) - Date.now()));
}
async function request(path, options = {}) {
  if (!active || !validSession(session)) { leave('expired'); throw new Error('session_expired'); }
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) throw new Error('invalid_destination');
  const response = await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store',
    headers: { ...options.headers, 'X-Blue-Swallow-Operator-Token': session.token },
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000), ...(options.signal ? [options.signal] : [])]) });
  if ([401, 403].includes(response.status)) { leave('expired'); throw new Error('session_expired'); }
  return response;
}
async function renew() {
  const response = await request('/api/companion-auth/renew', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!response.ok) throw new Error('renew_unavailable');
  const data = await response.json();
  if (!active || !validSession(data.operatorSession)) throw new Error('session_expired');
  session = Object.freeze(data.operatorSession);
  scheduleExpiry();
  return session.expiresAt;
}
function lockError(retry) {
  const main = document.createElement('main'); main.className = 'public-notice';
  const title = document.createElement('h1'); title.textContent = 'Workspace hidden';
  const message = document.createElement('p');
  message.textContent = 'The server could not end your session. Retry when connected. Your private content has been cleared from this page.';
  const button = document.createElement('button'); button.className = 'quiet-button'; button.textContent = 'Retry sign out';
  button.addEventListener('click', retry);
  const home = document.createElement('a'); home.href = publicLocation('lock-failed'); home.textContent = 'Return to journal';
  main.append(title, message, button, home); document.body.replaceChildren(main); button.focus();
}
async function revoke(raw, reason) {
  try {
    const response = await fetch('/api/companion-auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Blue-Swallow-Operator-Token': raw }, body: '{}', signal: AbortSignal.timeout(10000) });
    if (!response.ok && response.status !== 401) throw new Error('logout_unavailable');
    location.replace(publicLocation(reason));
  } catch { lockError(() => revoke(raw, reason)); }
}
async function lock(reason = 'locked') {
  const raw = session?.token;
  clearPrivate();
  channel?.postMessage({ type: 'lock' });
  if (raw) await revoke(raw, reason);
  else location.replace(publicLocation(reason));
}
async function loadAsset(name) {
  const response = await request('/api/companion-ui/' + name);
  if (!response.ok) throw new Error('bootstrap_unavailable');
  return response.text();
}
async function openDataset(onStatus) {
  const boot = generation;
  const [client, source] = await Promise.all(['dataset-client.mjs', 'dataset-worker.js'].map(loadAsset));
  if (!active || boot !== generation) throw new Error('session_expired');
  const url = URL.createObjectURL(new Blob([client], { type: 'text/javascript' })); objectUrls.push(url);
  const module = await import(url);
  if (!active || boot !== generation) throw new Error('session_expired');
  return module.createDatasetClient({ source, request, signal: controller.signal, onStatus });
}
async function openMap() {
  const boot = generation;
  const names = ['maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.mjs', 'maplibre-gl.css'];
  const [shared, worker, main, css] = await Promise.all(names.map(loadAsset));
  if (!active || boot !== generation) throw new Error('session_expired');
  function moduleUrl(source) {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' })); objectUrls.push(url); return url;
  }
  const sharedUrl = moduleUrl(shared);
  const rewrite = (source) => source.replaceAll('./maplibre-gl-shared.mjs', sharedUrl);
  const workerUrl = moduleUrl(rewrite(worker)); const mainUrl = moduleUrl(rewrite(main));
  const library = await import(mainUrl);
  if (!active || boot !== generation) throw new Error('session_expired');
  library.setWorkerUrl(workerUrl);
  const style = document.createElement('style'); style.id = 'companionMapStyles'; style.textContent = css; document.head.append(style);
  return library;
}
export async function enterCompanion(candidate, destination = '/operator/map') {
  if (!validSession(candidate)) throw new Error('session_expired');
  session = Object.freeze(candidate);
  controller = new AbortController();
  active = true;
  const boot = ++generation;
  scheduleExpiry();
  try {
    const [shell, css, source] = await Promise.all(['shell.html', 'theme.css', 'main.mjs'].map(loadAsset));
    if (!active || generation !== boot) return;
    const style = document.createElement('style'); style.id = 'companionStyles'; style.textContent = css;
    document.head.append(style);
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' })); objectUrls.push(url);
    const module = await import(url);
    if (!active || generation !== boot) return;
    document.body.innerHTML = shell;
    document.body.className = 'companion';
    document.body.dataset.mode = 'companion';
    history.replaceState(null, '', safeDestination(destination));
    document.title = 'Blue Swallow — Companion';
    destroyView = module.mount({ request, renew, lock, openDataset, openMap, expiresAt: () => session?.expiresAt, signal: controller.signal });
  } catch { if (active && generation === boot) await lock('unavailable'); }
}
async function restorePrivate() {
  const destination = safeDestination(location.pathname);
  try {
    const response = await fetch('/api/companion-auth/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('session_expired');
    const data = await response.json();
    await enterCompanion(data.operatorSession, destination);
  } catch {
    clearPrivate();
    location.replace('/?login=1&auth=expired&returnTo=' + encodeURIComponent(destination));
  }
}
channel?.addEventListener('message', (event) => {
  if (event.data?.type === 'lock' && active) leave('locked');
});
window.addEventListener('pagehide', () => { if (active) clearPrivate(); });
window.addEventListener('pageshow', (event) => { if (event.persisted && ROUTES.has(location.pathname)) leave('expired'); });
if (location.pathname === '/operator' || ROUTES.has(location.pathname)) void restorePrivate();
