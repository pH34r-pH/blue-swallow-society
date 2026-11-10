import { renderJournal } from './journal-view.mjs';
import { enterCompanion, safeDestination } from './companion-loader.mjs';

const dialog = document.getElementById('loginDialog');
const password = document.getElementById('password');
const status = document.getElementById('loginStatus');
const submit = document.getElementById('submitLogin');
const loginButton = document.getElementById('loginButton');
const params = new URLSearchParams(location.search);
let attempt;
let generation = 0;

function closeLogin() {
  generation++;
  attempt?.abort();
  password.value = '';
  dialog.close();
  loginButton.focus();
}
async function openLogin() {
  attempt?.abort();
  const current = ++generation;
  attempt = new AbortController();
  status.textContent = '';
  submit.disabled = false;
  dialog.showModal();
  password.focus();
  try {
    const response = await fetch('/api/companion-auth/session', {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([attempt.signal, AbortSignal.timeout(10000)]),
    });
    if (!response.ok) return;
    const data = await response.json();
    if (current !== generation || !dialog.open) return;
    dialog.close();
    await enterCompanion(data.operatorSession, safeDestination(params.get('returnTo')));
  } catch { /* Password entry stays available when restore is unavailable. */ }
}
document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  attempt?.abort();
  attempt = new AbortController();
  const current = ++generation;
  submit.disabled = true;
  status.textContent = 'Signing in…';
  try {
    const response = await fetch('/api/companion-auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      cache: 'no-store', body: JSON.stringify({ password: password.value }),
      signal: AbortSignal.any([attempt.signal, AbortSignal.timeout(15000)]),
    });
    password.value = '';
    if (current !== generation || !dialog.open) return;
    if (!response.ok) {
      status.textContent = response.status === 401 ? 'That password was not accepted. Please try again.'
        : response.status === 429 ? 'Too many attempts. Please wait a few minutes before trying again.'
          : 'Login is temporarily unavailable. The journal is still here.';
      return;
    }
    const data = await response.json();
    dialog.close();
    await enterCompanion(data.operatorSession, safeDestination(params.get('returnTo')));
  } catch {
    if (current === generation) status.textContent = 'Unable to sign in. Please try again.';
  } finally {
    if (current === generation) { submit.disabled = false; password.focus(); }
  }
});
loginButton.addEventListener('click', openLogin);
document.getElementById('cancelLogin').addEventListener('click', closeLogin);
dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeLogin(); });
window.addEventListener('pagehide', () => { attempt?.abort(); password.value = ''; });
const notices = { expired: 'Your session has ended. Log in again when you are ready.',
  locked: 'You are signed out.', unavailable: 'The private workspace is unavailable. The journal is still here.',
  'lock-failed': 'The workspace is hidden, but the server could not end the session. Please retry Login and Lock when connected.' };
if (notices[params.get('auth')]) {
  const notice = document.getElementById('publicNotice');
  notice.textContent = notices[params.get('auth')]; notice.hidden = false;
}
void renderJournal();
if (params.get('login') === '1') void openLogin();
