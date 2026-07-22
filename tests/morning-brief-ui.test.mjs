import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const moduleUrl = new URL('../app/operator/morning-brief.mjs', import.meta.url);
const htmlUrl = new URL('../app/operator/morning-brief.html', import.meta.url);
const operatorStylesUrl = new URL('../app/operator/styles.css', import.meta.url);
const privateShellUrl = new URL('../api/_private/operator/shell.html', import.meta.url);
const consoleMainUrl = new URL('../app/operator/main.js', import.meta.url);
const configUrl = new URL('../app/staticwebapp.config.json', import.meta.url);
const source = readFileSync(moduleUrl, 'utf8');
const html = readFileSync(htmlUrl, 'utf8');
const operatorStyles = readFileSync(operatorStylesUrl, 'utf8');
const privateShell = readFileSync(privateShellUrl, 'utf8');
const consoleMain = readFileSync(consoleMainUrl, 'utf8');
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
  assert.match(privateShell, /<select id="briefRunSelect"/);
  assert.match(privateShell, /aria-label="Select archived morning brief"/);
  assert.match(source, /function renderCarousel\(/);
  assert.match(source, /artifact\.media_type === 'image\/png'/);
  assert.match(operatorStyles, /#morning-brief-tab\s+\.brief-carousel\b/);
  assert.match(operatorStyles, /scroll-snap-type:\s*x mandatory/);
  assert.match(operatorStyles, /#morning-brief-tab\s+\.brief-page\s*\{[^}]*flex:\s*0 0 min\(88vw, 100%\)/);
  assert.doesNotMatch(operatorStyles, /scroll-padding-inline/);
  assert.match(operatorStyles, /@media \(max-width:\s*760px\)[\s\S]*?#morning-brief-tab\s+\.brief-page\s*\{\s*flex-basis:\s*100%;\s*\}/);
  assert.match(config, /img-src[^;]*\bblob:/);
});

test('morning dossier is a protected operator-console tab and returns to that console', () => {
  assert.match(html, /id="operatorLoader"/);
  assert.match(html, /\/operator\/loader\.js/);
  assert.doesNotMatch(html, /brief-shell|brief-header|brief-back/);
  assert.match(privateShell, /data-tab="morning-brief"/);
  assert.match(privateShell, /id="morning-brief-tab"/);
  assert.match(privateShell, /id="briefReturnToConsole"/);
  assert.doesNotMatch(privateShell, /brief-archive-link/);
  assert.match(source, /export function initMorningBrief\(\)/);
  assert.match(consoleMain, /function initMorningBriefTab\(\)/);
  assert.match(consoleMain, /function returnToOperatorConsole\(\)/);
  assert.match(consoleMain, /history\.replaceState\(null, '', '\/operator'\)/);
  assert.match(consoleMain, /return window\.location\.pathname === '\/operator\/morning-brief\.html' \? 'morning-brief' : 'landing'/);
  assert.match(consoleMain, /if \(nextTabKey === 'morning-brief'\) \{\s*initMorningBriefTab\(\);/);
  assert.match(operatorStyles, /#morning-brief-tab\s*\{/);
  assert.doesNotMatch(operatorStyles, /--brief-/);
  assert.doesNotMatch(operatorStyles, /brief-archive-link/);
});

test('morning dossier tab and panel preserve the console tab-order contract', () => {
  const tabOrder = [...privateShell.matchAll(/data-tab="([^"]+)"/g)].map((match) => match[1]);
  const panelOrder = [...privateShell.matchAll(/id="([^"]+)-tab" class="tab-content(?: [^"]*)?"/g)].map((match) => match[1]);
  assert.deepEqual(panelOrder, tabOrder);
});
