const { randomUUID } = require('node:crypto');
const { requireOperatorToken } = require('../_lib/operator-auth');

const BACKEND_BASE_URL_ENV = 'CYBERMAP_BACKEND_BASE_URL';
const BACKEND_TOKEN_ENV = 'CYBERMAP_BACKEND_TOKEN';
const DEFAULT_TIMEOUT_MS = 8_000;
const REDACTED = '[redacted]';
const SENSITIVE_KEYS = new Set([
  'authorization',
  'proxy-authorization',
  'x-cybermap-token',
  'x-blue-swallow-operator-token',
]);
const OFFLINE_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'ECONNRESET',
]);

function trimEnv(name) {
  return String(process.env[name] || '').trim();
}

function parseTimeoutMs() {
  const parsed = Number.parseInt(process.env.CYBERMAP_PROXY_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function sendJson(context, status, body) {
  context.res = {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body,
  };
  return context.res;
}

function degradedBody({ code, message, state = 'degraded', backendStatus, retryable = true }) {
  return {
    ok: false,
    state,
    source: 'vm-cybermap-api',
    message,
    ...(backendStatus ? { backendStatus } : {}),
    retryable,
    error: {
      code,
      message,
    },
  };
}

function sendDegraded(context, status, details) {
  return sendJson(context, status, degradedBody(details));
}

function getHeader(req, name) {
  const headers = req?.headers || {};
  const lowerName = name.toLowerCase();
  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(lowerName) || '';
  }
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === lowerName) {
      return Array.isArray(value) ? value[0] : String(value || '');
    }
  }
  return '';
}

function normalizePath(pathValue) {
  return String(pathValue || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

function requestPathSegments(req) {
  const paramPath = req?.params?.path ?? req?.params?.['*'] ?? req?.params?.route;
  if (paramPath) {
    return normalizePath(paramPath);
  }

  const url = new URL(req?.url || '/api/cybermap', 'https://swa.local');
  const marker = '/api/cybermap/';
  const index = url.pathname.toLowerCase().indexOf(marker);
  if (index >= 0) {
    return normalizePath(url.pathname.slice(index + marker.length));
  }
  if (url.pathname.toLowerCase() === '/api/cybermap') {
    return [];
  }
  return normalizePath(url.pathname);
}

function encodePathSegment(segment) {
  return encodeURIComponent(segment);
}

function mapCybermapRoute(req) {
  const segments = requestPathSegments(req);
  const [first, second, ...rest] = segments;

  if (segments.length === 1 && first === 'viewport') {
    return '/api/v1/cybermap/viewport';
  }
  if (segments.length === 2 && first === 'cells' && second) {
    return `/api/v1/cybermap/cells/${encodePathSegment(second)}`;
  }
  if (segments.length === 2 && first === 'entities' && second) {
    return `/api/v1/entities/${encodePathSegment(second)}`;
  }
  if (segments.length === 1 && first === 'sources') {
    return '/api/v1/sources';
  }

  const route = rest.length ? `${first || ''}/${second || ''}/${rest.join('/')}` : segments.join('/');
  return { unsupported: route || '(root)' };
}

function buildSearchParams(req) {
  const requestUrl = new URL(req?.url || 'https://swa.local/api/cybermap', 'https://swa.local');
  if ([...requestUrl.searchParams.keys()].length > 0) {
    return requestUrl.searchParams;
  }

  const params = new URLSearchParams();
  const query = req?.query || {};
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) params.append(key, String(item));
      }
    } else if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  return params;
}

function buildBackendUrl(baseUrl, routePath, req) {
  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
  const url = new URL(`${normalizedBase}${routePath}`);
  const params = buildSearchParams(req);
  const search = params.toString();
  if (search) {
    url.search = search;
  }
  return url;
}

function redactSecrets(value, secrets) {
  const activeSecrets = secrets.filter(Boolean);
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return activeSecrets.reduce((result, secret) => result.split(secret).join(REDACTED), value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, activeSecrets));
  }
  if (typeof value === 'object') {
    const redacted = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
        continue;
      }
      redacted[key] = redactSecrets(item, activeSecrets);
    }
    return redacted;
  }
  return value;
}

function parseJsonResponse(text) {
  if (!String(text || '').trim()) {
    return null;
  }
  return JSON.parse(text);
}

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

function backendErrorCode(error) {
  return error?.cause?.code || error?.code || '';
}

function isOfflineError(error) {
  const code = backendErrorCode(error);
  return OFFLINE_ERROR_CODES.has(code) || /ECONNREFUSED|ENOTFOUND|ENETUNREACH|EHOSTUNREACH|ECONNRESET/i.test(String(error?.message || ''));
}

async function fetchBackendJson({ targetUrl, backendToken, requestId, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BlueSwallowSociety-SWA-CybermapProxy/1.0',
        'X-Request-Id': requestId,
        'X-Cybermap-Token': backendToken,
      },
    });
    const text = await response.text();
    const parsed = parseJsonResponse(text);
    return { response, parsed };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function cybermapProxy(context, req) {
  const operatorAuth = requireOperatorToken(context, req);
  if (!operatorAuth.ok) {
    return context.res;
  }

  if (String(req?.method || 'GET').toUpperCase() !== 'GET') {
    return sendJson(context, 405, {
      ok: false,
      error: {
        code: 'method_not_allowed',
        message: 'Cybermap SWA proxy only supports GET read routes.',
      },
    });
  }

  const backendBaseUrl = trimEnv(BACKEND_BASE_URL_ENV);
  if (!backendBaseUrl) {
    return sendDegraded(context, 503, {
      code: 'backend_url_unconfigured',
      message: `Set ${BACKEND_BASE_URL_ENV} on the Static Web App to enable Cybermap reads.`,
      retryable: false,
    });
  }

  const backendToken = trimEnv(BACKEND_TOKEN_ENV);
  if (!backendToken) {
    return sendDegraded(context, 503, {
      code: 'backend_token_unconfigured',
      message: `Set ${BACKEND_TOKEN_ENV} on the Static Web App to enable Cybermap reads.`,
      retryable: false,
    });
  }

  const routePath = mapCybermapRoute(req);
  if (routePath?.unsupported) {
    return sendJson(context, 404, {
      ok: false,
      error: {
        code: 'unsupported_cybermap_route',
        message: 'Cybermap SWA proxy supports viewport, cells/{h3Cell}, entities/{id}, and sources read routes.',
      },
    });
  }

  let targetUrl;
  try {
    targetUrl = buildBackendUrl(backendBaseUrl, routePath, req);
  } catch {
    return sendDegraded(context, 503, {
      code: 'backend_url_invalid',
      message: `${BACKEND_BASE_URL_ENV} must be an absolute HTTPS URL for the Cybermap VM gateway.`,
      retryable: false,
    });
  }

  if (targetUrl.protocol !== 'https:') {
    return sendDegraded(context, 503, {
      code: 'backend_url_invalid',
      message: `${BACKEND_BASE_URL_ENV} must use https:// for the Cybermap VM gateway.`,
      retryable: false,
    });
  }

  const requestId = getHeader(req, 'x-request-id') || randomUUID();
  const timeoutMs = parseTimeoutMs();

  try {
    const { response, parsed } = await fetchBackendJson({ targetUrl, backendToken, requestId, timeoutMs });
    const sanitized = redactSecrets(parsed, [backendToken]);

    if (!response.ok) {
      const backendStatus = Number.isFinite(response.status) ? response.status : 502;
      if (backendStatus === 401 || backendStatus === 403) {
        return sendDegraded(context, 502, {
          code: 'backend_auth_failed',
          message: 'Cybermap backend rejected the SWA service token. Check the VM auth registry and SWA app setting.',
          backendStatus,
          retryable: false,
        });
      }
      return sendDegraded(context, 502, {
        code: 'backend_error',
        message: 'Cybermap backend returned an unavailable response.',
        backendStatus,
      });
    }

    if (!sanitized || typeof sanitized !== 'object') {
      return sendDegraded(context, 502, {
        code: 'backend_malformed_response',
        message: 'Cybermap backend returned a malformed response.',
      });
    }

    return sendJson(context, 200, sanitized);
  } catch (error) {
    if (isAbortError(error)) {
      context?.log?.warn?.('Cybermap backend request timed out');
      return sendDegraded(context, 504, {
        code: 'backend_timeout',
        state: 'offline',
        message: 'Cybermap backend timed out before returning data.',
      });
    }

    if (error instanceof SyntaxError) {
      context?.log?.warn?.('Cybermap backend returned malformed JSON');
      return sendDegraded(context, 502, {
        code: 'backend_malformed_response',
        message: 'Cybermap backend returned a malformed response.',
      });
    }

    if (isOfflineError(error)) {
      context?.log?.warn?.('Cybermap backend appears offline or auto-shutdown is active');
      return sendDegraded(context, 503, {
        code: 'vm_offline',
        state: 'offline',
        message: 'Cybermap VM gateway is offline or autoshutdown/auto-shutdown is active; frontend should show degraded map state.',
      });
    }

    context?.log?.warn?.('Cybermap backend request failed');
    return sendDegraded(context, 502, {
      code: 'backend_request_failed',
      message: 'Cybermap backend request failed before data could be returned.',
    });
  }
};

module.exports._private = {
  buildBackendUrl,
  mapCybermapRoute,
  redactSecrets,
};
