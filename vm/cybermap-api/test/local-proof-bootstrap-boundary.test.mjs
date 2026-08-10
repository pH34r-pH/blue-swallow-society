import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const testDirectory = dirname(fileURLToPath(import.meta.url));
const bootstrapFile = resolve(testDirectory, '../local-proof/bootstrap-local-proof-env.py');

test('bootstrap rejects a Windows junction in the fixed local-proof path before credential access', {
  skip: process.platform !== 'win32',
}, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'bss-bootstrap-junction-'));
  const localAppData = join(temporaryRoot, 'local-app-data');
  const credentialRoot = join(localAppData, 'BlueSwallow', 'credentials');
  const junctionTarget = join(temporaryRoot, 'outside-local-proof-root');
  const localProofDirectory = join(credentialRoot, 'local-mtls-lab');
  const outputFile = join(localProofDirectory, 'local-proof.env');

  try {
    await mkdir(credentialRoot, { recursive: true });
    await mkdir(junctionTarget, { recursive: true });
    await symlink(junctionTarget, localProofDirectory, 'junction');

    await assert.rejects(
      execFile('python', [bootstrapFile, '--out', outputFile], {
        env: { ...process.env, LOCALAPPDATA: localAppData },
        windowsHide: true,
      }),
      (error) => /reparse/i.test(`${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message ?? ''}`),
      'bootstrap must reject the junction as a reparse-point boundary violation',
    );
  } finally {
    await rm(localProofDirectory, { force: true, recursive: true }).catch(() => {});
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});
