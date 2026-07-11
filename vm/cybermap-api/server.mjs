import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { checkDatabaseReadiness } from './db.mjs';
import {
  authenticateApiRequest,
  createTokenRegistry,
  createTokenRegistryFromEnv,
  hashToken,
} from './auth.mjs';
import { authorizeApiRequest, routeKindForRequest } from './source-registry.mjs';
import { createPublicRateLimiter } from './rate-limit.mjs';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8000;
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function legacyOptionTokenRecords(tokens = []) {
  return tokens.map((token, index) => ({
    tokenHash: hashToken(token),
    tokenId: index === 0 ? 'option-operator' : `option-operator-${index + 1}`,
    clientType: 'operator_admin',
    scopes: ['*'],
  }));
}

function tokenRegistryFromOptions(options, env) {
  if (options.tokenRegistry) return options.tokenRegistry;
  if (options.tokenRecords) return createTokenRegistry(options.tokenRecords);
  if (options.authTokens) return createTokenRegistry(legacyOptionTokenRecords(options.authTokens));
  return createTokenRegistryFromEnv(env);
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
    let resolved = false;
    req.on('data', (chunk) => {
      if (resolved) return;
      size += chunk.length;
      if (size > bodyLimitBytes) {
        resolved = true;
        req.destroy();
        resolve({ ok: false, code: 'body_too_large', body: '' });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!resolved) resolve({ ok: true, body: Buffer.concat(chunks).toString('utf8') });
    });
    req.on('error', (error) => {
      if (!resolved) reject(error);
    });
  });
}

function parseJsonBody(body, contentType = '') {
  if (!body) return { ok: true, value: null };
  const trimmed = body.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!String(contentType).toLowerCase().includes('application/json') && !/^[{[]/.test(trimmed)) {
    return { ok: true, value: null };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: 'invalid_json',
      message: 'Request body must be valid JSON.',
    };
  }
}

function defaultLogger(entry) {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function logAuthDecision(logger, { requestId, req, url, result, stage = 'auth' }) {
  const identity = result.identity;
  logger({
    service: 'cybermap-api',
    structured: true,
    event: 'auth_decision',
    stage,
    requestId,
    method: req.method,
    path: url.pathname,
    decision: result.ok ? 'allow' : 'deny',
    reason: result.ok ? 'authorized' : result.code,
    statusCode: result.statusCode || 200,
    ...(identity ? {
      tokenId: identity.tokenId,
      clientType: identity.clientType,
      scopeCount: identity.scopes?.length || 0,
      sourceIdCount: identity.sourceIds?.length || 0,
      sourceClassCount: identity.sourceClasses?.length || 0,
    } : {}),
    ...(result.requiredScopes ? { requiredScopes: result.requiredScopes } : {}),
  });
}

function errorBody(code, message) {
  return {
    ok: false,
    error: { code, message },
  };
}

function rateLimitHeaders(decision) {
  const headers = {
    'Retry-After': String(decision.retryAfterSeconds || 60),
  };
  if (decision.limit !== undefined) headers['X-RateLimit-Limit'] = String(decision.limit);
  if (decision.remaining !== undefined) headers['X-RateLimit-Remaining'] = String(decision.remaining);
  if (decision.resetAt) headers['X-RateLimit-Reset'] = decision.resetAt;
  return headers;
}

export function createCybermapApiServer(options = {}) {
  const env = options.env || process.env;
  const tokenRegistry = tokenRegistryFromOptions(options, env);
  const bodyLimitBytes = parsePositiveInteger(
    options.bodyLimitBytes ?? env.CYBERMAP_BODY_LIMIT_BYTES ?? process.env.CYBERMAP_BODY_LIMIT_BYTES,
    DEFAULT_BODY_LIMIT_BYTES,
  );
  const logger = options.logger || defaultLogger;
  const now = options.now || (() => new Date());
  const rateLimitHook = options.rateLimitHook || createPublicRateLimiter({
    ...(options.rateLimit || {}),
    env,
    now: () => now(),
  });
  const serviceVersion = options.serviceVersion || process.env.CYBERMAP_API_VERSION || '0.1.0';
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
        const routeKind = routeKindForRequest(req.method, url.pathname);
        const preAuthRateLimitDecision = await rateLimitHook({
          req,
          requestId,
          method: req.method,
          path: url.pathname,
          routeKind,
        });
        if (preAuthRateLimitDecision?.allowed === false) {
          respondJson(res, 429, requestId, errorBody(
            preAuthRateLimitDecision.code || 'rate_limited',
            preAuthRateLimitDecision.message || 'Request rejected by rate limit policy.',
          ), rateLimitHeaders(preAuthRateLimitDecision));
          return;
        }

        const authResult = authenticateApiRequest(req, tokenRegistry, now());
        logAuthDecision(logger, { requestId, req, url, result: authResult, stage: 'auth' });
        if (!authResult.ok) {
          respondJson(res, authResult.statusCode, requestId, errorBody(authResult.code, authResult.message));
          return;
        }

        const bodyResult = await readBodyWithLimit(req, bodyLimitBytes);
        if (!bodyResult.ok) {
          respondJson(res, 413, requestId, errorBody('body_too_large', 'Request body exceeds configured Cybermap API limit.'));
          return;
        }

        const parsedBody = parseJsonBody(bodyResult.body, req.headers['content-type'] || '');
        if (!parsedBody.ok) {
          respondJson(res, parsedBody.statusCode, requestId, errorBody(parsedBody.code, parsedBody.message));
          return;
        }

        const sourceScopeResult = authorizeApiRequest({
          identity: authResult.identity,
          method: req.method,
          pathname: url.pathname,
          searchParams: url.searchParams,
          body: parsedBody.value,
        });
        logAuthDecision(logger, {
          requestId,
          req,
          url,
          stage: 'authorization',
          result: {
            ...sourceScopeResult,
            identity: authResult.identity,
            statusCode: sourceScopeResult.statusCode || 200,
          },
        });
        if (!sourceScopeResult.ok) {
          respondJson(res, sourceScopeResult.statusCode, requestId, errorBody(sourceScopeResult.code, sourceScopeResult.message));
          return;
        }

        const rateLimitDecision = await rateLimitHook({
          req,
          requestId,
          method: req.method,
          path: url.pathname,
          identity: authResult.identity,
          routeKind,
        });
        if (rateLimitDecision?.allowed === false) {
          respondJson(res, 429, requestId, errorBody(
            rateLimitDecision.code || 'rate_limited',
            rateLimitDecision.message || 'Request rejected by rate limit policy.',
          ), rateLimitHeaders(rateLimitDecision));
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

      respondJson(res, 404, requestId, errorBody('not_found', 'Route not found.'));
    } catch {
      respondJson(res, 500, requestId, errorBody('internal_error', 'Cybermap API request failed.'));
      logger({
        service: 'cybermap-api',
        structured: true,
        requestId,
        statusCode: 500,
        level: 'error',
        error: 'request_handler_failed',
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
