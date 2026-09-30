export const ORBIT_SOURCE = Object.freeze({ id: 'celestrak', key: 'celestrak-iss-v1', name: 'CelesTrak selected ISS elements',
  url: 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON', termsUrl: 'https://celestrak.org/usage-policy.php',
  coverage: 'Selected ISS only; orbital coverage is global and independent of ground presets.', attribution: 'GP elements: CelesTrak / US Space Surveillance Network; SGP4 prediction, not telemetry.',
  intervalMs: 7200000, staleMs: 86400000, horizonMs: 259200000, bytes: 65536 });
const FIELDS = ['MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR','MEAN_MOTION_DOT','MEAN_MOTION_DDOT'];
export function normalizeSelectedOmm(input) {
  if (!Array.isArray(input) || input.length !== 1) throw new Error('orbit_payload_invalid');
  const value = input[0];
  if (!value || Number(value.NORAD_CAT_ID) !== 25544) throw new Error('orbit_identity_invalid');
  validateHeader(value);
  const result = { NORAD_CAT_ID:25544, OBJECT_NAME:'ISS (ZARYA)', EPOCH:value.EPOCH.replace(/Z$/, ''), CENTER_NAME:'EARTH', REF_FRAME:'TEME', TIME_SYSTEM:'UTC', MEAN_ELEMENT_THEORY:'SGP4' };
  for (const key of FIELDS) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw new Error('orbit_elements_invalid');
    result[key] = value[key];
  }
  validateBounds(result);
  return [result];
}
function validateHeader(value) {
  for (const [key,expected] of Object.entries({ CENTER_NAME:'EARTH', REF_FRAME:'TEME', TIME_SYSTEM:'UTC', MEAN_ELEMENT_THEORY:'SGP4' })) {
    if (value[key]!==undefined && value[key]!==expected) throw new Error('orbit_frame_invalid');
  }
  if (typeof value.EPOCH!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z?$/.test(value.EPOCH)) throw new Error('orbit_epoch_invalid');
  const epoch=Date.parse(value.EPOCH.replace(/Z$/, '')+'Z');
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0,19)!==value.EPOCH.slice(0,19)) throw new Error('orbit_epoch_invalid');
}
function validateBounds(result) {
  if (!(result.MEAN_MOTION>0 && result.MEAN_MOTION<20 && result.ECCENTRICITY>=0 && result.ECCENTRICITY<1)
      || !(result.INCLINATION>=0 && result.INCLINATION<=180)
      || ['RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY'].some((key) => result[key]<0 || result[key]>=360)) throw new Error('orbit_elements_invalid');
  if (['BSTAR','MEAN_MOTION_DOT','MEAN_MOTION_DDOT'].some(key=>Math.abs(result[key])>1)) throw new Error('orbit_elements_invalid');
}
function sourceState(row,enabled,fetchedAt,now) {
  if (!enabled)return 'disabled';if(row.stopped)return 'stopped';if(!fetchedAt)return 'unavailable';
  return now-Date.parse(fetchedAt)>ORBIT_SOURCE.staleMs ? 'stale' : 'fresh';
}
function metadata(row) {
  return { attemptedAt:row.attempted_at ? new Date(row.attempted_at).toISOString() : null,
    nextAttemptAt:row.attempted_at ? new Date(new Date(row.attempted_at).getTime()+ORBIT_SOURCE.intervalMs).toISOString() : null,
    failureId:row.stopped ? row.attempt_id : null,error:row.failure_code || null,httpStatus:row.http_status || null,payloadHash:row.payload_hash || null };
}
export function orbitSourceView(input,enabled=false,now=Date.now()) {
  const row=input || {},fetchedAt=row.fetched_at ? new Date(row.fetched_at).toISOString() : null;
  const reason=!enabled ? 'Orbital acquisition/configuration/migration not activated.' : row.stopped ? 'Acquisition stopped. Exact-owner review/reset required; no automatic retry.' : ORBIT_SOURCE.coverage;
  return {...ORBIT_SOURCE,enabled,state:sourceState(row,enabled,fetchedAt,now),fetchedAt,...metadata(row),reason};
}
