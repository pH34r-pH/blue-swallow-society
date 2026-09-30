import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSelectedOmm,ORBIT_SOURCE } from '../src/world-orbit-contract.mjs';
import { createWorldOrbitService } from '../src/world-orbit-service.mjs';
import { createOrbitAcquisition } from '../src/world-orbit-acquisition.mjs';
import { orbitMaintenance } from '../src/world-orbit-maintenance.mjs';
import { historicalIss } from './fixtures/world-orbits.mjs';
// Test-only durable-state model shared across reconstructed service instances; clock is explicitly fake.
function harness(){
  let at=Date.parse('2019-06-05T12:12:58Z'),row={},calls=0,status=200,body=JSON.stringify([historicalIss]);
  const store={async read(){return row;},async claim(){if(row.stopped || (row.attempted_at && at-row.attempted_at<ORBIT_SOURCE.intervalMs))return null;
    row={...row,attempted_at:at,attempt_id:`attempt-${calls}`,stopped:true,failure_code:'acquisition_incomplete'};return row.attempt_id;},
    async finish(id,result){if(row.attempt_id!==id)return false;row={...row,stopped:!!result.error,failure_code:result.error,http_status:result.status};
      if(!result.error)row={...row,elements:result.elements,payload_hash:result.hash,fetched_at:at};return true;},
    async reset(){row={...row,stopped:false,attempt_id:null};}};
  const options={store,enabled:true,now:()=>at,fetchImpl:async(url,opts)=>{calls++;assert.equal(url,ORBIT_SOURCE.url);assert.equal(opts.redirect,'manual');assert.equal(opts.headers.Authorization,undefined);return new Response(body,{status});}};
  return {store,options,time:(v)=>{at=v;},advance:(v)=>{at+=v;},status:(v)=>{status=v;},body:(v)=>{body=v;},calls:()=>calls};
}
test('strict selected OMM identity, epoch/frame/elements and bounded payload qualification',()=>{
  assert.equal(normalizeSelectedOmm([historicalIss])[0].REF_FRAME,'TEME');
  for(const changed of [{NORAD_CAT_ID:5},{REF_FRAME:'ICRF'},{EPOCH:'bad'},{MEAN_MOTION:0},{ECCENTRICITY:2}])assert.throws(()=>normalizeSelectedOmm([{...historicalIss,...changed}]));
  assert.throws(()=>normalizeSelectedOmm([historicalIss,historicalIss]));
});
test('fake-clock two-hour gate survives service reconstruction; no read fetch; non200 permanently stops',async()=>{
  const h=harness(),a=createWorldOrbitService(h.options);
  await a.read();assert.equal(h.calls(),0);assert.equal((await a.refresh()).acquired,true);
  const b=createWorldOrbitService(h.options);h.advance(ORBIT_SOURCE.intervalMs-1);assert.equal((await b.refresh()).acquired,false);assert.equal(h.calls(),1);
  h.advance(1);h.status(503);assert.equal((await b.refresh()).reason,'stopped');assert.equal(h.calls(),2);
  h.advance(ORBIT_SOURCE.intervalMs*10);assert.equal((await createWorldOrbitService(h.options).refresh()).acquired,false);assert.equal(h.calls(),2);
  const cached=await a.read();assert.equal(cached.source.state,'stopped');assert.equal(cached.elements.length,1);assert.equal(cached.source.httpStatus,503);
});
test('disabled/missing storage never fetch; concurrent claims coalesce; redirects/malformed/oversized data latch',async()=>{
  const h=harness();await createWorldOrbitService({...h.options,enabled:false}).refresh();assert.equal(h.calls(),0);
  await createWorldOrbitService({...h.options,store:{claim:async()=>{throw new Error();}}}).refresh();assert.equal(h.calls(),0);
  const a=createWorldOrbitService(h.options);await Promise.all([a.refresh(),createWorldOrbitService(h.options).refresh()]);assert.equal(h.calls(),1);
  for(const [status,body] of [[302,'redirect'],[200,'not-json'],[200,'x'.repeat(65537)]]){
    const x=harness();x.status(status);x.body(body);const service=createWorldOrbitService(x.options);await service.refresh();x.advance(ORBIT_SOURCE.intervalMs*2);await service.refresh();assert.equal(x.calls(),1);assert.equal((await service.read()).source.state,'stopped');
  }
});
test('owner reset uses mutation scope and validated actor; read scope cannot reset',async()=>{
  let recorded;
  const store={read:async()=>({stopped:true}),reset:async(v)=>{recorded=v;return {reset:true};}};
  const verify=async(token,scope)=>{assert.equal(scope,'World.Manage');if(token==='read-only')throw new Error('scope denied');return {operatorId:'verified-owner'};};
  await assert.rejects(orbitMaintenance({store,token:'read-only',action:'reset',verify}));assert.equal(recorded,undefined);
  await orbitMaintenance({store,token:'synthetic-write',action:'reset',failureId:'failed',reason:'Reviewed HTTP failure',verify});
  assert.equal(recorded.actorId,'verified-owner');assert.equal(recorded.reason,'Reviewed HTTP failure');
});

test('host worker lifecycle is explicit, bounded and cancels superseded timers',async()=>{
  const timers=[];let refreshes=0;const worker=createOrbitAcquisition({refresh:async()=>{refreshes++;}}, {setTimer:(fn,ms)=>{assert.equal(ms,7200000);timers.push(fn);return timers.length;},clearTimer:()=>{}});
  assert.equal(refreshes,0);worker.start();worker.start();await new Promise(resolve=>setImmediate(resolve));assert.equal(refreshes,1);
  worker.stop();await timers[0]();assert.equal(refreshes,1);worker.start();await new Promise(resolve=>setImmediate(resolve));assert.equal(refreshes,2);worker.stop();
});
