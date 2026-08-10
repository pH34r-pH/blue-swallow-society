import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const load = (file) => readFile(new URL(file, root), 'utf8');

test('all desktop P12 consumers require exactly one passwordless client certificate and private key', async () => {
  const [bootstrap, credential, verifier] = await Promise.all([
    load('local-proof/bootstrap-local-proof-env.py'),
    load('local-proof/protected-desktop-credential.mjs'),
    load('local-proof/verify-local-proof.mjs'),
  ]);

  for (const source of [bootstrap, credential]) {
    assert.match(source, /clcerts/);
    assert.match(source, /nocerts/);
    assert.match(source, /exactly one.*client certificate/i);
    assert.match(source, /exactly one.*private key/i);
  }
  assert.match(verifier, /assertDesktopP12MatchesPublicCertificate/);
});