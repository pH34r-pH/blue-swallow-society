import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const moduleUrl = new URL('../app/operator/morning-brief.mjs', import.meta.url);
const htmlUrl = new URL('../app/operator/morning-brief.html', import.meta.url);
const source = readFileSync(moduleUrl, 'utf8');
const html = readFileSync(htmlUrl, 'utf8');

test('morning brief operator surface is session-gated and does not put protected artifact URLs in anchors', () => {
  assert.match(html, /noindex, nofollow/);
  assert.match(source, /if \(!operatorSession\(\)\) \{\s*redirectToLogin\(\);/);
  assert.match(source, /headers: operatorHeaders\(\)/);
  assert.match(source, /fetchArtifact\(brief\.run_id, artifact\)/);
  assert.doesNotMatch(source, /link\.href\s*=\s*artifactHref/);
});

test('morning brief operator surface renders verified dossier page PNGs and retains source artifact retrieval', () => {
  assert.match(source, /artifact\.media_type === 'image\/png'/);
  assert.match(source, /image\.src = URL\.createObjectURL\(blob\)/);
  assert.match(source, /receivedHash && receivedHash !== artifact\.sha256/);
  assert.match(source, /downloadArtifact\(brief, artifact, download\)/);
});
