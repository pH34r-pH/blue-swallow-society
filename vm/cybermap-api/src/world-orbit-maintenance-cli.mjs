import { Pool } from 'pg';
import { PostgresWorldOrbitStore } from './world-orbit-postgres-store.mjs';
import { orbitMaintenance } from './world-orbit-maintenance.mjs';
// Explicit local operator command, never invoked by host startup or a browser read.
const pool = new Pool({ connectionString:process.env.DATABASE_URL, max:1, connectionTimeoutMillis:5000 });
try {
  if (!process.env.DATABASE_URL || !process.env.BSS_OWNER_MAINTENANCE_ACCESS_TOKEN) throw new Error('orbit_maintenance_unconfigured');
  const result = await orbitMaintenance({ store:new PostgresWorldOrbitStore({ pool }), token:process.env.BSS_OWNER_MAINTENANCE_ACCESS_TOKEN,
    action:process.argv[2],failureId:process.argv[3],reason:process.argv[4] });
  process.stdout.write(JSON.stringify(result)+'\n');
} catch (error) { process.stderr.write(JSON.stringify({ error:error.code || (error.message?.startsWith('orbit_') ? error.message : 'orbit_maintenance_unavailable') })+'\n'); process.exitCode=1; }
finally { await pool.end(); }
