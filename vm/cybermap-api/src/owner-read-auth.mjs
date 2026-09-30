import crypto from 'node:crypto';
import { IngestError } from './auth.mjs';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function readConfig() {
  try {
    const tenant = process.env.BLUE_SWALLOW_ENTRA_TENANT_ID;
    const owner = process.env.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID;
    const key = crypto.createPublicKey(process.env.BLUE_SWALLOW_OWNER_PROXY_PUBLIC_KEY || '');
    if (!GUID.test(tenant) || !GUID.test(owner) || key.asymmetricKeyType !== 'ed25519') throw new Error();
    return { tenant, owner, key };
  } catch { throw new IngestError('owner_auth_unavailable', 'Owner authorization is unavailable.', { statusCode: 503 }); }
}
function validIdentity(claims, config) {
  return claims.v === 'bss.owner.read.v1' && claims.aud === 'bss.cybermap.read'
    && claims.iss === `https://login.microsoftonline.com/${config.tenant}/v2.0`
    && claims.tid === config.tenant && claims.oid === config.owner;
}
function validTime(claims, now) {
  return Number.isFinite(claims.iat) && Number.isFinite(claims.exp) && claims.iat * 1000 <= now
    && claims.exp * 1000 > now && claims.exp > claims.iat && claims.exp - claims.iat <= 30;
}
export function requireOwnerReadProof(request, now = Date.now()) {
  const mode = process.env.BLUE_SWALLOW_AUTH_MODE || 'entra';
  if (mode === 'legacy') return;
  if (mode !== 'entra') throw new IngestError('owner_auth_unavailable', 'Owner authorization is unavailable.', { statusCode: 503 });
  const config = readConfig();
  try {
    const raw = request.headers['x-blue-swallow-owner-proof'];
    if (typeof raw !== 'string' || raw.length > 8192) throw new Error();
    const [encoded, signature, extra] = raw.split('.');
    if (extra !== undefined || !crypto.verify(null, Buffer.from(encoded), config.key, Buffer.from(signature, 'base64url'))) throw new Error();
    const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!validIdentity(claims, config) || !validTime(claims, now)) throw new Error();
  } catch { throw new IngestError('owner_denied', 'Owner authorization is required.', { statusCode: 403 }); }
}
