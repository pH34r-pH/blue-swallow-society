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

export function getActiveOperatorSession() {
  if (!activeSession || !isFuture(activeSession.expiresAt)) {
    activeSession = null;
    return null;
  }
  return activeSession;
}

export function clearOperatorSession() {
  activeSession = null;
}

export function operatorRequestHeaders(headers = {}) {
  const session = getActiveOperatorSession();
  if (!session) {
    throw new Error('Operator session is unavailable or expired.');
  }
  const merged = new Headers(headers);
  merged.set('X-Blue-Swallow-Operator-Token', session.token);
  return Object.fromEntries(merged.entries());
}

function isFuture(expiresAt) {
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}
