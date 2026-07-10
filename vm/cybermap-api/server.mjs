import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { checkDatabaseReadiness } from './db.mjs';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8000;
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadAuthTokens(env = process.env) {
  return [env.CYBERMAP_API_TOKEN, env.CYBERMAP_API_TOKENS, env.BLUE_SWALLOW_OPERATOR_TOKEN]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function extractBearerToken(req) {
  const authorization = req.headers.authorization || '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer
    || req.headers['x-blue-swallow-operator-token']
    || req.headers['x-cybermap-token']
    || '';
}

function authenticateApiRequest(req, authTokens) {
  const token = extractBearerToken(req);
  if (!authTokens.length) {
    return {
      ok: false,
      statusCode: 503,
      code: 'auth_not_configured',
      message: 'Cybermap API token configuration is pending.',
    };
  }
  if (!token) {
    return {
      ok: false,
      statusCode: 401,
      code: 'auth_required',
      message: 'Bearer token required for /api/v1 endpoints.',
    };
  }
  if (!authTokens.some((candidate) => constantTimeEquals(candidate, token))) {
    return {
      ok: false,
      statusCode: 403,
      code: 'auth_forbidden',
      message: 'Bearer token was not accepted.',
    };
  }
  return { ok: true };
}

function respondJson(res, statusCode, requestId, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId,
    ...headers,
  });
  res.end(payload);
}

function readBodyWithLimit(req, bodyLimitBytes) {
  const contentLength = Number.parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > bodyLimitBytes) {
    req.resume();
    return Promise.resolve({ ok: false, code: 'body_too_large', body: '' });
  }

  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > bodyLimitBytes) {
        req.destroy();
        resolve({ ok: false, code: 'body_too_large', body: '' });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve({ ok: true, body: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', (error) => reject(error));
  });
}

function defaultLogger(entry) {
  process.stdout.write(`${JSON.stringify(entry)}
`);
}

export function createCybermapApiServer(options = {}) {
  const authTokens = options.authTokens ?? loadAuthTokens(options.env || process.env);
  const bodyLimitBytes = parsePositiveInteger(
    options.bodyLimitBytes ?? options.env?.CYBERMAP_BODY_LIMIT_BYTES ?? process.env.CYBERMAP_BODY_LIMIT_BYTES,
    DEFAULT_BODY_LIMIT_BYTES,
  );
  const logger = options.logger || defaultLogger;
  const now = options.now || (() => new Date());
  const rateLimitHook = options.rateLimitHook || (() => ({ allowed: true }));
  const serviceVersion = options.serviceVersion || process.env.CYBERMAP_API_VERSION || '0.1.0';
  const env = options.env || process.env;
  const dbPoolFactory = options.dbPoolFactory;
  const expectedMigration = options.expectedMigration || env.CYBERMAP_EXPECTED_MIGRATION;

  return http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestIdHeader = req.headers['x-request-id'];
    const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : (requestIdHeader || randomUUID());
    const url = new URL(req.url || '/', 'http://localhost');

    res.on('finish', () => {
      logger({
        service: 'cybermap-api',
        structured: true,
        requestId,
        method: req.method,
        path: url.pathname,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    try {
      const rateLimitDecision = await rateLimitHook({ req, requestId, path: url.pathname });
      if (rateLimitDecision?.allowed === false) {
        respondJson(res, 429, requestId, {
          ok: false,
          error: {
            code: 'rate_limited',
            message: rateLimitDecision.message || 'Request rejected by rate limit hook.',
          },
        }, { 'Retry-After': String(rateLimitDecision.retryAfterSeconds || 60) });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/healthz') {
        respondJson(res, 200, requestId, {
          ok: true,
          service: 'cybermap-api',
          version: serviceVersion,
          time: now().toISOString(),
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/readyz') {
        const readiness = await checkDatabaseReadiness({
          env,
          poolFactory: dbPoolFactory,
          expectedMigration,
        });
        respondJson(res, readiness.statusCode, requestId, {
          ok: readiness.ok,
          service: 'cybermap-api',
          time: now().toISOString(),
          dependencies: {
            postgres: readiness.postgres,
          },
        });
        return;
      }

      if (url.pathname.startsWith('/api/v1/')) {
        const authResult = authenticateApiRequest(req, authTokens);
        if (!authResult.ok) {
          respondJson(res, authResult.statusCode, requestId, {
            ok: false,
            error: {
              code: authResult.code,
              message: authResult.message,
            },
          });
          return;
        }

        const bodyResult = await readBodyWithLimit(req, bodyLimitBytes);
        if (!bodyResult.ok) {
          respondJson(res, 413, requestId, {
            ok: false,
            error: {
              code: 'body_too_large',
              message: 'Request body exceeds configured Cybermap API limit.',
            },
          });
          return;
        }

        respondJson(res, 501, requestId, {
          ok: false,
          service: 'cybermap-api',
          error: {
            code: 'not_implemented',
            message: 'Cybermap API route scaffolded; DB-backed implementation lands in a later task.',
          },
        });
        return;
      }

      respondJson(res, 404, requestId, {
        ok: false,
        error: {
          code: 'not_found',
          message: 'Route not found.',
        },
      });
    } catch (error) {
      respondJson(res, 500, requestId, {
        ok: false,
        error: {
          code: 'internal_error',
          message: 'Cybermap API request failed.',
        },
      });
      logger({
        service: 'cybermap-api',
        structured: true,
        requestId,
        level: 'error',
        error: error?.message || String(error),
      });
    }
  });
}

export function listenFromEnvironment(env = process.env) {
  const host = env.CYBERMAP_API_HOST || DEFAULT_HOST;
  const port = parsePositiveInteger(env.CYBERMAP_API_PORT, DEFAULT_PORT);
  const server = createCybermapApiServer({ env });
  server.listen(port, host, () => {
    defaultLogger({
      service: 'cybermap-api',
      structured: true,
      event: 'listening',
      host,
      port,
    });
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  listenFromEnvironment();
}
