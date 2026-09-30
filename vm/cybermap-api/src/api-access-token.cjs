'use strict';
const SCOPES = Object.freeze(['Owner.Read', 'Observations.Upload', 'Entities.Write', 'World.Manage']);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
class ApiTokenError extends Error {
  constructor(code, status = 403) { super(code); this.code = code; this.status = status; }
}
function apiConfig() {
  const tenantId = process.env.BLUE_SWALLOW_ENTRA_TENANT_ID || '';
  const clientId = process.env.BLUE_SWALLOW_ENTRA_API_CLIENT_ID || '';
  const objectId = process.env.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID || '';
  if (![tenantId, clientId, objectId].every((value) => GUID.test(value))
    || clientId === process.env.BLUE_SWALLOW_ENTRA_CLIENT_ID) throw new ApiTokenError('api_auth_unavailable', 503);
  return { tenantId, clientId, objectId, issuer: `https://login.microsoftonline.com/${tenantId}/v2.0` };
}
function bearerToken(request) {
  const headers = request?.headers || {};
  const matches = Object.keys(headers).filter((key) => key.toLowerCase() === 'authorization');
  if (matches.length !== 1 || typeof headers[matches[0]] !== 'string') return '';
  const match = headers[matches[0]].match(/^Bearer ([A-Za-z0-9_.-]+)$/i);
  return match && match[1].length <= 16384 ? match[1] : '';
}
function principal(claims, config, scope, now) {
  if (claims.ver !== '2.0' || claims.iss !== config.issuer || claims.aud !== config.clientId
    || claims.tid !== config.tenantId || claims.oid !== config.objectId || claims.idtyp === 'app'
    || typeof claims.scp !== 'string' || claims.iat * 1000 > now) throw new ApiTokenError('api_owner_denied');
  const scopes = [...new Set(claims.scp.split(' ').filter(Boolean))].sort();
  if (!scopes.length || scopes.some((item) => !SCOPES.includes(item)) || !scopes.includes(scope)) throw new ApiTokenError('api_scope_denied');
  return Object.freeze({ tenantId: config.tenantId, objectId: config.objectId,
    operatorId: `${config.tenantId}:${config.objectId}`, scopes: Object.freeze(scopes) });
}
function createApiTokenValidator({ getConfig = apiConfig, keySet, loadJose = () => import('jose'), now = Date.now } = {}) {
  let remote;
  let remoteUrl;
  return async function verifyApiAccessToken(token, requiredScope) {
    if (!SCOPES.includes(requiredScope)) throw new ApiTokenError('api_auth_unavailable', 503);
    if (typeof token !== 'string' || !token || token.length > 16384) throw new ApiTokenError('api_token_required', 401);
    let config;
    try { config = getConfig(); } catch { throw new ApiTokenError('api_auth_unavailable', 503); }
    try {
      const { createRemoteJWKSet, jwtVerify } = await loadJose();
      const url = `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`;
      if (!keySet && remoteUrl !== url) { remote = createRemoteJWKSet(new URL(url), { timeoutDuration: 5000 }); remoteUrl = url; }
      const current = now();
      const { payload } = await jwtVerify(token, keySet || remote, { algorithms: ['RS256'], issuer: config.issuer,
        audience: config.clientId, currentDate: new Date(current), requiredClaims: ['exp', 'nbf', 'iat', 'tid', 'oid', 'ver', 'scp'] });
      return principal(payload, config, requiredScope, current);
    } catch (error) {
      if (error instanceof ApiTokenError) throw error;
      if (['ERR_JWKS_TIMEOUT', 'ENOTFOUND', 'ECONNRESET'].includes(error.code)
        || ['ENOTFOUND', 'ECONNRESET'].includes(error.cause?.code)) throw new ApiTokenError('api_auth_unavailable', 503);
      throw new ApiTokenError('api_owner_denied');
    }
  };
}
const verifyApiAccessToken = createApiTokenValidator();
module.exports = { SCOPES, ApiTokenError, apiConfig, bearerToken, createApiTokenValidator, verifyApiAccessToken };
