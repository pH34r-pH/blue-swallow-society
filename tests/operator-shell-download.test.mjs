import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../api/_private/operator/shell.html', import.meta.url), 'utf8');

test('operator shell hydrates Wardriver release facts from authenticated metadata', () => {
  assert.match(shell, /data-operator-release="version"/);
  assert.match(shell, /data-operator-release="sha256"/);
  assert.match(shell, /operator-downloads\/wardriver\/metadata/);
  assert.doesNotMatch(shell, /2\.109-bss\.1|blue-swallow-wardriver-2\.109-bss\.1-debug\.apk|debug sideload/);
});
