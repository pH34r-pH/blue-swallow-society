import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { healthState, issueDisposition, recentIssues, relativeTime } from '../api/_private/operator/assets/fleet-state.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/fleet-snapshot.json', import.meta.url), 'utf8'));
const now = Date.parse(fixture.generatedAt);
const minute = 60_000;
const day = 24 * 60 * minute;
const iso = (time) => new Date(time).toISOString();
const observedHealth = (overrides = {}) => ({
  health: { state: 'healthy', observedAt: iso(now - minute), freshUntil: iso(now + minute), metrics: [], ...overrides },
});

test('health requires an observed, valid freshness interval rather than a current fetch time', () => {
  for (const node of [
    {},
    { health: null },
    observedHealth({ observedAt: null }),
    observedHealth({ observedAt: 'invalid' }),
    observedHealth({ observedAt: iso(now + 1) }),
    observedHealth({ freshUntil: null }),
    observedHealth({ freshUntil: 'invalid' }),
    observedHealth({ freshUntil: iso(now - 2 * minute) }),
    observedHealth({ state: 'invented' }),
  ]) assert.equal(healthState(node, now), 'unknown');
  assert.equal(healthState(observedHealth(), NaN), 'unknown');

  const oldNode = fixture.nodes.find((node) => node.id === 'hardware-edge');
  const refreshed = { ...fixture, generatedAt: iso(now + minute) };
  assert.equal(healthState(oldNode, now), 'stale');
  assert.equal(healthState(refreshed.nodes.find((node) => node.id === oldNode.id), now + minute), 'stale');
  assert.equal(oldNode.health.observedAt, '2026-11-06T23:40:00Z');
});

test('health preserves operational states while fresh and becomes stale at the exact deadline', () => {
  for (const state of ['healthy', 'warning', 'critical', 'stopped', 'unknown']) {
    const node = observedHealth({ state });
    assert.equal(healthState(node, now), state);
    assert.equal(healthState(node, now + minute - 1), state);
    assert.equal(healthState(node, now + minute), 'stale');
  }
  assert.equal(healthState(fixture.nodes.find((node) => node.id === 'azure-app'), now), 'stopped');
  assert.equal(healthState(fixture.nodes.find((node) => node.id === 'azure-storage'), now), 'unknown');
});

test('only GitHub completed closures count as completed work', () => {
  assert.equal(issueDisposition({ state: 'open', stateReason: null }), 'open');
  assert.equal(issueDisposition({ state: 'open', stateReason: 'completed' }), 'open');
  assert.equal(issueDisposition({ state: 'closed', stateReason: 'completed' }), 'completed');
  assert.equal(issueDisposition({ state: 'closed', stateReason: 'not_planned' }), 'closed');
  assert.equal(issueDisposition({ state: 'closed', stateReason: null }), 'closed');
});

test('recent work filters by repository and update window without conflating other closures', () => {
  assert.equal(recentIssues(fixture, { now }).length, 10);
  assert.deepEqual(recentIssues(fixture, { repoId: 'repo-webapp', now }).map((issue) => issue.id),
    ['webapp-101', 'webapp-102', 'webapp-103']);
  assert.deepEqual(recentIssues(fixture, { state: 'completed', now }).map((issue) => issue.id),
    ['webapp-102', 'ingest-202']);
  assert.deepEqual(recentIssues(fixture, { state: 'closed', now }).map((issue) => issue.id),
    ['webapp-103', 'pipeline-302', 'compiler-402']);
  assert.equal(recentIssues(fixture, { state: 'open', now }).length, 5);
  assert.equal(recentIssues(fixture, { days: 'all', now }).length, 12);
  assert.equal(recentIssues(fixture, { days: 30, now }).length, 11);
  assert.deepEqual(recentIssues(fixture, { repoId: 'missing-repo', now }), []);
});

test('recency boundaries include the cutoff, exclude invalid or future updates, and sort ties by ID', () => {
  const issue = (id, updatedAt) => ({ id, repoId: 'repo-webapp', state: 'open', stateReason: null, updatedAt });
  const rows = [
    issue('b', iso(now - minute)),
    issue('cutoff', iso(now - 7 * day)),
    issue('future', iso(now + 1)),
    issue('a', iso(now - minute)),
    issue('too-old', iso(now - 7 * day - 1)),
    issue('invalid', 'not a timestamp'),
    issue('missing', null),
    issue('current', iso(now)),
  ];
  const before = structuredClone(rows);
  const snapshot = { issues: rows };
  assert.deepEqual(recentIssues(snapshot, { now }).map((row) => row.id), ['current', 'a', 'b', 'cutoff']);
  assert.deepEqual(recentIssues({ issues: [...rows].reverse() }, { now }).map((row) => row.id), ['current', 'a', 'b', 'cutoff']);
  assert.deepEqual(recentIssues(snapshot, { days: 'all', now }).map((row) => row.id), ['current', 'a', 'b', 'cutoff', 'too-old']);
  assert.deepEqual(rows, before);
  assert.deepEqual(recentIssues(snapshot, { days: 0, now }).map((row) => row.id), ['current']);
});

test('a new snapshot timestamp does not make old issues recent', () => {
  const later = now + 8 * day;
  assert.deepEqual(recentIssues({ ...fixture, generatedAt: iso(later) }, { now: later }), []);
  assert.equal(recentIssues({ ...fixture, generatedAt: iso(later) }, { now: later, days: 'all' }).length, 12);
  assert.deepEqual(recentIssues(null, { now }), []);
  assert.deepEqual(recentIssues(fixture, { days: -1, now }), []);
  assert.deepEqual(recentIssues(fixture, { days: 'invalid', now }), []);
  assert.deepEqual(recentIssues(fixture, { state: 'invalid', now }), []);
  assert.deepEqual(recentIssues(fixture, { now: NaN }), []);
});

test('relative evidence age is compact, deterministic, and never labels future data current', () => {
  for (const [age, expected] of [
    [0, '<1m'],
    [minute - 1, '<1m'],
    [minute, '1m'],
    [59 * minute, '59m'],
    [60 * minute, '1h'],
    [2 * 60 * minute, '2h'],
    [day, '1d'],
    [7 * day, '7d'],
  ]) assert.equal(relativeTime(iso(now - age), now), expected);
  for (const value of [null, undefined, '', 'invalid', iso(now + 1)]) assert.equal(relativeTime(value, now), '—');
  assert.equal(relativeTime(iso(now), NaN), '—');
});

test('the review fixture is explicitly synthetic and has complete graph references', () => {
  assert.equal(fixture.schemaVersion, 'bss.fleet.v1');
  assert.equal(fixture.generatedAt, '2026-11-07T00:00:00Z');
  assert.equal(fixture.nodes.length, 11);
  assert.equal(fixture.edges.length, 13);
  assert.equal(fixture.issues.length, 12);
  assert.ok(fixture.sources.every((source) => source.label.startsWith('Synthetic test fixture')));
  const nodes = new Map(fixture.nodes.map((node) => [node.id, node]));
  assert.equal(nodes.size, fixture.nodes.length);
  assert.equal(new Set(fixture.edges.map((edge) => edge.id)).size, fixture.edges.length);
  assert.equal(new Set(fixture.issues.map((issue) => issue.id)).size, fixture.issues.length);
  for (const edge of fixture.edges) {
    assert.ok(nodes.has(edge.source) && nodes.has(edge.target));
    assert.ok(['ingest', 'build', 'deploy'].includes(edge.kind));
    if (edge.evidenceUrl) assert.match(edge.evidenceUrl, /^https:\/\/github\.com\/example\/project\//);
  }
  for (const issue of fixture.issues) {
    assert.equal(nodes.get(issue.repoId)?.kind, 'repo');
    assert.equal(issue.url, `https://github.com/example/project/issues/${issue.number}`);
  }
});
