import { orbitPrediction } from './world-orbit-state.mjs';
function node(tag,text,attrs={}) { const n=document.createElement(tag); if (text!==undefined) n.textContent=text; for(const [key,value] of Object.entries(attrs)) n.setAttribute(key,value); return n; }
export function createOrbitView({ root,onChange=()=>{} }) {
  const section=node('section',undefined,{'aria-label':'Selected orbital predictions',class:'world-orbits'});
  const toggle=node('input',undefined,{type:'checkbox','aria-label':'Selected ISS orbit'});
  const label=node('label','Selected ISS orbit (global coverage)'); label.prepend(toggle);
  const simulation=node('input',undefined,{type:'datetime-local',step:'1','aria-label':'Orbit simulation UTC'});
  simulation.value=new Date().toISOString().slice(0,19);
  const timeLabel=node('label','Simulation UTC'); timeLabel.append(simulation);
  const current=node('button','Set simulation to current UTC',{type:'button'});
  const health=node('p',undefined,{role:'status'}),details=node('div',undefined,{class:'world-orbit-details'});
  section.append(node('h3','Selected orbital predictions'),node('p','Independent of ground region filters. SGP4 predictions from cached elements; never live or observed telemetry. Element age >24h is stale; positions outside ±72h from epoch are hidden.'),label,timeLabel,current,health,details); root.append(section);
  let data=null,prediction=null;
  const render=()=> {
    const original=data?.source;
    const source=original?.state==='fresh' && Date.now()-Date.parse(original.fetchedAt)>86400000 ? {...original,state:'stale'} : original; toggle.disabled=!source?.enabled;
    health.textContent=sourceHealth(source);
    details.replaceChildren(); prediction=null;
    if (!data?.elements?.length) { details.textContent='No cached selected elements available.'; return; }
    if (!toggle.checked) { details.textContent='Select the orbital layer to inspect its cached prediction.'; return; }
    prediction=orbitPrediction(data.elements[0],simulation.value+'Z');
    if (source.state!=='fresh') prediction={...prediction,stale:true};
    renderDetails(details,prediction,source);
  };
  const change=()=>{render();onChange();}; toggle.addEventListener('change',change);simulation.addEventListener('change',change);
  current.addEventListener('click',()=>{simulation.value=new Date().toISOString().slice(0,19);change();});
  return { set(value){data=value;render();}, predictions(){return prediction?.temeMetres && toggle.checked ? [prediction] : [];},destroy(){section.remove();} };
}

function renderDetails(details,prediction,source) {
    const dl=node('dl');
    for (const [key,value] of [['Object',prediction.title],['Semantics',prediction.semantics],['Epoch UTC',prediction.epochUtc],['Epoch age',`${(prediction.epochAgeMs/3600000).toFixed(2)} hours`],['Simulation UTC',prediction.simulationUtc],['Freshness',prediction.stale ? 'stale' : 'fresh'],['Ellipsoid altitude',prediction.heightMetres ? `${(prediction.heightMetres/1000).toFixed(3)} km` : 'Unavailable'],['Reference frame','SGP4 TEME → pseudo-fixed (UT1=UTC)'],['Source fetch UTC',source.fetchedAt || 'Unknown'],['Payload SHA-256',source.payloadHash || 'Unknown'],['Uncertainty',prediction.uncertainty]]) dl.append(node('dt',key),node('dd',String(value || 'Unknown')));
    details.append(dl); if(prediction.error) details.append(node('p',prediction.error,{role:'status'}));
    const link=node('a','CelesTrak elements / terms',{href:'https://celestrak.org/usage-policy.php',target:'_blank',rel:'noopener noreferrer'});details.append(link);
}

function sourceHealth(source) {
    return source ? `${source.name} · ${source.state}. ${source.reason || source.coverage} Fetch: ${source.fetchedAt || 'Unknown'}. Failure: ${source.error || 'None'}; HTTP ${source.httpStatus || 'Unknown'}. Review attempt: ${source.failureId || 'None'}.` : 'Orbital source unavailable; no substitute positions.';
}
