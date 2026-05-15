// Wires up Echo Lab, sign-in/out, and profile loading against the Static Web Apps
// managed API and built-in Easy Auth endpoints.

const $ = (id) => document.getElementById(id);

function setText(el, value) {
  if (el) el.textContent = value;
}

async function fetchJsonOrText(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, body: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, body: text };
  }
}

async function sendEcho() {
  const input = $("echoInput");
  const output = $("echoOutput");
  const msg = input ? input.value : "";
  setText(output, "Sending...");
  const result = await fetchJsonOrText(`/api/echo?msg=${encodeURIComponent(msg)}`);
  setText(output, JSON.stringify(result, null, 2));
}

async function loadClientPrincipal() {
  const out = $("clientPrincipalOutput");
  setText(out, "Loading...");
  const res = await fetch("/.auth/me");
  if (!res.ok) {
    setText(out, `Not signed in (HTTP ${res.status}).`);
    return null;
  }
  const data = await res.json();
  const principal = (data && data.clientPrincipal) || null;
  setText(out, principal ? JSON.stringify(principal, null, 2) : "No client principal.");
  return principal;
}

async function loadProfile() {
  const out = $("apiOutput");
  setText(out, "Loading...");
  const result = await fetchJsonOrText("/api/profile");
  setText(out, JSON.stringify(result, null, 2));
}

function goLogin() {
  window.location.assign("/.auth/login/aad?post_login_redirect_uri=/");
}

function goLogout() {
  window.location.assign("/.auth/logout?post_logout_redirect_uri=/");
}

function wire() {
  const echoBtn = $("sendEchoButton");
  if (echoBtn) echoBtn.addEventListener("click", sendEcho);

  const loginBtn = $("loginButton");
  if (loginBtn) loginBtn.addEventListener("click", goLogin);

  const logoutBtn = $("logoutButton");
  if (logoutBtn) logoutBtn.addEventListener("click", goLogout);

  const refreshBtn = $("refreshProfileButton");
  if (refreshBtn) refreshBtn.addEventListener("click", loadProfile);

  // Best-effort principal load on page open. Failures are silent — page still works anonymously.
  loadClientPrincipal().catch(() => {
    setText($("clientPrincipalOutput"), "Unable to load client principal.");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wire);
} else {
  wire();
}
