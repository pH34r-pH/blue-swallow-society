import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePythonLauncher } from './helpers/python-launcher.mjs';
import { requireObscura, resolveObscura } from './helpers/obscura.mjs';

test('Python launcher honors an explicit executable override', () => {
  const calls = [];
  const launcher = resolvePythonLauncher({
    env: { BSS_PYTHON: 'C:\\Tools\\Python\\python.exe' },
    platform: 'win32',
    probe(command, args) {
      calls.push({ command, args });
      return { ok: true };
    },
  });
  assert.deepEqual(launcher, { command: 'C:\\Tools\\Python\\python.exe', args: [] });
  assert.deepEqual(calls, [{ command: 'C:\\Tools\\Python\\python.exe', args: [] }]);
});

test('Python launcher uses py -3 first on Windows and python3 first on POSIX', () => {
  const windows = resolvePythonLauncher({
    env: {},
    platform: 'win32',
    probe(command, args) {
      return command === 'py' && args.join(' ') === '-3' ? { ok: true } : { ok: false };
    },
  });
  assert.deepEqual(windows, { command: 'py', args: ['-3'] });

  const posix = resolvePythonLauncher({
    env: {},
    platform: 'linux',
    probe(command) {
      return command === 'python3' ? { ok: true } : { ok: false };
    },
  });
  assert.deepEqual(posix, { command: 'python3', args: [] });
});

test('Obscura capability reports a named skip by default and fails when required', () => {
  const unavailable = () => ({ ok: false, detail: 'ENOENT' });
  assert.deepEqual(resolveObscura({ env: {}, probe: unavailable }), {
    available: false,
    command: 'obscura',
    detail: 'ENOENT',
  });

  let skipped = null;
  const optional = requireObscura({ skip(message) { skipped = message; } }, { env: {}, probe: unavailable });
  assert.equal(optional, null);
  assert.match(skipped, /not provisioned/i);

  assert.throws(
    () => requireObscura({ skip() {} }, { env: { BSS_REQUIRE_OBSCURA: '1' }, probe: unavailable }),
    /Obscura browser capability is not provisioned/i,
  );
});
