import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir,readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresWorldOrbitStore } from '../src/world-orbit-postgres-store.mjs';
import { historicalIss } from './fixtures/world-orbits.mjs';
const url=process.env.BSS_ENTITY_TEST_DATABASE_URL;
test('disposable PostGIS orbital gate: concurrency, durable restart/stop, reviewed reset and private isolation',{skip:!url},async(t)=>{
  const parsed=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname) && parsed.pathname==='/entity_test');
  const schema=`orbit_test_${randomUUID().replaceAll('-','')}`,admin=new pg.Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema},public`});
  t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
  const directory=new URL('../db/migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort())await pool.query(await readFile(new URL(name,directory),'utf8'));
  const before=(await pool.query('SELECT count(*) AS n FROM observations')).rows[0].n;
  const a=new PostgresWorldOrbitStore({pool}),b=new PostgresWorldOrbitStore({pool});
  const claims=await Promise.all([a.claim(),b.claim(),a.claim()]);assert.equal(claims.filter(Boolean).length,1);
  const id=claims.find(Boolean);assert.equal((await b.read()).failure_code,'acquisition_incomplete');
  // Simulate crash/restart after receipt commit: no expiry, no new worker may retry.
  await pool.query("UPDATE world_orbit_source SET attempted_at=clock_timestamp()-interval '3 hours'");
  assert.equal(await new PostgresWorldOrbitStore({pool}).claim(),null);
  assert.equal(await a.finish(id,{elements:[historicalIss],hash:'a'.repeat(64)}),true);
  const successId=await b.claim();assert.ok(successId);await b.finish(successId,{error:'orbit_http_non200',status:503});
  const restarted=new PostgresWorldOrbitStore({pool});assert.equal(await restarted.claim(),null);
  assert.equal((await restarted.read()).elements.length,1);assert.equal((await restarted.read()).http_status,503);
  await assert.rejects(a.reset({failureId:randomUUID(),reason:'Reviewed failure response',actorId:'synthetic-owner'}),/conflict/);
  const reset=await a.reset({failureId:successId,reason:'Reviewed 503; upstream incident resolved',actorId:'synthetic-owner'});assert.equal(reset.reset,true);
  assert.equal(await b.claim(),null); // reset must not shorten the two-hour gate
  assert.equal(await b.finish(successId,{elements:[historicalIss],hash:'b'.repeat(64)}),false); // late worker cannot overwrite reset
  await assert.rejects(a.reset({failureId:successId,reason:'Repeated stale review',actorId:'synthetic-owner'}),/conflict/);
  const receipt=(await pool.query('SELECT * FROM world_orbit_resets')).rows;assert.equal(receipt.length,1);assert.equal(receipt[0].actor_id,'synthetic-owner');
  await pool.query("UPDATE world_orbit_source SET attempted_at=clock_timestamp()-interval '2 hours 1 second'");
  const next=await restarted.claim();assert.ok(next);await restarted.finish(next,{error:'orbit_http_non200',status:301});
  assert.equal(await a.claim(),null);assert.equal((await a.read()).http_status,301);
  assert.equal((await pool.query('SELECT count(*) AS n FROM observations')).rows[0].n,before);
});
