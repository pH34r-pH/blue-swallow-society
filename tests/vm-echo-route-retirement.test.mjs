import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const installer = readFileSync(new URL('../infra/scripts/install-cybermap-api.sh', import.meta.url), 'utf8');

function publicCaddyBlock() {
  const start = installer.indexOf('__BACKEND_FQDN__ {');
  assert.notEqual(start, -1, 'installer must define a public backend Caddy block');
  const endMatch = /\r?\n}\r?\n\r?\n__BACKEND_FQDN__:8443 \{/.exec(installer.slice(start));
  assert.ok(endMatch, 'installer must delimit public and mTLS Caddy blocks');
  const end = start + endMatch.index + endMatch[0].indexOf('}');
  return installer.slice(start, end + 1);
}

test('public Caddy forwards only documented Cybermap paths and rejects legacy echo', () => {
  assert.ok(repoRoot, 'file URL must resolve to a repository path');
  const block = publicCaddyBlock();

  assert.match(block, /@public_cybermap\s+path\s+/);
  for (const path of [
    '/healthz',
    '/readyz',
    '/api/v1/observations/batch',
    '/api/v1/cybermap/viewport',
    '/api/v1/cybermap/operator-signals',
    '/api/v1/cybermap/tiles/*',
    '/api/v1/cybermap/global-viewport',
    '/api/v1/paper/state',
    '/api/v1/morning-briefs',
    '/api/v1/morning-briefs/*',
  ]) {
    assert.ok(block.includes(path), `public Caddy allowlist must include ${path}`);
  }
  assert.match(block, /handle @public_cybermap\s*\{\s*reverse_proxy 127\.0\.0\.1:__CYBERMAP_API_PORT__\s*\}/);
  assert.match(block, /handle\s*\{\s*respond "not_found" 404\s*\}/);
  assert.match(block, /respond\s+"not_found"\s+404/);
  assert.doesNotMatch(block, /\/echo/);
});
