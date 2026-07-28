let activeSession = null;

export function activateOperatorSession(candidate) {
  if (!candidate || typeof candidate.token !== 'string' || !candidate.token || !isFuture(candidate.expiresAt)) {
    activeSession = null;
    return false;
  }
  activeSession = Object.freeze({
    token: candidate.token,
    expiresAt: candidate.expiresAt,
  });
  return true;
}

export function hasActiveOperatorSession() {
  if (!activeSession || !isFuture(activeSession.expiresAt)) {
    activeSession = null;
    return false;
  }
  return true;
}

export function clearOperatorSession() {
  activeSession = null;
}

export function operatorRequestHeaders(headers = {}) {
  if (!hasActiveOperatorSession()) {
    throw new Error('Operator session is unavailable or expired.');
  }
  const merged = new Headers(headers);
  merged.set('X-Blue-Swallow-Operator-Token', activeSession.token);
  return Object.fromEntries(merged.entries());
}

export async function operatorFetch(input, init = {}) {
  return fetch(input, {
    ...init,
    headers: operatorRequestHeaders(init.headers || {}),
    cache: init.cache || 'no-store',
    credentials: 'same-origin',
  });
}

function isFuture(expiresAt) {
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}
