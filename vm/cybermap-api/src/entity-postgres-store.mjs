import { randomUUID } from 'node:crypto';
import { hashCanonicalJson } from './contracts.mjs';
import { boundedText, entityError, requireEntity, validateCommand, validateDetail, validateHypothesis, validateList } from './entity-contract.mjs';
import { applyCorrection, effectiveDevices, emptyOperatorState, projectEntity } from './entity-projection.mjs';

const SELECT_ENTITY = `SELECT s.*, e.stable_key, e.first_seen_at, e.last_seen_at,
  (SELECT jsonb_build_object('version', h.version, 'revision', h.revision, 'algorithm', h.algorithm,
    'device_ids', h.device_ids, 'evidence_ids', h.evidence_ids, 'confidence', h.confidence,
    'created_at', h.created_at) FROM entity_hypotheses h WHERE h.entity_id=s.entity_id
    ORDER BY h.revision DESC LIMIT 1) AS machine
  FROM entity_workbench_state s JOIN cyber_entities e ON e.id=s.entity_id`;
const PERSONAL = "('owned_device','local_observation')";
const RF = "('wifi_ap','ble_device','cell_signal')";

/** Internal store: callers are trusted service/model code. Never bind these methods directly to HTTP. */
export class PostgresEntityStore {
  constructor({ pool } = {}) {
    if (!pool?.connect || !pool?.query) throw new TypeError('A pg-compatible pool is required');
    this.pool = pool;
  }
  async transaction(fn, { rollback = false, readOnly = false } = {}) {
    const client = await this.pool.connect();
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      await client.query("SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '3s'; SET LOCAL idle_in_transaction_session_timeout = '10s'");
      if (!readOnly) await client.query("SELECT pg_advisory_xact_lock(hashtextextended('entity-workbench-v1', 0))");
      const result = await fn(client);
      await client.query(rollback ? 'ROLLBACK' : 'COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (['55P03', '57014', '40P01', '40001'].includes(error.code)) throw entityError('entity_busy', 409);
      throw error;
    } finally { client.release(); }
  }
  async list(input) {
    const q = validateList(input);
    return this.transaction(async (client) => {
      const values = [];
      const where = [];
      const bind = (v) => { values.push(v); return `$${values.length}`; };
      if (q.search) {
        const p = bind(q.search);
        where.push(`(position(lower(${p}) in lower(coalesce(s.operator_state->>'label',''))) > 0
          OR position(lower(${p}) in lower(e.stable_key)) > 0
          OR EXISTS (SELECT 1 FROM cyber_entities d WHERE d.id=ANY(s.effective_device_ids)
            AND position(lower(${p}) in lower(d.stable_key)) > 0)
          OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(s.operator_state->'labels') label
            WHERE position(lower(${p}) in lower(label)) > 0))`);
      }
      if (q.device_id) where.push(`${bind(q.device_id)}::uuid=ANY(s.effective_device_ids)`);
      if (q.review_state) where.push(`s.operator_state->>'review_state'=${bind(q.review_state)}`);
      if (q.since) where.push(`e.last_seen_at>=${bind(q.since)}::timestamptz`);
      if (q.until) where.push(`e.first_seen_at<=${bind(q.until)}::timestamptz`);
      if (q.min_confidence !== undefined) where.push(`(SELECT h.confidence FROM entity_hypotheses h WHERE h.entity_id=s.entity_id ORDER BY h.revision DESC LIMIT 1)>=${bind(q.min_confidence)}`);
      if (q.modality) where.push(`EXISTS (SELECT 1 FROM entity_observations eo JOIN observations o ON o.id=eo.observation_id
        WHERE eo.entity_id=ANY(s.effective_device_ids) AND o.kind=${bind(q.modality)}::observation_kind
          AND o.source_class IN ${PERSONAL} AND eo.source_class IN ${PERSONAL})`);
      const sort = { updated_at: 's.updated_at', first_seen_at: 'e.first_seen_at', last_seen_at: 'e.last_seen_at',
        confidence: "(SELECT h.confidence FROM entity_hypotheses h WHERE h.entity_id=s.entity_id ORDER BY h.revision DESC LIMIT 1)",
        label: "s.operator_state->>'label'" }[q.sort];
      const result = await client.query(`${SELECT_ENTITY} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ${sort} ${q.direction} NULLS LAST, s.entity_id ASC LIMIT ${bind(q.limit + 1)} OFFSET ${bind(q.offset)}`, values);
      return page(result.rows.map(projectEntity), q.limit, q.offset);
    }, { readOnly: true });
  }
  async detail(input) {
    const q = validateDetail(input);
    return this.transaction(async (client) => {
      const row = await loadEntity(client, q.entity_id);
      const history = await client.query(`SELECT id, actor_id, action, reason, evidence_ids, affected_ids,
        expected_revisions, before_state, after_state, compensates, created_at FROM entity_assertions WHERE $1::uuid=ANY(affected_ids)
        ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, [q.entity_id, q.limit + 1, q.history_offset]);
      const hypotheses = await client.query(`SELECT version, revision, algorithm, device_ids, evidence_ids, confidence, created_at
        FROM entity_hypotheses WHERE entity_id=$1 ORDER BY revision DESC LIMIT $2 OFFSET $3`,
      [q.entity_id, q.limit + 1, q.hypothesis_offset]);
      const evidence = await client.query(`SELECT DISTINCT o.id, o.kind, o.observed_at, o.source_id, o.source_class,
          o.session_id, eo.entity_id AS device_id, eo.relationship, eo.weight, eo.provenance
        FROM entity_observations eo JOIN observations o ON o.id=eo.observation_id
        WHERE eo.entity_id=ANY($1::uuid[]) AND o.source_class IN ${PERSONAL} AND eo.source_class IN ${PERSONAL}
          AND o.kind IN ${RF}
        ORDER BY o.observed_at DESC, o.id, eo.entity_id, eo.relationship LIMIT $2 OFFSET $3`,
      [effectiveDevices(row.operator_state, row.machine), q.limit + 1, q.evidence_offset]);
      return { ...projectEntity(row), history: page(history.rows, q.limit, q.history_offset),
        evidence: page(evidence.rows, q.limit, q.evidence_offset),
        hypotheses: page(hypotheses.rows.map((h) => ({ ...h, confidence: h.confidence === null ? null : Number(h.confidence) })), q.limit, q.hypothesis_offset) };
    }, { readOnly: true });
  }
  async preview(input) { return this.apply(input, true); }
  async mutate(input) { return this.apply(input, false); }
  async apply({ actor_id, command }, preview) {
    boundedText(actor_id, 256);
    const c = validateCommand(command);
    return this.transaction(async (client) => {
      const hash = hashCanonicalJson(c);
      const previous = await client.query('SELECT payload_hash, receipt FROM entity_assertions WHERE actor_id=$1 AND idempotency_key=$2', [actor_id, c.idempotency_key]);
      if (previous.rows.length) {
        requireEntity(previous.rows[0].payload_hash === hash, 'idempotency_key_reused', 409);
        return { ...previous.rows[0].receipt, replayed: true, preview };
      }
      await validateEvidence(client, c.evidence_ids);
      const { rows, before } = await loadForCommand(client, c);
      const undo = c.action === 'undo'
        ? (await client.query('SELECT * FROM entity_assertions WHERE id=$1', [c.assertion_id])).rows[0] : null;
      applyCorrection(c, rows, undo);
      const allDevices = [...new Set(Object.values(rows).flatMap((row) => effectiveDevices(row.operator_state, row.machine)))];
      const rejected = c.action === 'reject' ? c.device_ids : [];
      await validateDevices(client, [...new Set([...allDevices, ...rejected])]);
      const after = {};
      for (const [id, row] of Object.entries(rows)) {
        row.revision += 1;
        await saveState(client, row);
        after[id] = { revision: row.revision, operator_state: row.operator_state };
      }
      const eventId = randomUUID();
      const time = (await client.query('SELECT transaction_timestamp() AS time')).rows[0].time.toISOString();
      const receipt = { assertion_id: eventId, affected_ids: Object.keys(rows).sort(), revisions: Object.fromEntries(Object.entries(after).map(([id, s]) => [id, s.revision])), created_at: time };
      await client.query(`INSERT INTO entity_assertions(id,actor_id,idempotency_key,payload_hash,action,reason,
        evidence_ids,affected_ids,expected_revisions,before_state,after_state,compensates,receipt)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::jsonb)`,
      [eventId, actor_id, c.idempotency_key, hash, c.action, c.reason, c.evidence_ids, receipt.affected_ids,
        JSON.stringify(c.expected_revisions), JSON.stringify(before), JSON.stringify(after), c.assertion_id ?? null, JSON.stringify(receipt)]);
      return { ...receipt, replayed: false, preview,
        ...(preview ? { entities: Object.values(rows).map(projectEntity) } : {}) };
    }, { rollback: preview });
  }
  async publishHypothesis(input) {
    const h = validateHypothesis(input);
    return this.transaction(async (client) => {
      const row = h.expected_revision === 0
        ? (await loadForCommand(client, { action: 'create', entity_id: h.entity_id, expected_revisions: { [h.entity_id]: 0 } })).rows[h.entity_id]
        : await loadEntity(client, h.entity_id);
      requireEntity(row.operator_state.active, 'entity_retired', 409);
      requireEntity(row.revision === h.expected_revision, 'stale_revision', 409);
      await validateEvidence(client, h.evidence_ids);
      await validateDevices(client, h.device_ids, h.evidence_ids);
      requireEntity(!(await client.query('SELECT 1 FROM entity_hypotheses WHERE entity_id=$1 AND version=$2', [h.entity_id, h.version])).rows.length, 'hypothesis_version_reused', 409);
      row.revision += 1;
      if (h.expected_revision === 0) {
        await client.query(`UPDATE cyber_entities SET provenance=$2::jsonb WHERE id=$1`, [h.entity_id, JSON.stringify({ origin: 'machine_hypothesis', identity_claim: false })]);
        await saveState(client, row);
      }
      await client.query(`INSERT INTO entity_hypotheses(entity_id,revision,version,algorithm,device_ids,evidence_ids,confidence)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [h.entity_id, row.revision, h.version, h.algorithm, h.device_ids, h.evidence_ids, h.confidence]);
      row.machine = h;
      if (row.operator_state.review_state !== 'unreviewed') row.operator_state.review_state = 'needs_review';
      await saveState(client, row);
      return projectEntity(await loadEntity(client, h.entity_id));
    });
  }
}
function page(rows, limit, offset) {
  return { items: rows.slice(0, limit), next_offset: rows.length > limit ? offset + limit : null };
}
async function loadEntity(client, id) {
  const result = await client.query(`${SELECT_ENTITY} WHERE s.entity_id=$1`, [id]);
  requireEntity(result.rows.length === 1, 'entity_not_found', 404);
  return result.rows[0];
}
async function loadForCommand(client, c) {
  const rows = {}, before = {};
  for (const [id, expected] of Object.entries(c.expected_revisions).sort()) {
    const found = await client.query(`${SELECT_ENTITY} WHERE s.entity_id=$1`, [id]);
    if (!found.rows.length) {
      requireEntity(expected === 0 && ((c.action === 'create' && id === c.entity_id)
        || (c.action === 'split' && id === c.new_entity_id)), 'entity_not_found', 404);
      // Conflict with any existing canonical ID must never adopt or overwrite another entity.
      requireEntity(!(await client.query('SELECT 1 FROM cyber_entities WHERE id=$1', [id])).rows.length, 'entity_id_exists', 409);
      await client.query(`INSERT INTO cyber_entities(id,entity_kind,stable_key,display_name,source_class,first_seen_at,last_seen_at,confidence,provenance)
        VALUES($1,'cluster',$2,'Anonymous cluster','local_observation',NULL,NULL,NULL,$3::jsonb)`,
      [id, `anonymous:${id}`, JSON.stringify({ origin: 'operator_assertion', identity_claim: false })]);
      rows[id] = { entity_id: id, revision: 0, operator_state: emptyOperatorState(), machine: null };
      before[id] = null;
    } else {
      const row = found.rows[0];
      requireEntity(row.revision === expected, 'stale_revision', 409);
      rows[id] = row;
      before[id] = { revision: row.revision, operator_state: structuredClone(row.operator_state) };
    }
  }
  return { rows, before };
}
async function saveState(client, row) {
  const devices = effectiveDevices(row.operator_state, row.machine);
  await client.query(`UPDATE cyber_entities SET first_seen_at=t.first_seen, last_seen_at=t.last_seen
    FROM (SELECT min(o.observed_at) first_seen, max(o.observed_at) last_seen
      FROM entity_observations eo JOIN observations o ON o.id=eo.observation_id
      WHERE eo.entity_id=ANY($2::uuid[]) AND eo.source_class IN ${PERSONAL}
        AND o.source_class IN ${PERSONAL} AND o.kind IN ${RF}) t
    WHERE id=$1`, [row.entity_id, devices]);
  await client.query(`INSERT INTO entity_workbench_state(entity_id,revision,operator_state,effective_device_ids)
    VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(entity_id) DO UPDATE SET revision=excluded.revision,
    operator_state=excluded.operator_state,effective_device_ids=excluded.effective_device_ids,updated_at=now()`,
  [row.entity_id, row.revision, JSON.stringify(row.operator_state), effectiveDevices(row.operator_state, row.machine)]);
}
async function validateEvidence(client, evidence) {
  if (!evidence.length) return;
  const result = await client.query(`SELECT id FROM observations WHERE id=ANY($1::uuid[])
    AND source_class IN ${PERSONAL} AND kind IN ${RF}`, [evidence]);
  requireEntity(result.rows.length === evidence.length, 'nonpersonal_or_missing_evidence', 422);
}
async function validateDevices(client, devices, evidence = null) {
  if (!devices.length) return;
  const result = await client.query(`SELECT d.id FROM cyber_entities d WHERE d.id=ANY($1::uuid[])
    AND d.entity_kind='device' AND d.source_class IN ${PERSONAL}
    AND EXISTS (SELECT 1 FROM entity_observations eo JOIN observations o ON o.id=eo.observation_id
      WHERE eo.entity_id=d.id AND eo.source_class IN ${PERSONAL} AND o.source_class IN ${PERSONAL}
      AND o.kind IN ${RF} AND ($2::uuid[] IS NULL OR o.id=ANY($2::uuid[])))`, [devices, evidence]);
  requireEntity(result.rows.length === devices.length, 'nonpersonal_or_missing_device', 422);
}
