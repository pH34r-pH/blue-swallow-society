import { routeKindForRequest } from './source-registry.mjs';

const DEFAULT_INGEST_LIMIT = 60;
const DEFAULT_READ_LIMIT = 300;
const DEFAULT_WINDOW_MS = 60_000;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolFromEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

function headerValue(req, name) {
  const value = req?.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeRemoteAddress(value) {
  return String(value || 'unknown')
    .split(',')[0]
    .trim()
    .replace(/[^a-zA-Z0-9:._-]/g, '_') || 'unknown';
}

function isLoopbackAddress(value) {
  const address = sanitizeRemoteAddress(value).toLowerCase();
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
    || address === 'localhost';
}

function remoteAddressFor(req) {
  const socketAddress = sanitizeRemoteAddress(req?.socket?.remoteAddress);
  if (isLoopbackAddress(socketAddress)) {
    const realIp = headerValue(req, 'x-real-ip');
    if (realIp) return sanitizeRemoteAddress(realIp);
  }
  return socketAddress;
}

function nowMsFrom(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.now();
}

export function createPublicRateLimiter(options = {}) {
  const env = options.env || {};
  const enabled = options.enabled ?? !boolFromEnv(env.CYBERMAP_PRIVATE_MESH_ONLY);
  const ingestLimit = parsePositiveInteger(options.ingestLimit ?? env.CYBERMAP_INGEST_RATE_LIMIT, DEFAULT_INGEST_LIMIT);
  const readLimit = parsePositiveInteger(options.readLimit ?? env.CYBERMAP_READ_RATE_LIMIT, DEFAULT_READ_LIMIT);
  const ingestWindowMs = parsePositiveInteger(options.ingestWindowMs ?? env.CYBERMAP_INGEST_RATE_WINDOW_MS, DEFAULT_WINDOW_MS);
  const readWindowMs = parsePositiveInteger(options.readWindowMs ?? env.CYBERMAP_READ_RATE_WINDOW_MS, DEFAULT_WINDOW_MS);
  const now = options.now || (() => Date.now());
  const buckets = new Map();

  return function publicRateLimitHook({ req, method, path, identity, routeKind } = {}) {
    if (!enabled) return { allowed: true };
    const pathname = path || '/';
    const kind = routeKind || routeKindForRequest(method || req?.method || 'GET', pathname);
    if (kind !== 'ingest' && kind !== 'read') return { allowed: true };

    const limit = kind === 'ingest' ? ingestLimit : readLimit;
    const windowMs = kind === 'ingest' ? ingestWindowMs : readWindowMs;
    const tokenKey = identity?.tokenId ? `token:${identity.tokenId}` : `ip:${remoteAddressFor(req)}`;
    const key = `${kind}:${tokenKey}`;
    const timestamp = nowMsFrom(now());
    const current = buckets.get(key);
    const bucket = current && current.resetAt > timestamp
      ? current
      : { count: 0, resetAt: timestamp + windowMs };

    if (bucket.count >= limit) {
      buckets.set(key, bucket);
      return {
        allowed: false,
        code: 'rate_limited',
        message: `Cybermap ${kind} rate limit exceeded.`,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000)),
        limit,
        remaining: 0,
        resetAt: new Date(bucket.resetAt).toISOString(),
      };
    }

    bucket.count += 1;
    buckets.set(key, bucket);
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: new Date(bucket.resetAt).toISOString(),
    };
  };
}

export const rateLimitDefaults = Object.freeze({
  DEFAULT_INGEST_LIMIT,
  DEFAULT_READ_LIMIT,
  DEFAULT_WINDOW_MS,
});
