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

test('APK control obtains its short-lived Blob URL with the explicit operator header', () => {
  const main = readFileSync(new URL('../api/_private/operator/assets/main.js', import.meta.url), 'utf8');

  assert.match(main, /fetch\(link\.href, \{[\s\S]*buildOperatorHeaders\(\{ Accept: 'application\/vnd\.blue-swallow\.wardriver-download-url\+json' \}\)/);
  assert.match(main, /window\.location\.replace\(downloadUrl\)/);
  assert.doesNotMatch(main, /document\.cookie/);
  assert.doesNotMatch(main, /searchParams\.set\([^\n]*operator/i);
});
