import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const main = readFileSync(new URL('infra/main.bicep', root), 'utf8');
const workflow = readFileSync(new URL('.github/workflows/deploy-static-web-app.yml', root), 'utf8');
const moduleUrl = new URL('infra/modules/wardriver-release-storage.bicep', root);

test('Bicep provisions a dedicated private, recoverable Wardriver release account', () => {
  assert.equal(existsSync(moduleUrl), true);
  const storage = readFileSync(moduleUrl, 'utf8');
  assert.match(main, /wardriver-release-storage/);
  assert.match(storage, /Microsoft\.Storage\/storageAccounts/);
  assert.match(storage, /allowBlobPublicAccess:\s*false/);
  assert.match(storage, /minimumTlsVersion:\s*'TLS1_2'/);
  assert.match(storage, /isVersioningEnabled:\s*true/);
  assert.match(storage, /deleteRetentionPolicy/);
  assert.match(storage, /publicAccess:\s*'None'/);
});

test('deployment wires the release-only connection string into SWA without logging it', () => {
  assert.match(workflow, /Microsoft\.Storage/);
  assert.match(workflow, /BSS_WARDRIVER_RELEASE_STORAGE_CONNECTION_STRING/);
  assert.match(workflow, /BSS_WARDRIVER_RELEASE_CONTAINER/);
  assert.match(workflow, /BSS_WARDRIVER_RELEASE_MANIFEST_BLOB/);
  assert.doesNotMatch(workflow, /echo\s+\$?\{?storage_connection_string/i);
});
