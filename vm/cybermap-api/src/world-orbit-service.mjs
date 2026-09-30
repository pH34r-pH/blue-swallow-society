import { createHash } from 'node:crypto';
import { normalizeSelectedOmm, ORBIT_SOURCE, orbitSourceView } from './world-orbit-contract.mjs';
export function createWorldOrbitService({ store, enabled = false, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const read = async () => {
    if (!enabled) return { source:orbitSourceView(null,false,now()), elements:[] };
    try { const row = await store.read(); return { source:orbitSourceView(row,true,now()), elements:row?.elements || [] }; }
    catch { return { source:{ ...orbitSourceView(null,true,now()), error:'orbit_storage_unavailable', reason:'Shared orbital storage unavailable; acquisition fails closed.' }, elements:[] }; }
  };
  const refresh = async () => {
    if (!enabled) return { acquired:false, reason:'disabled' };
    let id;
    try { id = await store.claim(); } catch { return { acquired:false, reason:'storage_unavailable' }; }
    if (!id) return { acquired:false, reason:'gated_or_stopped' };
    let failure = { error:'orbit_transport_failure', status:null };
    try {
      const response = await fetchImpl(ORBIT_SOURCE.url, { redirect:'manual', signal:AbortSignal.timeout(12000), headers:{ Accept:'application/json', 'User-Agent':'BlueSwallowSociety/World-public-context (https://github.com/pH34r-pH/blue-swallow-society)' } });
      if (response.status !== 200) { await response.body?.cancel().catch(() => {}); failure = { error:'orbit_http_non200', status:response.status }; }
      else {
        const text = await boundedText(response); const elements = normalizeSelectedOmm(JSON.parse(text));
        const hash = createHash('sha256').update(text).digest('hex');
        const saved = await store.finish(id,{ elements,hash }); return { acquired:saved, reason:saved ? 'success' : 'receipt_superseded' };
      }
    } catch (error) { failure = { error:error.message?.startsWith('orbit_') ? error.message : 'orbit_transport_or_payload_failure', status:null }; }
    // A failed persistence leaves acquisition_incomplete latched; never attempt another provider request.
    await store.finish(id,failure).catch(() => {}); return { acquired:false, reason:'stopped' };
  };
  return { read,refresh };
}
async function boundedText(response) {
  if (Number(response.headers.get('content-length') || 0)>ORBIT_SOURCE.bytes) { await response.body?.cancel(); throw new Error('orbit_body_limit'); }
  if (!response.body) throw new Error('orbit_payload_invalid');
  const reader = response.body.getReader(); let size = 0; const parts = [];
  try {
    while (true) { const { done,value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size>ORBIT_SOURCE.bytes) throw new Error('orbit_body_limit'); parts.push(Buffer.from(value)); }
    return Buffer.concat(parts).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
