// One validator source; the Functions artifact copies it into shared/ at build time.
const fs = require('node:fs');
const path = require('node:path');
const packaged = path.join(__dirname, '../shared/api-access-token.cjs');
const common = require(fs.existsSync(packaged) ? packaged : '../../vm/cybermap-api/src/api-access-token.cjs');
const verifyApiAccessToken = common.createApiTokenValidator({ loadJose: () => import('jose') });
function createApiGuard(verify = verifyApiAccessToken) {
 return async function requireApiAccessToken(context, req, scope) {
  try { return await verify(common.bearerToken(req), scope); }
  catch (error) {
    context.res = { status: error.status || 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
      body: { ok: false, error: error.code || 'api_owner_denied' } };
    return null;
  }
}
}
const requireApiAccessToken = createApiGuard();
module.exports = { createApiGuard, ...common, verifyApiAccessToken, requireApiAccessToken };
