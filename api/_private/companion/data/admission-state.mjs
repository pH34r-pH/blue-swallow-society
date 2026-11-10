import { ensure, equalBytes, utf8 } from './protocol.mjs';
import { planJournal } from './journal.mjs';
export const EMPTY_TIP = Object.freeze({ sequence: 0n, commitHash: '' });
export const DEFAULT_LIMITS = Object.freeze({ records: 50000, bytes: 64 * 1024 * 1024, claims: 100000,
  commits: 20000, quarantineRecords: 512, quarantineBytes: 4 * 1024 * 1024 });
export function freshState(limits) {
  for (const [name, max] of Object.entries(DEFAULT_LIMITS)) ensure(Number.isSafeInteger(limits[name]) && limits[name] > 0 && limits[name] <= max);
  return { limits, roster: null, suspended: false, generation: 0, records: new Map(), tails: new Map(), cursors: new Map(), ledger: new Map(),
    cutoffs: new Map(), tombstones: new Map(), conflicts: new Set(), quarantine: new Map(),
    bytes: 0, claims: 0, commits: 0, quarantineBytes: 0, quarantineIncomplete: false };
}
export function sameTip(a, b) { return a.sequence === b.sequence && a.commitHash === b.commitHash; }
export function restricted(state, publisher, sequence) {
  if (!state.roster?.members.has(publisher)) return true;
  const cutoff = state.cutoffs.get(publisher);
  return Boolean(cutoff && (cutoff.state === 'conflict' || sequence > cutoff.sequence));
}
function cutoffState(state, publisher, tip) {
  if (tip.sequence === 0n) return 'verified';
  const hash = state.ledger.get(publisher)?.get(tip.sequence);
  if (hash === tip.commitHash) return 'verified';
  return hash || (state.cursors.get(publisher) || EMPTY_TIP).sequence >= tip.sequence ? 'conflict' : 'pending';
}
export function applyRestrictions(state, roster) {
  for (const member of roster.members.values()) {
    const requested = member.acceptedThrough; const prior = state.cutoffs.get(member.deviceId);
    if (requested && (!prior || requested.sequence < prior.sequence
      || (requested.sequence === prior.sequence && requested.commitHash !== prior.commitHash))) {
      state.cutoffs.set(member.deviceId, { ...requested, state: cutoffState(state, member.deviceId, requested) });
    }
  }
}
export function batchRows(delta) {
  return [...delta.observations, ...delta.events, ...delta.retractions.map((row) => ({ ...row, kind: 'retraction',
    bytes: utf8(JSON.stringify([row.id, row.targetObservationId])), sessionId: delta.sessionId }))];
}
export function identityConflicts(state, publisher, rows) {
  return rows.filter((row) => {
    const prior = state.records.get(row.id);
    return prior && (prior.kind !== row.kind || !equalBytes(prior.bytes, row.bytes)
      || (row.kind === 'retraction' && !prior.claims.has(publisher)));
  });
}
export function quarantine(state, publisher, commit, rows) {
  const fresh = rows.filter((row) => !state.quarantine.has(`${publisher}:${commit.sequence}:${commit.commitHash}:${row.id}`));
  // Always suppress disputed support, even if competing-byte retention is full.
  for (const row of rows) state.conflicts.add(row.id);
  state.generation++;
  const size = fresh.reduce((total, row) => total + row.bytes.length, 0);
  if (state.quarantine.size + fresh.length > state.limits.quarantineRecords || state.quarantineBytes + size > state.limits.quarantineBytes) {
    state.quarantineIncomplete = true; throw new Error('dataset_capacity');
  }
  for (const row of fresh) state.quarantine.set(`${publisher}:${commit.sequence}:${commit.commitHash}:${row.id}`,
    { id: row.id, kind: row.kind, publisher, sequence: commit.sequence, commitHash: commit.commitHash, bytes: row.bytes.slice() });
  state.quarantineBytes += size;
}
export function planAppend(state, publisher, rows, delta) {
  const fresh = rows.filter((row) => !state.records.has(row.id));
  const size = fresh.reduce((total, row) => total + row.bytes.length, 0);
  const claims = rows.filter((row) => !state.records.get(row.id)?.claims.has(publisher)).length;
  if (state.records.size + fresh.length > state.limits.records || state.bytes + size > state.limits.bytes
    || state.claims + claims > state.limits.claims || state.commits + 1 > state.limits.commits) throw new Error('dataset_capacity');
  return { fresh, size, claims, tails: planJournal(delta.events, state.records, state.tails) };
}
function addTombstone(state, publisher, row) {
  const key = `${publisher}:${row.targetObservationId}`;
  const entries = state.tombstones.get(key) || new Set(); entries.add(row.id); state.tombstones.set(key, entries);
}
export function append(state, publisher, commit, rows, plan) {
  const tip = { sequence: commit.sequence, commitHash: commit.commitHash };
  for (const row of plan.fresh) state.records.set(row.id, { ...row, bytes: row.bytes.slice(), claims: new Map(), publishers: new Set() });
  for (const row of rows) {
    const record = state.records.get(row.id); record.publishers.add(publisher);
    if (!record.claims.has(publisher)) record.claims.set(publisher, tip);
    if (row.kind === 'retraction') addTombstone(state, publisher, row);
  }
  for (const [id, tail] of plan.tails) state.tails.set(id, tail);
  const ledger = state.ledger.get(publisher) || new Map(); ledger.set(commit.sequence, commit.commitHash); state.ledger.set(publisher, ledger);
  state.cursors.set(publisher, tip); state.bytes += plan.size; state.claims += plan.claims; state.commits++; state.generation++;
  const cutoff = state.cutoffs.get(publisher);
  if (cutoff && sameTip(cutoff, tip)) cutoff.state = 'verified';
}
export function withdrawn(state, publisher, id) {
  const entries = state.tombstones.get(`${publisher}:${id}`);
  if (!entries) return false;
  for (const key of entries) {
    const claim = state.records.get(key)?.claims.get(publisher);
    if (claim && !restricted(state, publisher, claim.sequence)) return true;
  }
  return false;
}
export function visibleClaims(state, row) {
  if (state.suspended || state.conflicts.has(row.id)) return [];
  return [...row.claims].filter(([publisher, tip]) => !restricted(state, publisher, tip.sequence)
    && (row.kind === 'event' || !withdrawn(state, publisher, row.id)));
}
