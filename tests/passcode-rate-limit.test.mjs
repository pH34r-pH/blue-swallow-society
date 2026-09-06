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
      const created = { ...entity, etag: 'one' };
      entities.set(key, created);
      return { etag: created.etag };
    },
    async updateEntity(entity, _mode, { etag }) {
      const key = `${entity.partitionKey}:${entity.rowKey}`;
      const existing = entities.get(key);
      if (!existing || existing.etag !== etag) {
        const error = new Error('precondition failed');
        error.statusCode = 412;
        throw error;
      }
      const updated = { ...entity, etag: `${Number(existing.attempts) + 1}` };
      entities.set(key, updated);
      return { etag: updated.etag };
    },
    async deleteEntity(partitionKey, rowKey, { etag = '*' } = {}) {
      const key = `${partitionKey}:${rowKey}`;
      const existing = entities.get(key);
      if (!existing) throw notFound();
      if (etag !== '*' && existing.etag !== etag) {
        const error = new Error('precondition failed');
        error.statusCode = 412;
        throw error;
      }
      entities.delete(key);
    },
  };
}

function createBurstTableClient(participants) {
  const entities = new Map();
  let firstReads = 0;
  let releaseFirstReads;
  const firstReadBarrier = new Promise((resolve) => { releaseFirstReads = resolve; });
  const counts = { createConflicts: 0, updateConflicts: 0 };

  const conflict = (statusCode) => {
    const error = new Error('conditional write conflict');
    error.statusCode = statusCode;
    return error;
  };

  return {
    counts,
    inspect(partitionKey, rowKey) {
      return entities.get(`${partitionKey}:${rowKey}`);
    },
    async getEntity(partitionKey, rowKey) {
      const key = `${partitionKey}:${rowKey}`;
      const firstSnapshot = entities.get(key);
      if (firstReads < participants) {
        firstReads += 1;
        if (firstReads === participants) releaseFirstReads();
        await firstReadBarrier;
        if (!firstSnapshot) throw notFound();
        return { ...firstSnapshot };
      }
      const current = entities.get(key);
      if (!current) throw notFound();
      return { ...current };
    },
    async createEntity(entity) {
      const key = `${entity.partitionKey}:${entity.rowKey}`;
      if (entities.has(key)) {
        counts.createConflicts += 1;
        throw conflict(409);
      }
      const created = { ...entity, etag: 'one' };
      entities.set(key, created);
      return { etag: created.etag };
    },
    async updateEntity(entity, _mode, { etag }) {
      const key = `${entity.partitionKey}:${entity.rowKey}`;
      const current = entities.get(key);
      if (!current || current.etag !== etag) {
        counts.updateConflicts += 1;
        throw conflict(412);
      }
      const updated = { ...entity, etag: `${Number(current.attempts) + 1}` };
      entities.set(key, updated);
      return { etag: updated.etag };
    },
    async deleteEntity(partitionKey, rowKey, { etag = '*' } = {}) {
      const key = `${partitionKey}:${rowKey}`;
      const current = entities.get(key);
      if (!current) throw notFound();
      if (etag !== '*' && current.etag !== etag) throw conflict(412);
      entities.delete(key);
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
  const firstReservation = await firstInstance.reserveAttempt(caller, { maxAttempts: 2, windowMs: 60_000, now });
  const secondReservation = await firstInstance.reserveAttempt(caller, { maxAttempts: 2, windowMs: 60_000, now: now + 1 });
  assert.equal(firstReservation.limited, false);
  assert.equal(secondReservation.limited, false);
  const limited = await secondInstance.check(caller, { maxAttempts: 2, now: now + 2 });
  assert.equal(limited.limited, true);
  assert.equal(limited.retryAfterSeconds, 60);
  await secondInstance.reset(caller, secondReservation.reservation);
  assert.equal((await firstInstance.check(caller, { maxAttempts: 2, now: now + 3 })).limited, false);
});

test('Azure Table limiter atomically reserves at most the configured concurrent attempt ceiling', async () => {
  const participantCount = 12;
  const tableClient = createBurstTableClient(participantCount);
  const limiter = new AzureTablePasscodeRateLimiter(tableClient);
  const caller = 'b'.repeat(64);
  const now = Date.UTC(2026, 7, 15);

  const outcomes = await Promise.all(Array.from({ length: participantCount }, () => limiter.reserveAttempt(caller, {
    maxAttempts: 5,
    windowMs: 60_000,
    now,
  })));

  assert.equal(outcomes.filter((outcome) => !outcome.limited).length, 5);
  assert.equal(outcomes.filter((outcome) => outcome.limited).length, 7);
  assert.ok(outcomes.filter((outcome) => outcome.limited).every((outcome) => outcome.retryAfterSeconds > 0));
  assert.equal(tableClient.inspect('passcode-v1', caller).attempts, 5);
  assert.ok(tableClient.counts.createConflicts > 0 || tableClient.counts.updateConflicts > 0);
});

test('a stale successful reset cannot delete a newer reserved attempt', async () => {
  const limiter = new AzureTablePasscodeRateLimiter(createTableClient());
  const caller = 'c'.repeat(64);
  const now = Date.UTC(2026, 7, 15);
  const first = await limiter.reserveAttempt(caller, { maxAttempts: 2, windowMs: 60_000, now });
  const second = await limiter.reserveAttempt(caller, { maxAttempts: 2, windowMs: 60_000, now: now + 1 });

  await limiter.reset(caller, first.reservation);
  assert.equal((await limiter.check(caller, { maxAttempts: 2, now: now + 2 })).limited, true);

  await limiter.reset(caller, second.reservation);
  assert.equal((await limiter.check(caller, { maxAttempts: 2, now: now + 3 })).limited, false);
});

test('missing shared-rate-limit configuration fails closed', async () => {
  const limiter = createPasscodeRateLimiter({ connectionString: '' });
  await assert.rejects(() => limiter.check('a'.repeat(64), { maxAttempts: 1 }), PasscodeRateLimitUnavailableError);
});
