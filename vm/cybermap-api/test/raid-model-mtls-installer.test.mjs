import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const installer = resolve(import.meta.dirname, '../../../infra/scripts/install-cybermap-api.sh');

test('mTLS Caddy listener allows the RaID model family only with its contract methods', async () => {
  const source = await readFile(installer, 'utf8');
  const reads = source.match(/@wardriver_mtls_read \{\n\s*method GET\n\s*path ([^\n]+)/);
  const writes = source.match(/@wardriver_mtls_write \{\n\s*method POST\n\s*path ([^\n]+)/);
  assert.ok(reads, 'mTLS GET route matcher must exist');
  assert.ok(writes, 'mTLS POST route matcher must exist');
  assert.match(reads[1], /\/api\/v1\/raid\/models\/catalog/);
  assert.match(reads[1], /\/api\/v1\/raid\/models\/releases\/\*\/artifact/);
  assert.doesNotMatch(reads[1], /feedback/);
  assert.match(writes[1], /\/api\/v1\/raid\/models\/releases\/\*\/feedback/);
  assert.match(writes[1], /\/api\/v1\/cybermap\/viewport/);
  assert.match(writes[1], /\/api\/v1\/observations\/batch/);
  assert.doesNotMatch(source, /@wardriver_mtls path/);
  assert.doesNotMatch(reads[1], /\/api\/v1\/raid\/models\/\*/);
});
