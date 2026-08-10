import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APPROVED_AZURE_MTLS_SMOKE_HOST,
  parseAzureMtlsSmokeOrigin,
} from '../local-proof/azure-mtls-smoke-origin.mjs';

test('Azure smoke origin accepts only the exact approved mTLS endpoint', () => {
  const approved = parseAzureMtlsSmokeOrigin(
    `https://${APPROVED_AZURE_MTLS_SMOKE_HOST}:8443/`,
  );
  assert.equal(approved.href, `https://${APPROVED_AZURE_MTLS_SMOKE_HOST}:8443/`);

  for (const candidate of [
    'https://attacker.cloudapp.azure.com:8443/',
    'https://attacker.blueswallow.net:8443/',
    `https://${APPROVED_AZURE_MTLS_SMOKE_HOST}:8443/not-root`,
    `http://${APPROVED_AZURE_MTLS_SMOKE_HOST}:8443/`,
    `https://${APPROVED_AZURE_MTLS_SMOKE_HOST}:443/`,
  ]) {
    assert.throws(
      () => parseAzureMtlsSmokeOrigin(candidate),
      /exact approved public Azure mTLS origin/,
      candidate,
    );
  }
});
