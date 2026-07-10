const DEFAULT_POLL_INTERVAL_MS = 60_000;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultLogger(entry) {
  process.stdout.write(`${JSON.stringify(entry)}
`);
}

export function createCybermapWorker(options = {}) {
  const logger = options.logger || defaultLogger;
  const now = options.now || (() => new Date());
  const pollIntervalMs = parsePositiveInteger(
    options.pollIntervalMs ?? process.env.CYBERMAP_WORKER_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
  );

  let timer = null;
  let stopping = false;

  async function tick(reason = 'interval') {
    logger({
      service: 'cybermap-worker',
      structured: true,
      event: 'tick',
      reason,
      time: now().toISOString(),
      pollIntervalMs,
      jobs: [
        { name: 'greenfeed-polling', status: 'pending-db-task' },
        { name: 'cybermap-cell-materialization', status: 'pending-db-task' },
      ],
    });
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
    tick('start').catch((error) => logger({ service: 'cybermap-worker', structured: true, level: 'error', error: error.message }));
    timer = setInterval(() => {
      tick().catch((error) => logger({ service: 'cybermap-worker', structured: true, level: 'error', error: error.message }));
    }, pollIntervalMs);
    return { stop, tick };
  }

  return { start, stop, tick, get pollIntervalMs() { return pollIntervalMs; } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = createCybermapWorker();
  worker.start();
  process.on('SIGINT', () => worker.stop('SIGINT'));
  process.on('SIGTERM', () => worker.stop('SIGTERM'));
}
