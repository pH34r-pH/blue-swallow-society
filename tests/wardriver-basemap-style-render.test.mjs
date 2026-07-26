import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const renderer = new URL('scripts/render-wardriver-basemap-style.py', root);
const template = new URL('basemap/style.template.json', root);

test('style renderer accepts the public Azure static-website tile endpoint', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wardriver-style-'));
  const output = join(directory, 'style.json');
  const tileBaseUrl = 'https://bsswdv6gc3cqokbdbw.z5.web.core.windows.net/wardriver-basemap/v1/generations/test/tiles';

  try {
    const result = spawnSync('python3', [fileURLToPath(renderer), '--template', fileURLToPath(template), '--tile-base-url', tileBaseUrl, '--output', output], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const style = JSON.parse(readFileSync(output, 'utf8'));
    assert.deepEqual(style.sources['bss-basemap'].tiles, [`${tileBaseUrl}/{z}/{x}/{y}.pbf`]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
