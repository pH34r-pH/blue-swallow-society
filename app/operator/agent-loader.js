const OPERATOR_SESSION_KEY = 'blue-swallow-society:operator-session';

function getOperatorSession() {
  try {
    const raw = window.sessionStorage.getItem(OPERATOR_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.expiresAt || Date.parse(parsed.expiresAt) <= Date.now()) {
      window.sessionStorage.removeItem(OPERATOR_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(OPERATOR_SESSION_KEY);
    return null;
  }
}

function redirectHome() {
  window.sessionStorage.removeItem(OPERATOR_SESSION_KEY);
  window.location.replace('/');
}

async function boot() {
  const session = getOperatorSession();
  if (!session) {
    redirectHome();
    return;
  }

  const response = await fetch('/api/operator-shell?view=agent', {
    headers: {
      Accept: 'text/html',
      'X-Blue-Swallow-Operator-Token': session.token,
    },
    credentials: 'same-origin',
  });
  if (!response.ok) {
    redirectHome();
    return;
  }

  document.body.innerHTML = await response.text();
  document.body.dataset.mode = 'operator';
  await import('/operator/agent.js');
}

boot().catch((error) => {
  console.error('Private interface boot failed', error);
  redirectHome();
});
