import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const load = (path) => readFile(new URL(path, root), 'utf8');

const [bootstrap, credential, verifier, spec] = await Promise.all([
  load('local-proof/bootstrap-local-proof-env.py'),
  load('local-proof/protected-desktop-credential.mjs'),
  load('local-proof/verify-local-proof.mjs'),
  readFile(new URL('../../../specs/020-wardriver-desktop-mtls-proof/spec.md', import.meta.url), 'utf8'),
]);

test('desktop credential ACL grants direct access only to the current Windows user', () => {
  assert.match(spec, /only the operator's current Windows account/i);
  assert.doesNotMatch(bootstrap, /S-1-5-18/);
  assert.doesNotMatch(bootstrap, /S-1-5-32-544/);
  assert.doesNotMatch(credential, /nt authority\\\\system/i);
  assert.doesNotMatch(credential, /builtin\\\\administrators/i);
  assert.doesNotMatch(verifier, /systemSeen|administratorsSeen/);
  assert.doesNotMatch(verifier, /nt authority\\\\system|builtin\\\\administrators/i);
  assert.match(credential, /ownerSeen/);
});
