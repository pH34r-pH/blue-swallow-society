import { json2satrec, propagate, eciToGeodetic, gstime } from './satellite-sgp4.mjs';
export const ORBIT_STALE_MS = 86400000;
export const ORBIT_HORIZON_MS = 259200000;
export function orbitPrediction(elements, simulationUtc, now = Date.now()) {
  const epochUtc = typeof elements?.EPOCH==='string' ? elements.EPOCH.replace(/Z$/, '')+'Z' : null;
  const epoch = Date.parse(epochUtc), at = Date.parse(simulationUtc);
  const base = { id:'orbit-25544',title:'ISS (NORAD 25544)',semantics:'predicted / propagated',epochUtc,simulationUtc,
    epochAgeMs:Number.isFinite(epoch) ? now-epoch : null, stale:Math.abs(now-epoch)>ORBIT_STALE_MS,
    uncertainty:'SGP4 from cached GP elements; no telemetry. Accuracy degrades away from epoch. TEME → pseudo-fixed uses UT1=UTC; ellipsoid height, not terrain clearance.' };
  if (!compatibleFrame(elements)) return {...base,error:'Incompatible element reference frame or model.',temeMetres:null};
  if (Number(elements?.NORAD_CAT_ID)!==25544 || !Number.isFinite(epoch) || !Number.isFinite(at)) return { ...base,error:'Invalid selected identity or epoch.',temeMetres:null };
  if (Math.abs(at-epoch)>ORBIT_HORIZON_MS) return { ...base,error:'Simulation outside ±72-hour element epoch horizon. Position hidden.',temeMetres:null };
  try {
    return {...base,...propagatedCoordinates(elements,at),error:null};
  } catch { return { ...base,error:'Propagation failed or orbit decayed. Position hidden.',temeMetres:null }; }
}

export function orbitFixedPosition(prediction, cesium) {
  const { Cartesian3,Matrix3,Transforms,JulianDate }=cesium;
  if (!prediction?.temeMetres) return null;
  const { x,y,z }=prediction.temeMetres;
  return Matrix3.multiplyByVector(Transforms.computeTemeToPseudoFixedMatrix(JulianDate.fromDate(new Date(prediction.simulationUtc))),new Cartesian3(x,y,z),new Cartesian3());
}

function compatibleFrame(elements) {
  return !['CENTER_NAME','REF_FRAME','TIME_SYSTEM','MEAN_ELEMENT_THEORY'].some(key=>elements?.[key] && elements[key]!==({CENTER_NAME:'EARTH',REF_FRAME:'TEME',TIME_SYSTEM:'UTC',MEAN_ELEMENT_THEORY:'SGP4'})[key]);
}

function propagatedCoordinates(elements,at) {
    const state = propagate(json2satrec(elements),new Date(at));
    if (!state || ![state.position.x,state.position.y,state.position.z].every(Number.isFinite)) throw new Error();
    const geo=eciToGeodetic(state.position,gstime(new Date(at)));
    if (!Number.isFinite(geo.height) || geo.height<=0) throw new Error();
    return { heightMetres:geo.height*1000,temeMetres:{ x:state.position.x*1000,y:state.position.y*1000,z:state.position.z*1000 } };
}
