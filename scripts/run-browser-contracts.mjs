import { spawnSync } from 'node:child_process';

const browserTests = [
  'tests/root-login-handoff-browser.test.mjs',
  'tests/tzeentch-browser.test.mjs',
  'tests/morning-brief-browser.test.mjs',
];
const result = spawnSync(process.execPath, ['--test', ...browserTests], {
  env: { ...process.env, BSS_REQUIRE_OBSCURA: '1' },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error || result.status !== 0) process.exitCode = result.status || 1;
