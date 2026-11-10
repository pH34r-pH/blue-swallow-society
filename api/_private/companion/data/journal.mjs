import { integer, MAX_LONG } from './protocol.mjs';
const STAGE = { START: 1, REQUESTED: 2, APPLIED: 3, STOP: 4, HEALTH: 5, CHECKPOINT: 6 };
function valid(value) { if (!value) throw new Error('journal_conflict'); }
function controlOf(previous) {
  if (previous.stage === 5) return { stage: STAGE[previous.healthTransition.controlStage], sequence: integer(previous.healthTransition.controlSequence) };
  if (previous.stage === 6) return { stage: STAGE[previous.checkpointControlStage], sequence: integer(previous.checkpointControlSequence) };
  return { stage: previous.stage, sequence: integer(previous.sequence) };
}
export function validateNext(previous, record) {
  if (!previous) { valid(integer(record.sequence) === 1n && record.stage === 1); return; }
  valid(integer(previous.sequence) < MAX_LONG && integer(record.sequence) === integer(previous.sequence) + 1n);
  valid(record.bootEpoch === previous.bootEpoch && integer(record.elapsedNs) >= integer(previous.elapsedNs) && record.mode === previous.mode);
  const control = controlOf(previous);
  if (record.stage === 6) valid(STAGE[record.checkpointControlStage] === control.stage && integer(record.checkpointControlSequence) === control.sequence);
  if (record.stage === 5) valid(STAGE[record.healthTransition.controlStage] === control.stage && integer(record.healthTransition.controlSequence) === control.sequence);
  const allowed = { 1: [3, 4, 5], 2: [3, 4, 5], 3: [2, 4, 5, 6] };
  valid((allowed[control.stage] || []).includes(record.stage));
}
// Call after the whole batch's cross-kind/exact-byte identity check.
export function planJournal(events, records, tails) {
  const changes = new Map();
  const ordered = [...events].sort((a, b) => a.sessionId.localeCompare(b.sessionId)
    || (integer(a.wire.sequence) < integer(b.wire.sequence) ? -1 : 1));
  for (const event of ordered) {
    if (records.has(event.id)) continue;
    const previous = changes.get(event.sessionId) || tails.get(event.sessionId);
    validateNext(previous, event.wire); changes.set(event.sessionId, event.wire);
  }
  return changes;
}
