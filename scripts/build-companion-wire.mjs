import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const pbjs = require('protobufjs-cli/pbjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const provenance = JSON.parse(await readFile(path.join(root, 'vendor/wardriver-wire/provenance.json'), 'utf8'));
for (const [name, hash] of Object.entries(provenance.sha256)) {
  const bytes = await readFile(path.join(root, 'vendor/wardriver-wire', name));
  if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('Upstream wire schema bytes differ from the pinned provenance.');
}
const generated = await new Promise((resolve, reject) => pbjs.main(['-t', 'static-module', '-w', 'commonjs', '--force-long',
  '--no-create', '--no-verify', '--no-convert', '--no-delimited', '--no-comments', '--no-service', '--no-typeurl',
  path.join(root, 'vendor/wardriver-wire/device_sync.proto'), path.join(root, 'vendor/wardriver-wire/observations.proto')],
  (error, output) => error ? reject(error) : resolve(output)));
const output = path.join(root, 'api/_private/companion/vendor/wire.cjs');
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== generated) throw new Error('Regenerate companion wire using the pinned toolchain.');
} else {
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, generated);
}
