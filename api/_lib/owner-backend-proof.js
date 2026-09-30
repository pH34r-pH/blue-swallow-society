const crypto = require('node:crypto');
const { authMode } = require('../shared/owner-session.cjs');

function ownerBackendHeaders(auth, now = Date.now()) {
  if (authMode() === 'legacy') return {};
  if (!auth?.ok || auth.token?.v !== 'bss.owner.v1') throw new Error('owner_denied');
  let key;
  try {
    key = crypto.createPrivateKey(process.env.BLUE_SWALLOW_OWNER_PROXY_PRIVATE_KEY || '');
    if (key.asymmetricKeyType !== 'ed25519') throw new Error();
  } catch { throw Object.assign(new Error('owner_auth_unavailable'), { status: 503 }); }
  const issued = Math.floor(now / 1000);
  const payload = { v: 'bss.owner.read.v1', iss: auth.token.iss, aud: 'bss.cybermap.read',
    tid: auth.token.tid, oid: auth.token.oid, iat: issued, exp: Math.min(auth.token.exp, issued + 30) };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { 'x-blue-swallow-owner-proof': `${encoded}.${crypto.sign(null, Buffer.from(encoded), key).toString('base64url')}` };
}
module.exports = { ownerBackendHeaders };
