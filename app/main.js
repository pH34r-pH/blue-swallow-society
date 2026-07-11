const OPERATOR_SESSION_KEY = 'blue-swallow-society:operator-session';

const $ = (id) => document.getElementById(id);

function init() {
  const loginBtn = $('loginBtn');
  const passcodeInput = $('passcodeInput');

  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  if (passcodeInput) {
    passcodeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleLogin();
      }
    });
    passcodeInput.focus();
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
    const session = await requestOperatorSession(passcode);
    if (session?.token) {
      persistOperatorSession(session);
      window.location.assign('/operator');
      return;
    }

    showStandardSite();
  } catch (error) {
    console.warn('Standard site fallback selected.', error);
    showStandardSite();
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
    }
  }
}

async function requestOperatorSession(passcode) {
  const response = await fetch('/api/validate-passcode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ passcode }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data?.ok === true && data.operatorSession?.token ? data.operatorSession : null;
}

function persistOperatorSession(session) {
  try {
    sessionStorage.setItem(OPERATOR_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Session storage is best-effort; the server-side cookie is the download fallback.
  }
}

function showStandardSite() {
  document.body.dataset.mode = 'standard';

  const terminalScreen = $('terminalScreen');
  const standardSite = $('standardSite');
  const passcodeInput = $('passcodeInput');

  if (terminalScreen) {
    terminalScreen.classList.remove('active');
    terminalScreen.setAttribute('aria-hidden', 'true');
  }

  if (standardSite) {
    standardSite.classList.add('active');
    standardSite.removeAttribute('aria-hidden');
  }

  if (passcodeInput) {
    passcodeInput.value = '';
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
