const crypto = require('node:crypto');

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_TABLE_NAME = 'passcodeFailures';
const PARTITION_KEY = 'passcode-v1';
const MAX_MUTATION_RETRIES = 5;

class PasscodeRateLimitUnavailableError extends Error {
  constructor(message = 'Passcode rate limiting is unavailable.') {
    super(message);
    this.name = 'PasscodeRateLimitUnavailableError';
    this.statusCode = 503;
  }
}

function getPasscodeRateLimitConfig(env = process.env) {
  return {
    maxAttempts: getBoundedPositiveInt(env.BLUE_SWALLOW_PASSCODE_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, 1, 100),
    windowMs: getBoundedPositiveInt(env.BLUE_SWALLOW_PASSCODE_WINDOW_MS, DEFAULT_WINDOW_MS, 10_000, 86_400_000),
  };
}

function createPasscodeRateLimiter({
  connectionString = process.env.BLUE_SWALLOW_PASSCODE_RATE_LIMIT_STORAGE_CONNECTION_STRING,
  tableName = process.env.BLUE_SWALLOW_PASSCODE_RATE_LIMIT_TABLE || DEFAULT_TABLE_NAME,
  client = null,
} = {}) {
  if (!client && !String(connectionString || '').trim()) {
    return unavailableLimiter('Passcode rate limiting is not configured.');
  }

  try {
    const tableClient = client || createTableClient(connectionString, tableName);
    return new AzureTablePasscodeRateLimiter(tableClient);
  } catch {
    return unavailableLimiter();
  }
}

function createTableClient(connectionString, tableName) {
  const { TableClient } = require('@azure/data-tables');
  return TableClient.fromConnectionString(String(connectionString).trim(), validateTableName(tableName));
}

class AzureTablePasscodeRateLimiter {
  constructor(client) {
    this.client = client;
  }

  async check(callerKey, { maxAttempts, now = Date.now() } = {}) {
    const state = await this.#read(callerKey, now);
    if (state.attempts < maxAttempts) {
      return { limited: false, retryAfterSeconds: 0 };
    }
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((state.expiresAtMs - now) / 1000)),
    };
  }

  async recordFailure(callerKey, { windowMs, now = Date.now() } = {}) {
    for (let retry = 0; retry < MAX_MUTATION_RETRIES; retry += 1) {
      const state = await this.#read(callerKey, now);
      if (state.expired) {
        await this.#deleteExpired(callerKey, state.etag);
        continue;
      }

      const entity = {
        partitionKey: PARTITION_KEY,
        rowKey: callerKey,
        attempts: state.attempts + 1,
        expiresAt: new Date(state.expiresAtMs || now + windowMs).toISOString(),
      };
      try {
        if (state.exists) {
          await this.client.updateEntity(entity, 'Replace', { etag: state.etag });
        } else {
          await this.client.createEntity(entity);
        }
        return;
      } catch (error) {
        if (isConcurrencyError(error)) continue;
        throw unavailable(error);
      }
    }
    throw unavailable();
  }

  async reset(callerKey) {
    try {
      await this.client.deleteEntity(PARTITION_KEY, callerKey, { etag: '*' });
    } catch (error) {
      if (isNotFound(error)) return;
      throw unavailable(error);
    }
  }

  async #read(callerKey, now) {
    try {
      const entity = await this.client.getEntity(PARTITION_KEY, callerKey);
      const expiresAtMs = Date.parse(entity.expiresAt);
      const attempts = Number.isSafeInteger(entity.attempts) && entity.attempts > 0 ? entity.attempts : 0;
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
        return { exists: true, expired: true, attempts: 0, expiresAtMs: 0, etag: entity.etag };
      }
      return { exists: true, expired: false, attempts, expiresAtMs, etag: entity.etag };
    } catch (error) {
      if (isNotFound(error)) {
        return { exists: false, expired: false, attempts: 0, expiresAtMs: 0, etag: null };
      }
      throw unavailable(error);
    }
  }

  async #deleteExpired(callerKey, etag) {
    try {
      await this.client.deleteEntity(PARTITION_KEY, callerKey, { etag: etag || '*' });
    } catch (error) {
      if (isNotFound(error) || isConcurrencyError(error)) return;
      throw unavailable(error);
    }
  }
}

function unavailableLimiter(message) {
  return {
    async check() { throw new PasscodeRateLimitUnavailableError(message); },
    async recordFailure() { throw new PasscodeRateLimitUnavailableError(message); },
    async reset() { throw new PasscodeRateLimitUnavailableError(message); },
  };
}

function callerKeyForRequest(req) {
  const raw = firstForwardedAddress(toHeader(req, 'x-azure-clientip') || toHeader(req, 'x-forwarded-for') || toHeader(req, 'x-client-ip'));
  const normalized = normalizeClientAddress(raw) || 'unknown';
  return crypto.createHash('sha256').update(`bss-passcode-rate-limit:v1:${normalized}`, 'utf8').digest('hex');
}

function firstForwardedAddress(value) {
  return String(value || '').split(',')[0]?.trim() || '';
}

function normalizeClientAddress(value) {
  const candidate = String(value || '').trim().toLowerCase();
  if (!candidate || candidate.length > 128) return '';
  if (/^\[[0-9a-f:.]+\](?::\d{1,5})?$/.test(candidate)) return candidate.replace(/^\[|\](?::\d{1,5})?$/g, '');
  if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?$/.test(candidate)) return candidate.replace(/:\d{1,5}$/, '');
  if (/^[0-9a-f:]+$/.test(candidate)) return candidate;
  return '';
}

function toHeader(req, name) {
  const headers = req?.headers || {};
  const lowerName = name.toLowerCase();
  if (typeof headers.get === 'function') return headerValueToString(headers.get(name) ?? headers.get(lowerName));
  const direct = headers[name] ?? headers[lowerName] ?? headers[name.toUpperCase()];
  if (direct !== undefined) return headerValueToString(direct);
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === lowerName) return headerValueToString(value);
  }
  return '';
}

function headerValueToString(value) {
  if (Array.isArray(value)) return headerValueToString(value[0]);
  if (value === null || value === undefined) return '';
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

function getBoundedPositiveInt(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function validateTableName(value) {
  const name = String(value || '').trim();
  if (!/^[A-Za-z][A-Za-z0-9]{2,62}$/.test(name)) {
    throw new PasscodeRateLimitUnavailableError('Passcode rate-limit table configuration is invalid.');
  }
  return name;
}

function isNotFound(error) {
  return Number(error?.statusCode ?? error?.status) === 404;
}

function isConcurrencyError(error) {
  return [409, 412].includes(Number(error?.statusCode ?? error?.status));
}

function unavailable(error) {
  if (error instanceof PasscodeRateLimitUnavailableError) return error;
  return new PasscodeRateLimitUnavailableError();
}

module.exports = {
  AzureTablePasscodeRateLimiter,
  PasscodeRateLimitUnavailableError,
  callerKeyForRequest,
  createPasscodeRateLimiter,
  getPasscodeRateLimitConfig,
  normalizeClientAddress,
};
