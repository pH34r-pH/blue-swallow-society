import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const specsRoot = new URL('../../../specs/', import.meta.url);
const compactionMarker = '[trun' + 'cated]';

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) {
      files.push(...await markdownFiles(entryUrl));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryUrl);
    }
  }
  return files;
}

test('active Spec Kit authority artifacts contain no compaction truncation markers', async () => {
  const files = await markdownFiles(specsRoot);
  assert.ok(files.length > 0, 'expected active Spec Kit markdown artifacts');
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    assert.equal(content.includes(compactionMarker), false, fileURLToPath(file));
  }
});
