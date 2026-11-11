import { ensure } from './protocol.mjs';
import { DEFAULT_LIMITS, EMPTY_TIP, freshState, sameTip, applyRestrictions, restricted, batchRows,
  identityConflicts, quarantine, planAppend, append, visibleClaims } from './admission-state.mjs';

function rosterOrder(previous, next) {
  if (!previous) return;
  ensure(next.groupId === previous.groupId && next.rosterPublicKeySpki === previous.rosterPublicKeySpki);
  ensure(next.revision >= previous.revision);
  if (next.revision === previous.revision) ensure(next.rosterSha256 === previous.rosterSha256 && next.roster === previous.roster);
}
function validateAppend(state, reference, expected, commit, delta) {
  const roster = state.roster;
  ensure(roster && reference.revision === roster.revision && reference.rosterSha256 === roster.rosterSha256);
  ensure(commit.groupId === roster.groupId && roster.members.has(commit.publisherDeviceId));
  ensure(commit.sessionId === delta.sessionId && commit.batchId === delta.batchId);
  const publisher = commit.publisherDeviceId; const cursor = state.cursors.get(publisher) || EMPTY_TIP;
  if (!sameTip(expected, cursor)) return false;
  ensure(commit.previousSequence === expected.sequence && commit.previousCommitSha256 === expected.commitHash && commit.sequence === expected.sequence + 1n);
  ensure(!restricted(state, publisher, commit.sequence));
  const cutoff = state.cutoffs.get(publisher);
  if (cutoff?.sequence === commit.sequence) ensure(cutoff.commitHash === commit.commitHash);
  return true;
}
export function createAdmissionStore(options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options }; let state = freshState(limits);
  return {
    applyRoster(roster) {
      rosterOrder(state.roster, roster);
      const changed = state.roster?.rosterSha256 !== roster.rosterSha256 || state.suspended;
      if (!changed) return false;
      applyRestrictions(state, roster); state.roster = roster; state.suspended = false; state.generation++; return true;
    },
    roster: () => state.roster,
    cursor: (publisher) => ({ ...(state.cursors.get(publisher) || EMPTY_TIP) }),
    cutoff: (publisher) => state.cutoffs.has(publisher) ? { ...state.cutoffs.get(publisher) } : null,
    suspend() { if (!state.suspended) { state.suspended = true; state.generation++; } },
    // Commit and delta must come from the wire verifier; this operation never awaits.
    admit(reference, expected, commit, delta) {
      if (!validateAppend(state, reference, expected, commit, delta)) return 'stale';
      const rows = batchRows(delta); const conflicts = identityConflicts(state, commit.publisherDeviceId, rows);
      if (conflicts.length) { quarantine(state, commit.publisherDeviceId, commit, conflicts); return 'conflict'; }
      const plan = planAppend(state, commit.publisherDeviceId, rows, delta);
      append(state, commit.publisherDeviceId, commit, rows, plan); return 'applied';
    },
    *observations({ publisher = null, geometry = false } = {}) {
      for (const row of state.records.values()) {
        if (row.kind === 'event' || row.kind === 'retraction' || (geometry && row.publishers.size !== 1)) continue;
        const claims = visibleClaims(state, row).filter(([id]) => publisher === null || publisher === id);
        if (claims.length) yield { record: row, claims, ambiguous: row.publishers.size > 1 };
      }
    },
    *events({ publisher = null } = {}) {
      for (const row of state.records.values()) {
        if (row.kind !== 'event') continue;
        const claims = visibleClaims(state, row).filter(([id]) => publisher === null || publisher === id);
        if (claims.length) yield { record: row, claims };
      }
    },
    summary() {
      return { generation: state.generation, rosterRevision: state.roster?.revision || 0, suspended: state.suspended,
        records: state.records.size, rawBytes: state.bytes, claims: state.claims, commits: state.commits,
        conflicts: state.conflicts.size, quarantineRecords: state.quarantine.size,
        quarantineBytes: state.quarantineBytes, quarantineIncomplete: state.quarantineIncomplete };
    },
    clear() { state = freshState(limits); },
  };
}
