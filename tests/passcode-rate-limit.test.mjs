import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  AzureTablePasscodeRateLimiter,
  PasscodeRateLimitUnavailableError,
  callerKeyForRequest,
  createPasscodeRateLimiter,
} = require('../api/_lib/passcode-rate-limit.js');

function notFound() {
  const error = new Error('not found');
  error.statusCode = 404;
  return error;
}

function createTableClient() {
  const entities = new Map();
  return {
    async getEntity(partitionKey, rowKey) {
      const value = entities.get(`${partitionKey}:${rowKey}`);
      if (!value) throw notFound();
      return { ...value };
    },
    async createEntity(entity) {
      const key = `${entity.partitionKey}:${entity.rowKey}`;
      if (entities.has(key)) {
        const error = new Error('conflict');
        error.statusCode = 409;
        throw error;
      }
      entities.set(key, { ...entity, etag: 'one' });
    },
    async updateEntity(entity, _mode, { etag }) {
      const key = `${entity.partitionKey}:${entity.rowKey}`;
      const existing = entities.get(key);
      if (!existing || existing.etag !== etag) {
        const error = new Error('precondition failed');
        error.statusCode = 412;
        throw error;
      }
      entities.set(key, { ...entity, etag: `${Number(existing.attempts) + 1}` });
    },
    async deleteEntity(partitionKey, rowKey) {
      entities.delete(`${partitionKey}:${rowKey}`);
    },
  };
}

test('caller identity is normalized and stored only as a one-way key', () => {
  const first = callerKeyForRequest({ headers: { 'x-forwarded-for': '198.51.100.24, 10.0.0.1' } });
  const same = callerKeyForRequest({ headers: { 'x-forwarded-for': '198.51.100.24' } });
  const next = callerKeyForRequest({ headers: { 'x-forwarded-for': '198.51.100.25' } });
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, same);
  assert.notEqual(first, next);
});

test('Azure Table limiter provides an authoritative failure window and reset', async () => {
  const tableClient = createTableClient();
  const firstInstance = new AzureTablePasscodeRateLimiter(tableClient);
  const secondInstance = new AzureTablePasscodeRateLimiter(tableClient);
  const caller = 'a'.repeat(64);
  const now = Date.UTC(2026, 6, 28);
  assert.deepEqual(await firstInstance.check(caller, { maxAttempts: 2, now }), { limited: false, retryAfterSeconds: 0 });
  await firstInstance.recordFailure(caller, { windowMs: 60_000, now });
  await firstInstance.recordFailure(caller, { windowMs: 60_000, now: now + 1 });
  const limited = await secondInstance.check(caller, { maxAttempts: 2, now: now + 2 });
  assert.equal(limited.limited, true);
  assert.equal(limited.retryAfterSeconds, 60);
  await secondInstance.reset(caller);
  assert.equal((await firstInstance.check(caller, { maxAttempts: 2, now: now + 3 })).limited, false);
});

test('missing shared-rate-limit configuration fails closed', async () => {
  const limiter = createPasscodeRateLimiter({ connectionString: '' });
  await assert.rejects(() => limiter.check('a'.repeat(64), { maxAttempts: 1 }), PasscodeRateLimitUnavailableError);
});
