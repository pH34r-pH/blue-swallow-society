import { createDefaultPool, loadDatabaseConfig } from '../cybermap-api/db.mjs';
import { materializeAffectedCybermapCells } from './cell-materialization.mjs';

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_MATERIALIZATION_LOOKBACK_MS = 5 * 60_000;
const DEFAULT_MATERIALIZATION_LIMIT = 500;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultLogger(entry) {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function minusMs(date, ms) {
  return new Date(date.getTime() - ms).toISOString();
}

export function createCybermapWorker(options = {}) {
  const logger = options.logger || defaultLogger;
  const env = options.env || process.env;
  const now = options.now || (() => new Date());
  const poolFactory = options.dbPoolFactory || createDefaultPool;
  const materializeCells = options.materializeCells || materializeAffectedCybermapCells;
  const pollIntervalMs = parsePositiveInteger(
    options.pollIntervalMs ?? env.CYBERMAP_WORKER_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
  );
  const materializationLookbackMs = parsePositiveInteger(
    options.materializationLookbackMs ?? env.CYBERMAP_CELL_MATERIALIZATION_LOOKBACK_MS,
    DEFAULT_MATERIALIZATION_LOOKBACK_MS,
  );
  const materializationLimit = parsePositiveInteger(
    options.materializationLimit ?? env.CYBERMAP_CELL_MATERIALIZATION_LIMIT,
    DEFAULT_MATERIALIZATION_LIMIT,
  );

  let timer = null;
  let stopping = false;
  let activeTick = null;
  let lastMaterializedAt = isoDate(options.initialMaterializationSince);
  let pendingMaterializationSince = null;
  let pendingMaterializationBefore = null;
  let pendingAffectedCursor = null;

  async function withDatabasePool(fn) {
    if (options.pool) return fn(options.pool, { configured: true, owned: false });
    const config = loadDatabaseConfig(env);
    if (!config.ok) {
      return {
        skipped: true,
        reason: config.status?.status || 'db_not_configured',
        missing: config.missing || [],
        invalid: config.invalid || [],
      };
    }
    const pool = await poolFactory(config.pool);
    try {
      return await fn(pool, { configured: true, owned: true, status: config.status });
    } finally {
      if (pool?.end) await pool.end();
    }
  }

  async function runCellMaterialization(reason, tickStartedAt) {
    const since = pendingMaterializationSince || lastMaterializedAt || minusMs(tickStartedAt, materializationLookbackMs);
    const before = pendingMaterializationBefore || tickStartedAt.toISOString();
    const after = pendingAffectedCursor;
    const result = await withDatabasePool(async (pool) => {
      const materialized = await materializeCells(pool, {
        since,
        before,
        after,
        now: tickStartedAt,
        limit: materializationLimit,
      });
      if (materialized.limitReached) {
        pendingMaterializationSince = since;
        pendingMaterializationBefore = before;
        pendingAffectedCursor = materialized.nextCursor || null;
      } else {
        pendingMaterializationSince = null;
        pendingMaterializationBefore = null;
        pendingAffectedCursor = null;
        lastMaterializedAt = minusMs(new Date(before), materializationLookbackMs);
      }
      return materialized;
    });

    if (result?.skipped) {
      logger({
        service: 'cybermap-worker',
        structured: true,
        event: 'job_skipped',
        job: 'cybermap-cell-materialization',
        reason: result.reason,
        missing: result.missing,
        invalid: result.invalid,
        time: now().toISOString(),
      });
      return result;
    }

    logger({
      service: 'cybermap-worker',
      structured: true,
      event: 'job_complete',
      job: 'cybermap-cell-materialization',
      reason,
      since,
      before,
      after,
      affectedCellCount: result.affectedCellCount,
      upsertedCellCount: result.upsertedCellCount,
      limitReached: result.limitReached,
      nextCursor: result.nextCursor,
      time: now().toISOString(),
    });
    return result;
  }

  async function tick(reason = 'interval') {
    if (activeTick) {
      logger({
        service: 'cybermap-worker',
        structured: true,
        event: 'tick_skipped',
        reason: 'tick_already_running',
        time: now().toISOString(),
      });
      return { skipped: true, reason: 'tick_already_running' };
    }

    const tickStartedAt = now();
    logger({
      service: 'cybermap-worker',
      structured: true,
      event: 'tick',
      reason,
      time: tickStartedAt.toISOString(),
      pollIntervalMs,
      jobs: [
        { name: 'greenfeed-polling', status: 'pending-db-task' },
        { name: 'cybermap-cell-materialization', status: 'enabled', lookbackMs: materializationLookbackMs },
      ],
    });

    activeTick = runCellMaterialization(reason, tickStartedAt);
    try {
      return await activeTick;
    } finally {
      activeTick = null;
    }
  }

  function stop(signal = 'stop') {
    if (stopping) return;
    stopping = true;
    if (timer) clearInterval(timer);
    logger({
      service: 'cybermap-worker',
      structured: true,
      event: 'shutdown',
      signal,
      time: now().toISOString(),
    });
  }

  function start() {
    logger({
      service: 'cybermap-worker',
      structured: true,
      event: 'start',
      time: now().toISOString(),
      pollIntervalMs,
    });
    tick('start').catch((error) => logger({
      service: 'cybermap-worker',
      structured: true,
      level: 'error',
      event: 'tick_failed',
      error: error.message,
    }));
    timer = setInterval(() => {
      tick().catch((error) => logger({
        service: 'cybermap-worker',
        structured: true,
        level: 'error',
        event: 'tick_failed',
        error: error.message,
      }));
    }, pollIntervalMs);
    return { stop, tick };
  }

  return {
    start,
    stop,
    tick,
    get pollIntervalMs() { return pollIntervalMs; },
    get lastMaterializedAt() { return lastMaterializedAt; },
    get pendingAffectedCursor() { return pendingAffectedCursor; },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = createCybermapWorker();
  worker.start();
  process.on('SIGINT', () => worker.stop('SIGINT'));
  process.on('SIGTERM', () => worker.stop('SIGTERM'));
}
