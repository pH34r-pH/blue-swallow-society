import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const installer = new URL('../../../infra/scripts/install-cybermap-api.sh', import.meta.url);

test('installer creates an isolated mTLS listener that overwrites client-controlled proxy headers', async () => {
  const source = await readFile(installer, 'utf8');
  assert.match(source, /__BACKEND_FQDN__:8443/);
  assert.match(source, /require_and_verify/);
  assert.match(source, /wardriver-mtls-trust\.pem/);
  assert.match(source, /header_up -X-Blue-Swallow-Mtls-Proxy-Secret/);
  assert.match(source, /header_up X-Blue-Swallow-Mtls-Proxy-Secret/);
  assert.match(source, /header_up X-Blue-Swallow-Mtls-Client-Fingerprint \{tls_client_fingerprint\}/);
  assert.match(source, /handle \@wardriver_mtls/);
  assert.match(source, /respond "not_found" 404/);
});
