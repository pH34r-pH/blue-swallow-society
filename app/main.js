import { activateOperatorSession } from './operator/operator-session.mjs';
import { bootOperatorSurface } from './operator/loader.js';

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

function showState(state) {
  status.textContent = messages[state] || messages['signed-out'];
  document.body.dataset.authState = state;
  button.disabled = false;
}

async function restoreSession() {
  if (Object.hasOwn(messages, params.get('auth'))) { showState(params.get('auth')); return; }
  try {
    const response = await fetch('/api/owner-auth/session', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) { showState(response.status === 503 ? 'unavailable' : response.status === 403 ? 'denied' : 'signed-out'); return; }
    const data = await response.json();
    if (!activateOperatorSession(data.operatorSession)) { showState('expired'); return; }
    const destination = new URL(returnTo, window.location.origin);
    const path = destination.origin === window.location.origin && /^\/operator\/(travels|entities|world|devices)$/.test(destination.pathname)
      ? destination.pathname + destination.search : '/operator/travels';
    history.replaceState(null, '', path);
    await bootOperatorSurface();
    sessionTimer = window.setTimeout(() => window.location.replace('/?auth=expired'), Math.max(0, Date.parse(data.operatorSession.expiresAt) - Date.now()));
  } catch { showState('unavailable'); }
}

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Opening Microsoft sign-in…';
  try {
    const response = await fetch(`/api/owner-auth/login?returnTo=${encodeURIComponent(returnTo)}`, {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('unavailable');
    const result = await response.json();
    const url = new URL(result.authorizationUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'login.microsoftonline.com') throw new Error('unavailable');
    window.location.assign(url.href);
  } catch { showState('unavailable'); }
});
window.addEventListener('pagehide', () => window.clearTimeout(sessionTimer), { once: true });
void restoreSession();
