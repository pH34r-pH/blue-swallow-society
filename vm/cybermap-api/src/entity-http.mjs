import { createEntityApiAdapter } from './entity-api-adapter.mjs';
import { entityError } from './entity-contract.mjs';

const PATH = /^\/api\/v1\/entities\/(list|detail|preview|mutate)$/;
const MAX_BYTES = 64 * 1024;
/** Entity dispatch mounted when the server receives an entity store. */
export function createEntityRequestHandler(options) {
  const adapter = createEntityApiAdapter(options);
  return async (request, response, url) => {
    const match = PATH.exec(url.pathname);
    if (!match) return false;
    try {
      if (request.method !== 'POST') throw entityError('entity_method_not_allowed', 405);
      if (url.search) throw entityError('invalid_entity_request');
      const input = await readBody(request);
      const body = await adapter.handle({ operation: match[1], input, headers: request.headers });
      send(response, 200, body);
    } catch (error) {
      request.resume();
      const status = error.statusCode ?? error.status;
      const known = Number.isInteger(status) && status >= 400 && status <= 503;
      send(response, known ? status : 503, { ok: false, error: known ? error.code : 'entity_unavailable' });
    }
    return true;
  };
}
async function readBody(request) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers['content-type'] ?? '')) throw entityError('invalid_entity_content_type', 415);
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) throw entityError('entity_request_too_large', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw entityError('invalid_entity_request'); }
}
function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}
