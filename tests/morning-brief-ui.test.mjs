import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const moduleUrl = new URL('../app/operator/morning-brief.mjs', import.meta.url);
const htmlUrl = new URL('../app/operator/morning-brief.html', import.meta.url);
const cssUrl = new URL('../app/operator/morning-brief.css', import.meta.url);
const configUrl = new URL('../app/staticwebapp.config.json', import.meta.url);
const source = readFileSync(moduleUrl, 'utf8');
const html = readFileSync(htmlUrl, 'utf8');
const css = readFileSync(cssUrl, 'utf8');
const config = readFileSync(configUrl, 'utf8');

test('morning brief operator surface is session-gated and does not put protected artifact URLs in anchors', () => {
  assert.match(html, /noindex, nofollow/);
  assert.match(source, /if \(!operatorSession\(\)\) \{\s*redirectToLogin\(\);/);
  assert.match(source, /headers: operatorHeaders\(\)/);
  assert.match(source, /fetchArtifact\(brief\.run_id, artifact\)/);
  assert.doesNotMatch(source, /link\.href\s*=\s*artifactHref/);
});

test('morning brief operator surface renders verified dossier page PNGs and retains source artifact retrieval', () => {
  assert.match(source, /artifact\.media_type === 'image\/png'/);
  assert.match(source, /const url = URL\.createObjectURL\(blob\)/);
  assert.match(source, /image\.src = url/);
  assert.match(source, /receivedHash && receivedHash !== artifact\.sha256/);
  assert.match(source, /downloadArtifact\(brief, artifact, download\)/);
});

test('morning brief operator surface selects archived runs from a dropdown and presents their rendered pages as a scroll-snap carousel', () => {
  assert.match(html, /<select id="briefRunSelect"/);
  assert.match(html, /aria-label="Select archived morning brief"/);
  assert.match(source, /function renderCarousel\(/);
  assert.match(source, /artifact\.media_type === 'image\/png'/);
  assert.match(css, /\.brief-carousel\b/);
  assert.match(css, /scroll-snap-type:\s*x mandatory/);
  assert.match(css, /\.brief-page\s*\{[^}]*flex:\s*0 0 min\(88vw, 100%\)/);
  assert.doesNotMatch(css, /scroll-padding-inline/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.brief-page\s*\{\s*flex-basis:\s*100%;\s*\}/);
  assert.match(config, /img-src[^;]*\bblob:/);
});
