import { activateOperatorSession } from '../operator/operator-session.mjs';
import { bootOperatorSurface } from '../operator/loader.js';

const messages = Object.freeze({
  'signed-out': 'Sign in with the approved owner account.',
  denied: 'This account is not authorized. Sign in with the approved owner account.',
  unavailable: 'Sign-in is unavailable. Configuration or the identity service needs attention.',
  expired: 'Your session expired. Sign in again.',
});
const params = new URLSearchParams(window.location.search);
const status = document.getElementById('authStatus');
const button = document.getElementById('signInBtn');
const returnTo = params.get('returnTo') || '/operator/travels';
let sessionTimer;
let generation = 0;

function showState(state) {
  status.textContent = messages[state] || messages['signed-out'];
  document.body.dataset.authState = state;
  button.disabled = false;
}

async function restoreSession() {
  const current = ++generation;
  if (Object.hasOwn(messages, params.get('auth'))) { showState(params.get('auth')); return; }
  try {
    const response = await fetch('/api/owner-auth/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (current !== generation) return;
    if (!response.ok) {
      showState(data.error === 'session_expired' ? 'expired' : response.status === 503 ? 'unavailable' : response.status === 403 ? 'denied' : 'signed-out');
      return;
    }
    if (!activateOperatorSession(data.operatorSession)) { showState('expired'); return; }
    const destination = new URL(returnTo, window.location.origin);
    if (destination.origin === window.location.origin && destination.pathname === '/owner/birds') { window.location.replace('/owner/birds'); return; }
    const path = destination.origin === window.location.origin && /^\/operator\/(travels|entities|world|devices)$/.test(destination.pathname)
      ? destination.pathname + destination.search : '/operator/travels';
    history.replaceState(null, '', path);
    await bootOperatorSurface();
    if (current !== generation) return;
    sessionTimer = window.setTimeout(() => window.location.replace('/owner?auth=expired'), Math.max(0, Date.parse(data.operatorSession.expiresAt) - Date.now()));
  } catch { if (current === generation) showState('unavailable'); }
}

button.addEventListener('click', async () => {
  const current = ++generation;
  button.disabled = true;
  status.textContent = 'Opening Microsoft sign-in…';
  try {
    const response = await fetch(`/api/owner-auth/login?returnTo=${encodeURIComponent(returnTo)}`, {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('unavailable');
    const result = await response.json();
    if (current !== generation) return;
    const url = new URL(result.authorizationUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'login.microsoftonline.com') throw new Error('unavailable');
    window.location.assign(url.href);
  } catch { if (current === generation) showState('unavailable'); }
});
window.addEventListener('pagehide', () => { generation++; window.clearTimeout(sessionTimer); }, { once: true });
void restoreSession();
