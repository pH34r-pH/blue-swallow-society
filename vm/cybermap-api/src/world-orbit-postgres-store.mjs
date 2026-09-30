import { randomUUID } from 'node:crypto';
import { ORBIT_SOURCE } from './world-orbit-contract.mjs';
export class PostgresWorldOrbitStore {
  constructor({ pool } = {}) { if (!pool?.connect || !pool?.query) throw new TypeError('Existing pg pool required'); this.pool = pool; }
  async read() { return (await this.pool.query('SELECT * FROM world_orbit_source WHERE source_key=$1', [ORBIT_SOURCE.key])).rows[0] || null; }
  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='3s'");
      const result = await fn(client); await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async claim() {
    const id = randomUUID();
    // Commit an incomplete-attempt stop latch BEFORE network. No lease expiration can silently retry.
    const result = await this.pool.query(`UPDATE world_orbit_source SET attempted_at=clock_timestamp(), attempt_id=$2,
      stopped=true, failure_code='acquisition_incomplete', http_status=NULL
      WHERE source_key=$1 AND NOT stopped AND (attempted_at IS NULL OR attempted_at<=clock_timestamp()-interval '2 hours')
      RETURNING attempt_id`, [ORBIT_SOURCE.key, id]);
    return result.rows[0]?.attempt_id || null;
  }
  async finish(id, { elements = null, hash = null, error = null, status = null } = {}) {
    const result = await this.pool.query(`UPDATE world_orbit_source SET stopped=$3, failure_code=$4, http_status=$5,
      elements=CASE WHEN $3 THEN elements ELSE $6::jsonb END,
      payload_hash=CASE WHEN $3 THEN payload_hash ELSE $7 END,
      fetched_at=CASE WHEN $3 THEN fetched_at ELSE clock_timestamp() END
      WHERE source_key=$1 AND attempt_id=$2 AND stopped AND failure_code='acquisition_incomplete' RETURNING attempt_id`,
    [ORBIT_SOURCE.key, id, !!error, error, status, elements ? JSON.stringify(elements) : null, hash]);
    return result.rows.length === 1;
  }
  async reset({ failureId, reason, actorId }) {
    if (!/^[a-f0-9-]{36}$/.test(failureId || '') || typeof reason !== 'string' || reason.trim().length<10 || reason.length>1000
        || typeof actorId !== 'string' || !actorId || actorId.length>256) throw new Error('orbit_review_invalid');
    return this.transaction(async (client) => {
      const row = (await client.query('SELECT * FROM world_orbit_source WHERE source_key=$1 FOR UPDATE', [ORBIT_SOURCE.key])).rows[0];
      if (!row?.stopped || row.attempt_id !== failureId) throw new Error('orbit_review_conflict');
      await client.query(`INSERT INTO world_orbit_resets(failed_attempt_id,actor_id,review_reason,failure_code,http_status,attempted_at,cached_payload_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [failureId, actorId, reason.trim(), row.failure_code, row.http_status, row.attempted_at, row.payload_hash]);
      // Clear the old receipt as well: a late finishing worker cannot overwrite the owner's reset.
      await client.query(`UPDATE world_orbit_source SET stopped=false, attempt_id=NULL, failure_code=NULL, http_status=NULL WHERE source_key=$1`, [ORBIT_SOURCE.key]);
      return { reset:true, nextAttemptAt:new Date(new Date(row.attempted_at).getTime()+ORBIT_SOURCE.intervalMs).toISOString() };
    });
  }
}
