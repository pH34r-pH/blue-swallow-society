const OPERATOR_SESSION_KEY = 'blue-swallow-society:operator-session';

let isRunning = false;

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

async function runAgent() {
  if (isRunning) return;

  const promptEl = document.getElementById('prompt');
  const outEl = document.getElementById('out');
  const runBtn = document.getElementById('runButton');
  const prompt = promptEl ? promptEl.value.trim() : '';

  if (!outEl) return;

  if (!prompt) {
    outEl.textContent = 'Enter a prompt to query the agent.';
    return;
  }

  isRunning = true;
  if (runBtn) runBtn.disabled = true;

  outEl.textContent = 'Running...';
  try {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: buildOperatorHeaders({
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ prompt }),
    });
    const text = await res.text();
    try {
      outEl.textContent = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      outEl.textContent = text;
    }
  } catch (err) {
    outEl.textContent = `Agent call failed: ${err.message}`;
  } finally {
    isRunning = false;
    if (runBtn) runBtn.disabled = false;
  }
}

const runBtn = document.getElementById('runButton');
const promptEl = document.getElementById('prompt');

if (runBtn) runBtn.addEventListener('click', runAgent);
if (promptEl) {
  promptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runAgent();
  });
}
