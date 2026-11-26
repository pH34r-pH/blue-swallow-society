// Runs inside the disposable Functions container. Only fixture row counts leave it.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const { TableClient } = createRequire(join(process.cwd(), 'package.json'))('@azure/data-tables');
const table = (name) => TableClient.fromConnectionString('UseDevelopmentStorage=true', name, {
  retryOptions: { maxRetries: 0 },
});

async function main(command) {
  if (command === 'prepare') {
    for (const name of ['viewerSessions', 'passcodeFailures']) {
      try {
        await table(name).createTable({ abortSignal: AbortSignal.timeout(2_000) });
      } catch (error) {
        if (error.statusCode !== 409) throw error;
      }
    }
    return;
  }
  const sessions = table('viewerSessions');
  const rows = await Array.fromAsync(sessions.listEntities());
  if (command === 'count') {
    console.log(rows.length);
    return;
  }
  assert.equal(command, 'expire');
  assert.equal(rows.length, 1, 'expire the sole remaining fixture session');
  const { partitionKey, rowKey } = rows[0];
  await sessions.updateEntity({ partitionKey, rowKey, idleExpiresAt: '2000-01-01T00:00:00Z' }, 'Merge');
}

main(process.argv[2]).catch((error) => {
  console.error(`Disposable table operation failed (${error.statusCode || error.name})`);
  process.exitCode = 1;
});
