import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { assertRestrictedWindowsAcl } from '../local-proof/protected-desktop-credential.mjs';

const execFile = promisify(execFileCallback);

test('protected credential ACL rejects a direct SYSTEM grant', { skip: process.platform !== 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bss-owner-only-acl-'));
  const target = join(directory, 'credential.pfx');
  try {
    await writeFile(target, 'fixture');
    await execFile('icacls', [
      target,
      '/inheritance:r',
      '/grant:r', `${process.env.USERNAME}:(F)`,
      '/grant', 'NT AUTHORITY\\SYSTEM:(F)',
    ], { windowsHide: true });
    await assert.rejects(
      assertRestrictedWindowsAcl(target, false, true),
      /unapproved principal/i,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
