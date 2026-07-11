import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => existsSync(new URL(path, root));

const specPath = 'specs/005-cybermap-geospatial-backend/spec.md';
const planPath = 'specs/005-cybermap-geospatial-backend/plan.md';
const tasksPath = 'specs/005-cybermap-geospatial-backend/tasks.md';

function assertIncludesAll(haystack, needles, label) {
  needles.forEach((needle) => assert.ok(haystack.includes(needle), `${label} should include ${needle}`));
}

test('Cybermap spec-kit docs exist and expose the required spec surfaces', () => {
  [specPath, planPath, tasksPath].forEach((path) => assert.ok(exists(path), `${path} should exist`));

  const spec = read(specPath);
  assertIncludesAll(spec, [
    '## User Scenarios & Testing *(mandatory)*',
    '## Functional Requirements *(mandatory)*',
    '## Key Entities *(include if feature involves data)*',
    '## API Surface',
    '## P0 Implementation Ledger',
    '## Task Graph',
    '## Success Criteria *(mandatory)*',
  ], 'Cybermap spec');
});

test('Cybermap spec and tasks include the full P0 ledger, including decimal and lettered slices', () => {
  const combined = `${read(specPath)}\n${read(tasksPath)}`;

  [
    'P0.00',
    'P0.01',
    'P0.02',
    'P0.03',
    'P0.04',
    'P0.045',
    'P0.05',
    'P0.055',
    'P0.06',
    'P0.07',
    'P0.08',
    'P0.09',
    'P0.10a',
    'P0.10b',
    'P0.10c',
    'P0.11',
    'P0.12',
    'P0.125',
    'P0.13',
    'P0.14',
    'P0.15',
    'P0.16',
    'P0.17',
  ].forEach((slice) => assert.ok(combined.includes(slice), `${slice} should be documented`));

  [
    't_acb2d921',
    't_32d37829',
    't_1c25043d',
    't_4284c399',
    't_c92269bd',
    't_943a17b2',
    't_bf5ff92d',
    't_9bc9477c',
    't_46e22456',
  ].forEach((taskId) => assert.ok(combined.includes(taskId), `${taskId} should be documented`));
});

test('Cybermap docs preserve current-state boundary instead of presenting unmerged work as deployed', () => {
  const combined = `${read(specPath)}\n${read(planPath)}\n${read(tasksPath)}\n${read('docs/cybermap-geospatial-backend.md')}`;

  assert.match(combined, /Main\/deployed baseline/i);
  assert.match(combined, /Final integration candidate/i);
  assert.match(combined, /review-approved implementation branches/i);
  assert.match(combined, /not all review-approved slices or final-review remediation branches are present/i);
  assert.match(combined, /P0\.14.*done/is);
  assert.match(combined, /P0\.15.*pending final merge/is);
  assert.match(combined, /P0\.16.*restored/is);
  assert.match(combined, /P0\.17.*no-go/is);
});

test('Repo docs link to the Cybermap spec-kit surface', () => {
  const specDir = 'specs/005-cybermap-geospatial-backend';
  const docs = {
    readme: read('README.md'),
    architecture: read('docs/architecture.md'),
    cybermap: read('docs/cybermap-geospatial-backend.md'),
    azure: read('docs/azure-resources.md'),
    vmApi: read('docs/vm-api.md'),
  };

  Object.entries(docs).forEach(([name, content]) => {
    assert.ok(content.includes(specDir), `${name} should link ${specDir}`);
  });
});

test('Cybermap doctrine keeps source-class gates, no-demo runtime, and no raw PII defaults visible', () => {
  const combined = `${read(specPath)}\n${read(tasksPath)}\n${read('docs/cybermap-geospatial-backend.md')}`;

  assertIncludesAll(combined, [
    'green_public',
    'green_owned',
    'green_authorized',
    'grey_enrichment',
    'orange_exposure',
    'red_restricted',
    'No demo-runtime rule',
    'Raw frames and raw PII MUST NOT be retained or published by default',
    'local/owned observation or explicit authorized scope',
  ], 'Cybermap source/privacy doctrine');
});
