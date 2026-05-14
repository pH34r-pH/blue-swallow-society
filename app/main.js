const DEFAULT_PROVIDER_PATH = '/.auth/login/aad';
const loginPath = DEFAULT_PROVIDER_PATH;

const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const refreshProfileButton = document.getElementById('refreshProfileButton');
const clientPrincipalOutput = document.getElementById('clientPrincipalOutput');
const apiOutput = document.getElementById('apiOutput');
const echoInput = document.getElementById('echoInput');
const sendEchoButton = document.getElementById('sendEchoButton');
const echoOutput = document.getElementById('echoOutput');

loginButton?.addEventListener('click', () => {
  window.location.href = `${loginPath}?post_login_redirect_uri=${encodeURIComponent(window.location.href)}`;
});

logoutButton?.addEventListener('click', () => {
  window.location.href = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.origin)}`;
});

refreshProfileButton?.addEventListener('click', async () => {
  await loadApiProfile();
});

sendEchoButton?.addEventListener('click', async () => {
  const msg = echoInput?.value ?? '';
  try {
    const response = await fetch(`/api/echo?msg=${encodeURIComponent(msg)}`);
    const text = await response.text();
    try { echoOutput.textContent = JSON.stringify(JSON.parse(text), null, 2); }
    catch { echoOutput.textContent = text; }
  } catch (error) {
    echoOutput.textContent = `Error calling echo API: ${error.message}`;
  }
});

async function loadClientPrincipal() {
  try {
    const response = await fetch('/.auth/me');
    if (!response.ok) {
      clientPrincipalOutput.textContent = `Failed to load /.auth/me: ${response.status}`;
      return;
    }
    const data = await response.json();
    clientPrincipalOutput.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    clientPrincipalOutput.textContent = `Error loading principal: ${error.message}`;
  }
}

async function loadApiProfile() {
  try {
    const response = await fetch('/api/profile');
    const text = await response.text();
    try { apiOutput.textContent = JSON.stringify(JSON.parse(text), null, 2); }
    catch { apiOutput.textContent = text; }
  } catch (error) {
    apiOutput.textContent = `Error calling API: ${error.message}`;
  }
}

loadClientPrincipal();
