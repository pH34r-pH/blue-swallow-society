import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const apiRoot = path.resolve(new URL('../api/', import.meta.url).pathname);

function apiJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

test('Functions do not import browser modules or proxy Wardriver device-local bridges', () => {
  for (const file of apiJavaScriptFiles(apiRoot)) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /(?:from|require\()\s*['"][^'"]*app\/operator\//, file);
    assert.doesNotMatch(source, /BssLocalBridge|bss-local-bridge/i, file);
  }
});
