'use strict';

const SCHEMA_VERSION = 'bss.fleet.v1';
const MAX_SNAPSHOT_BYTES = 512 * 1024;
const LIMITS = Object.freeze({ sources: 16, nodes: 80, edges: 200, issues: 240, metrics: 8 });

class FleetSnapshotUnavailableError extends Error {
  constructor() { super('fleet_snapshot_unavailable'); this.name = 'FleetSnapshotUnavailableError'; }
}

function reject() { throw new FleetSnapshotUnavailableError(); }
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject();
  return value;
}
function text(value, maximum, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value) || value !== value.trim()
    || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) reject();
  return value;
}
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)) reject();
  return value;
}
function choice(value, allowed) {
  if (!allowed.includes(value)) reject();
  return value;
}
function timestamp(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) reject();
  return value;
}
function array(value, maximum, normalize) {
  if (!Array.isArray(value) || value.length > maximum) reject();
  return Object.freeze(value.map(normalize));
}
function unique(values) {
  if (new Set(values.map((value) => value.id)).size !== values.length) reject();
  return values;
}
function optionalText(result, input, key, maximum) {
  if (input[key] !== undefined) result[key] = text(input[key], maximum);
}
function githubUrl(value) {
  text(value, 1024);
  let url;
  try { url = new URL(value); } catch { reject(); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port
    || url.username || url.password || url.search || url.hash
    || !/^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+(?:\/|$)/.test(url.pathname)) reject();
  return url;
}

function source(value) {
  object(value);
  const state = choice(value.state, ['ok', 'partial', 'unavailable']);
  const observedAt = timestamp(value.observedAt, true);
  if (state === 'ok' && observedAt === null) reject();
  return Object.freeze({ id: id(value.id), label: text(value.label, 80), state, observedAt });
}
function metric(value) {
  object(value);
  if (!Number.isFinite(value.value)) reject();
  const result = { label: text(value.label, 64), value: value.value, unit: text(value.unit, 24, true) };
  if (value.max !== undefined) {
    if (!Number.isFinite(value.max) || value.max <= 0) reject();
    result.max = value.max;
  }
  return Object.freeze(result);
}
function health(value) {
  if (value === undefined) return Object.freeze({ state: 'unknown', observedAt: null, freshUntil: null, metrics: Object.freeze([]) });
  object(value);
  const state = choice(value.state, ['healthy', 'warning', 'critical', 'stopped', 'unknown']);
  const observedAt = timestamp(value.observedAt, true);
  const freshUntil = timestamp(value.freshUntil, true);
  const metrics = array(value.metrics, LIMITS.metrics, metric);
  if ((observedAt === null) !== (freshUntil === null)
    || (observedAt === null && (state !== 'unknown' || metrics.length))
    || (observedAt !== null && Date.parse(freshUntil) < Date.parse(observedAt))) reject();
  return Object.freeze({ state, observedAt, freshUntil, metrics });
}
function node(value) {
  object(value);
  const result = {
    id: id(value.id), kind: choice(value.kind, ['repo', 'azure', 'hardware']),
    label: text(value.label, 96), health: health(value.health),
  };
  optionalText(result, value, 'subtitle', 160);
  optionalText(result, value, 'group', 64);
  return Object.freeze(result);
}
function edge(value, nodes) {
  object(value);
  const result = {
    id: id(value.id), source: id(value.source), target: id(value.target),
    kind: choice(value.kind, ['ingest', 'build', 'deploy']),
  };
  if (!nodes.has(result.source) || !nodes.has(result.target)) reject();
  optionalText(result, value, 'label', 96);
  if (value.evidenceUrl !== undefined) result.evidenceUrl = githubUrl(value.evidenceUrl).href;
  if (value.inferred !== undefined) {
    if (typeof value.inferred !== 'boolean') reject();
    result.inferred = value.inferred;
  }
  return Object.freeze(result);
}
function issue(value, nodes) {
  object(value);
  const repoId = id(value.repoId);
  if (nodes.get(repoId)?.kind !== 'repo' || !Number.isSafeInteger(value.number) || value.number < 1) reject();
  const state = choice(value.state, ['open', 'closed']);
  const stateReason = choice(value.stateReason ?? null, [null, 'completed', 'not_planned']);
  if (state === 'open' && stateReason !== null) reject();
  const url = githubUrl(value.url);
  if (!new RegExp(`^/[A-Za-z0-9-]+/[A-Za-z0-9_.-]+/issues/${value.number}$`).test(url.pathname)) reject();
  return Object.freeze({
    id: id(value.id), repoId, number: value.number, title: text(value.title, 256),
    state, stateReason, updatedAt: timestamp(value.updatedAt), url: url.href,
  });
}

function normalizeFleetSnapshot(value) {
  object(value);
  if (value.schemaVersion !== SCHEMA_VERSION) reject();
  const nodes = unique(array(value.nodes, LIMITS.nodes, node));
  const byId = new Map(nodes.map((entry) => [entry.id, entry]));
  const issues = unique(array(value.issues, LIMITS.issues, (entry) => issue(entry, byId)));
  if (new Set(issues.map((entry) => `${entry.repoId}\0${entry.number}`)).size !== issues.length) reject();
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    generatedAt: timestamp(value.generatedAt),
    sources: unique(array(value.sources, LIMITS.sources, source)),
    nodes,
    edges: unique(array(value.edges, LIMITS.edges, (entry) => edge(entry, byId))),
    issues,
  });
}

module.exports = { FleetSnapshotUnavailableError, LIMITS, MAX_SNAPSHOT_BYTES, SCHEMA_VERSION, normalizeFleetSnapshot };
