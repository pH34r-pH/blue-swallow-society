const crypto = require('node:crypto');
const entries = new Map();
const key = (session) => crypto.createHash('sha256').update(session).digest('hex');
function forget(session) {
  const id = key(session || '');
  const entry = entries.get(id);
  if (entry) clearTimeout(entry.timer);
  entries.delete(id);
}
function store(session, client, account, scopes, now = Date.now()) {
  if (!account || !session?.token || !scopes?.length) throw new Error('api_auth_unavailable');
  for (const [id, entry] of entries) if (entry.expiresAt <= now) { clearTimeout(entry.timer); entries.delete(id); }
  if (entries.size >= 128) throw new Error('api_auth_unavailable');
  const id = key(session.token);
  const expiresAt = Date.parse(session.expiresAt);
  const timer = setTimeout(() => entries.delete(id), Math.max(0, expiresAt - now));
  timer.unref?.();
  entries.set(id, { client, account, scopes: [...scopes], expiresAt, timer });
}
function status(session, now = Date.now()) {
  const entry = entries.get(key(session || ''));
  const active = !!entry && entry.expiresAt > now;
  return { active, editing: active && entry.scopes.some((scope) => scope.endsWith('/Entities.Write')) };
}
function downgrade(session) {
  const entry = entries.get(key(session || ''));
  if (entry) entry.scopes = entry.scopes.filter((scope) => scope.endsWith('/Owner.Read'));
}
async function acquire(session, now = Date.now(), requiredScope) {
  const entry = entries.get(key(session || ''));
  if (!entry || entry.expiresAt <= now) { forget(session); throw Object.assign(new Error('session_expired'), { status: 401 }); }
  if (requiredScope && !entry.scopes.some((scope) => scope.endsWith(`/${requiredScope}`))) {
    throw Object.assign(new Error('api_scope_denied'), { status: 403 });
  }
  try {
    const result = await entry.client.acquireTokenSilent({ account: entry.account, scopes: entry.scopes });
    if (!result?.accessToken) throw new Error();
    return result.accessToken;
  } catch { forget(session); throw Object.assign(new Error('session_expired'), { status: 401 }); }
}
module.exports = { store, acquire, forget, status, downgrade };
