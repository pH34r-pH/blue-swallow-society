import test from 'node:test';
import assert from 'node:assert/strict';
import { json2satrec,propagate } from '../api/_private/operator/assets/satellite-sgp4.mjs';
import { orbitPrediction,orbitFixedPosition,ORBIT_HORIZON_MS,ORBIT_STALE_MS } from '../api/_private/operator/assets/world-orbit-state.mjs';
import * as c from '../api/_private/operator/assets/cesium/index.js';
// Historical Vanguard 1 (00005) verification vector, Vallado AIAA 2006-6753, tcppver.out.
// The ID is remapped to the selected-ID contract ONLY in this synthetic test; never runtime ISS data.
export const referenceOmm={NORAD_CAT_ID:25544,EPOCH:'2000-06-27T18:50:19.733568',MEAN_MOTION:10.82419157,ECCENTRICITY:0.1859667,
  INCLINATION:34.2682,RA_OF_ASC_NODE:348.7242,ARG_OF_PERICENTER:331.7664,MEAN_ANOMALY:19.3264,BSTAR:0.000028098,MEAN_MOTION_DOT:0.00000023,MEAN_MOTION_DDOT:0};
test('mature SGP4 matches published Vanguard epoch/360-minute reference positions in kilometres',()=>{
  const sat=json2satrec(referenceOmm),epoch=new Date(referenceOmm.EPOCH+'Z');
  for(const [minutes,expected] of [[0,[7022.46529266,-1400.08296755,0.03995155]],[360,[-7154.03120202,-3783.17682504,-3536.19412294]]]){
    const state=propagate(sat,new Date(epoch.getTime()+minutes*60000));
    for(const [index,key] of ['x','y','z'].entries())assert.ok(Math.abs(state.position[key]-expected[index])<0.00002,`${minutes}min ${key}: ${state.position[key]}`);
  }
});
test('TEME to pseudo-fixed preserves actual altitude and simulation-bound rotation; stale/horizon clocks',()=>{
  const epoch=Date.parse(referenceOmm.EPOCH+'Z'),at=new Date(epoch).toISOString();
  const p=orbitPrediction(referenceOmm,at,epoch);assert.equal(p.stale,false);assert.ok(p.heightMetres>600000);
  const fixed=orbitFixedPosition(p,c),geo=c.Ellipsoid.WGS84.cartesianToCartographic(fixed);
  assert.ok(Math.abs(geo.height-p.heightMetres)<0.02);
  assert.ok(Math.abs(c.Cartesian3.magnitude(fixed)-Math.hypot(...Object.values(p.temeMetres)))<1e-6);
  // GMST rotation reference from Vallado: epoch Earth rotation angle 3.4691723423794016 rad.
  const angle=3.4691723423794016,expectedX=p.temeMetres.x*Math.cos(angle)+p.temeMetres.y*Math.sin(angle);
  assert.ok(Math.abs(fixed.x-expectedX)<1); // UT1=UTC, JS millisecond epoch; not orbit truth.
  assert.equal(orbitPrediction(referenceOmm,at,epoch+ORBIT_STALE_MS).stale,false);
  assert.equal(orbitPrediction(referenceOmm,at,epoch+ORBIT_STALE_MS+1).stale,true);
  assert.ok(orbitPrediction(referenceOmm,new Date(epoch+ORBIT_HORIZON_MS).toISOString(),epoch).temeMetres);
  assert.equal(orbitPrediction(referenceOmm,new Date(epoch+ORBIT_HORIZON_MS+1).toISOString(),epoch).temeMetres,null);
  assert.equal(orbitPrediction({...referenceOmm,NORAD_CAT_ID:5},at,epoch).temeMetres,null);
});

test('ellipsoid horizon occludes far-side orbital altitude and accepts near-side altitude',()=>{
  const radius=c.Ellipsoid.WGS84.maximumRadius,occluder=new c.EllipsoidalOccluder(c.Ellipsoid.WGS84,new c.Cartesian3(radius*2,0,0));
  assert.equal(occluder.isPointVisible(new c.Cartesian3(radius+400000,0,0)),true);
  assert.equal(occluder.isPointVisible(new c.Cartesian3(-radius-400000,0,0)),false);
});
