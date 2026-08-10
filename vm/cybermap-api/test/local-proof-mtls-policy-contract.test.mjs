import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const composeFile = new URL('../local-proof/compose.yaml', import.meta.url);
const mainFile = new URL('../src/main.mjs', import.meta.url);

test('local proof injects one exact desktop mTLS source and provenance policy into the API', async () => {
  const [compose, main] = await Promise.all([
    readFile(composeFile, 'utf8'),
    readFile(mainFile, 'utf8'),
  ]);

  for (const variable of [
    'BSS_MTLS_EXPECTED_DEVICE_ID',
    'BSS_MTLS_EXPECTED_SOURCE_KEY',
    'BSS_MTLS_EXPECTED_SOURCE_CLASS',
    'BSS_MTLS_EXPECTED_CREDENTIAL_SOURCE',
    'BSS_MTLS_EXPECTED_ENVIRONMENT',
    'BSS_MTLS_EXPECTED_SCOPES',
  ]) {
    assert.match(compose, new RegExp(variable), `local proof API must receive ${variable}`);
  }
  assert.match(main, /readMtlsCredentialPolicy/,
    'API startup must parse an all-or-nothing mTLS credential policy from its environment');
  assert.match(main, /mtlsCredentialPolicy/,
    'API startup must give the parsed mTLS credential policy to the Postgres store');
});
