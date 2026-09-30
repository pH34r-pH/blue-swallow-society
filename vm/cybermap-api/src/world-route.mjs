import apiTokens from './api-access-token.cjs';
import { IngestError } from './auth.mjs';

/** Standalone dispatch hook. Parent server owns mounting and error handling. */
export function createWorldRoute({ service, verify = apiTokens.verifyApiAccessToken } = {}) {
  if (typeof service?.read !== 'function') throw new TypeError('World snapshot service required.');
  return async (request, response, url) => {
    if (url.pathname !== '/api/v1/world/context') return false;
    try { await verify(apiTokens.bearerToken(request), 'Owner.Read'); }
    catch (error) { throw new IngestError(error.code || 'api_owner_denied', 'Owner API authorization required.', { statusCode: error.status || 403 }); }
    const invalid = request.method !== 'POST' || url.search || Number(request.headers['content-length'] || 0) > 2
      || request.headers['transfer-encoding'];
    // Wrapper submits only {}; discard the bounded body. No filters/private coordinates leave this route.
    const body = invalid ? '' : await boundedBody(request);
    const bad = invalid || (body && body !== '{}');
    if (bad) request.resume();
    response.writeHead(bad ? 400 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
    response.end(JSON.stringify(bad ? { ok: false, error: 'world_request_invalid' } : await service.read()));
    return true;
  };
}

function boundedBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    const cleanup = () => { clearTimeout(timer); request.off('data', data); request.off('end', end); request.off('error', error); request.off('aborted', aborted); };
    const data = (chunk) => { body += chunk.toString(); if (Buffer.byteLength(body) > 2) { cleanup(); request.pause(); resolve('invalid'); } };
    const end = () => { cleanup(); resolve(body); };
    const error = () => { cleanup(); reject(new IngestError('world_request_invalid', 'World request unavailable.', { statusCode: 400 })); };
    const aborted = error;
    const timer = setTimeout(() => { cleanup(); reject(new IngestError('world_request_timeout', 'World request timed out.', { statusCode: 408 })); }, 5000);
    request.on('data', data); request.once('end', end); request.once('error', error); request.once('aborted', aborted);
  });
}
