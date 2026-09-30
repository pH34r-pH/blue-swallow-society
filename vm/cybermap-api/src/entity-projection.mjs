import { requireEntity } from './entity-contract.mjs';

export function emptyOperatorState() {
  return { label: null, labels: [], review_state: 'unreviewed', membership_override: null,
    rejected_device_ids: [], merged_into: null, active: true };
}
export function effectiveDevices(state, hypothesis) {
  if (!state.active) return [];
  return [...new Set(state.membership_override ?? hypothesis?.device_ids ?? [])]
    .filter((id) => !state.rejected_device_ids.includes(id)).sort();
}
export function projectEntity(row) {
  const machine = row.machine ?? null;
  if (machine?.confidence !== null && machine?.confidence !== undefined) machine.confidence = Number(machine.confidence);
  return {
    entity_id: row.entity_id, revision: row.revision, stable_key: row.stable_key,
    first_seen_at: row.first_seen_at, last_seen_at: row.last_seen_at, updated_at: row.updated_at,
    operator: row.operator_state, machine,
    device_ids: effectiveDevices(row.operator_state, machine),
    identity_claim: false,
  };
}
function active(row) {
  requireEntity(row && row.operator_state.active, 'entity_retired', 409);
}
function replaceMembership(row, members) {
  requireEntity(members.length <= 100, 'entity_too_large', 422);
  row.operator_state.membership_override = [...new Set(members)].sort();
}
export function applyCorrection(command, rows, undo = null) {
  const target = rows[command.entity_id];
  if (command.action === 'undo') return compensate(command, rows, undo);
  active(target);
  const state = target.operator_state;
  const members = effectiveDevices(state, target.machine);
  state.review_state = 'reviewed';
  switch (command.action) {
    case 'create':
      state.label = command.label;
      replaceMembership(target, command.device_ids);
      break;
    case 'label': state.label = command.label; state.labels = command.labels; break;
    case 'membership':
      requireEntity(command.remove.every((id) => members.includes(id)), 'membership_not_found', 422);
      replaceMembership(target, [...members.filter((id) => !command.remove.includes(id)), ...command.add]);
      // Removal is an explicit negative assertion, retained across model refresh.
      state.rejected_device_ids = [...new Set([...state.rejected_device_ids, ...command.remove])]
        .filter((id) => !command.add.includes(id)).sort();
      break;
    case 'reject':
      state.rejected_device_ids = [...new Set([...state.rejected_device_ids, ...command.device_ids])].sort();
      break;
    case 'split': {
      requireEntity(command.device_ids.every((id) => members.includes(id)) && command.device_ids.length < members.length,
        'invalid_split', 422);
      replaceMembership(target, members.filter((id) => !command.device_ids.includes(id)));
      const created = rows[command.new_entity_id];
      replaceMembership(created, command.device_ids);
      created.operator_state.review_state = 'reviewed';
      break;
    }
    case 'merge': {
      const source = rows[command.source_entity_id];
      active(source);
      const combined = [...new Set([...members, ...effectiveDevices(source.operator_state, source.machine)])];
      // Explicit negative assertions cannot be silently overridden by a merge.
      requireEntity(!combined.some((id) => state.rejected_device_ids.includes(id)
        || source.operator_state.rejected_device_ids.includes(id)), 'rejection_conflict', 409);
      state.rejected_device_ids = [...new Set([...state.rejected_device_ids, ...source.operator_state.rejected_device_ids])].sort();
      replaceMembership(target, combined);
      source.operator_state.active = false;
      source.operator_state.merged_into = command.entity_id;
      source.operator_state.review_state = 'retired';
      break;
    }
  }
  for (const row of Object.values(rows)) requireEntity(row.operator_state.rejected_device_ids.length <= 100, 'entity_too_large', 422);
  return rows;
}
function compensate(command, rows, event) {
  requireEntity(event && event.affected_ids.includes(command.entity_id), 'assertion_not_found', 404);
  const affected = Object.keys(rows).sort();
  requireEntity(JSON.stringify(affected) === JSON.stringify([...event.affected_ids].sort()), 'undo_scope_mismatch', 409);
  for (const id of affected) {
    requireEntity(rows[id].revision === event.after_state[id].revision, 'undo_conflict', 409);
    rows[id].operator_state = structuredClone(event.before_state[id]?.operator_state
      ?? { ...emptyOperatorState(), active: false, review_state: 'retired' });
  }
  return rows;
}
