import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assertProtectedDirectory } from '../local-proof/protected-desktop-credential.mjs';

test('runtime protected credential access rejects a Windows junction as an explicit reparse-point boundary', {
  skip: process.platform !== 'win32',
}, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'bss-runtime-junction-'));
  const credentialRoot = join(temporaryRoot, 'credentials');
  const outside = join(temporaryRoot, 'outside');
  const junction = join(credentialRoot, 'local-mtls-lab');
  try {
    await mkdir(credentialRoot, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, junction, 'junction');

    await assert.rejects(
      assertProtectedDirectory(junction, credentialRoot, 'Protected local-proof directory'),
      /reparse point/i,
    );
  } finally {
    await rm(junction, { force: true, recursive: true }).catch(() => {});
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});