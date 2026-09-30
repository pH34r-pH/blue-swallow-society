const { ownerClaims, same } = require('../shared/owner-session.cjs');
let remote;
let remoteUrl;

async function verifyIdToken(raw, config, nonce, { keySet, now = Date.now() } = {}) {
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  if (!keySet) {
    const url = `https://login.microsoftonline.com/${config.tenant}/discovery/v2.0/keys`;
    if (url !== remoteUrl) { remote = createRemoteJWKSet(new URL(url), { timeoutDuration: 5000 }); remoteUrl = url; }
    keySet = remote;
  }
  const { payload } = await jwtVerify(raw, keySet, { algorithms: ['RS256'], issuer: config.issuer,
    audience: config.audience, requiredClaims: ['exp', 'iat', 'tid', 'oid', 'nonce'], currentDate: new Date(now) });
  if (!ownerClaims(payload, config) || !same(payload.nonce, nonce) || payload.iat * 1000 > now) throw new Error('owner_denied');
  return payload;
}
module.exports = { verifyIdToken };
