import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function assertIncludesAll(text, needles, label) {
  for (const needle of needles) {
    assert.ok(text.includes(needle), `${label} should include ${needle}`);
  }
}

test('Cybermap ops docs cover low-cost B1MS operations without hiding failure modes', () => {
  const azureDoc = read('docs/azure-resources.md');
  const vmDoc = read('docs/vm-api.md');
  const combined = `${azureDoc}\n${vmDoc}`;

  assertIncludesAll(combined, [
    'max_client_conn = 50',
    'default_pool_size = 5',
    'reserve_pool_size = 2',
    'CYBERMAP_DB_POOL_MAX=5',
    'server connection cap suitable for B1MS',
    '7-day point-in-time restore',
    'nightly logical export to Blob',
    'cybermap-logical-backup.sh',
    'active_connections,cpu_percent,memory_percent,storage_percent',
    'event=ingest_rejected',
    'offline/degraded',
    'VM auto-shutdown is acceptable for dev',
    'Azure PostgreSQL storage can grow but not shrink',
    'Partition or roll monthly observation tables',
    'Cost Management → Budgets',
  ], 'ops docs');

  assert.match(combined, /curl -fsS https:\/\/<vm-public-ip>\/readyz --insecure/);
  assert.match(combined, /az postgres flexible-server show[\s\S]+blue-swallow-pg/);
  assert.match(combined, /systemctl show cybermap-worker -p NRestarts/);
});

test('Optional logical backup script avoids printing secrets and uploads to Blob', () => {
  const script = read('scripts/cybermap-logical-backup.sh');

  assertIncludesAll(script, [
    'set -euo pipefail',
    'CYBERMAP_BACKUP_DATABASE_URL',
    'pg_dump',
    '--dbname="$CYBERMAP_BACKUP_DATABASE_URL"',
    'az storage blob upload',
    '--only-show-errors',
  ], 'logical backup script');

  assert.doesNotMatch(script, /set -x/);
  assert.doesNotMatch(script, /echo\s+.*CYBERMAP_BACKUP_DATABASE_URL/);
  assert.doesNotMatch(script, /echo\s+.*PGPASSWORD/);
  assert.doesNotMatch(script, /--connection-string\s+"?\$/);
});
