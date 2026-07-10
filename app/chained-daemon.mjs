const DEFAULT_MAX_DERIVED_CLAIMS = 3;
const LURE_TOKENS = new Set(['corp', 'guest', 'redmond', 'badge', 'dead', 'drop', 'admin', 'security', 'key', 'iam']);
const IDENTITY_TOKENS = new Set(['badge', 'corp', 'redmond', 'iam', 'employee', 'person', '042']);

export function buildLoopBudget({ observations = [], maxDerivedClaimsPerLoop = DEFAULT_MAX_DERIVED_CLAIMS } = {}) {
  return {
    name: 'one-budget/local-passive-observation-batch',
    observations: Array.isArray(observations) ? observations.length : 0,
    maxDerivedClaimsPerLoop,
    network: false,
    writes: 'report-artifacts-only',
    identityEnrichment: false,
    offensiveActions: false,
  };
}

export function buildChainedDaemonLoopState(observations = [], { now = Date.now(), maxDerivedClaimsPerLoop = DEFAULT_MAX_DERIVED_CLAIMS } = {}) {
  const normalized = normalizeObservations(observations);
  const budget = buildLoopBudget({ observations: normalized, maxDerivedClaimsPerLoop });

  const oidPilgrimage = buildOidPilgrimage(normalized, { now, maxDerivedClaimsPerLoop });
  const rainCov = buildRainCovShoreline(normalized, { maxDerivedClaimsPerLoop });
  const feverLure = buildFeverLureQuarantine(normalized, { maxDerivedClaimsPerLoop });
  const negativeSpaceIam = buildNegativeSpaceIam(normalized, { maxDerivedClaimsPerLoop });
  const sporeLedger = buildSporeLedger(normalized, { maxDerivedClaimsPerLoop });

  const cards = normalized.map((observation) => buildTzeentchCard(observation, {
    oid: oidPilgrimage.bySourceId.get(observation.id),
    rain: rainCov.bySourceId.get(observation.id),
    fever: feverLure.bySourceId.get(observation.id),
    iam: negativeSpaceIam.bySourceId.get(observation.id) || null,
  }));

  return {
    ok: true,
    budget,
    loopOrder: [
      'oid-pilgrimage',
      'rain-cov-shoreline',
      'fever-lure-quarantine',
      'negative-space-iam-confessional',
      'spore-ledger',
    ],
    observations: normalized,
    cards,
    loops: {
      oidPilgrimage: publicLoop(oidPilgrimage),
      rainCov: publicLoop(rainCov),
      feverLure: publicLoop(feverLure),
      negativeSpaceIam: publicLoop(negativeSpaceIam),
      sporeLedger: publicLoop(sporeLedger),
    },
    summary: summarizeCards(cards),
  };
}

function buildTzeentchCard(observation, { oid, rain, fever, iam }) {
  const finalState = oid?.finalState || 'bound-imp-held';
  const held = finalState !== 'reportable-context' || fever?.state === 'quarantine' || iam;
  const safeNextStep = fever?.state === 'quarantine'
    ? 'Require repeat walk or independent passive source before any claim hardens.'
    : held
      ? 'Keep as context and preserve withheld reasons.'
      : 'May summarize as stable background passive context.';

  return {
    oid: oid?.oid || localOid(observation.id, Date.now()),
    sourceId: observation.id,
    label: observation.label,
    sensor: observation.sensor,
    kind: observation.kind,
    provenance: {
      raw: true,
      derived: true,
      model: false,
      user: observation.sensor === 'user-note',
    },
    oidPilgrimage: oid,
    rainCov: rain,
    feverLure: fever,
    negativeSpaceIam: iam,
    claim: held
      ? {
          type: 'held-passive-context',
          text: 'Passive observation held for corroboration; no hard claim emitted.',
        }
      : {
          type: 'passive-background-context',
          text: 'Stable background passive context observed; no identity inference attached.',
        },
    safeNextStep,
  };
}

function buildOidPilgrimage(observations, { now = Date.now(), maxDerivedClaimsPerLoop = DEFAULT_MAX_DERIVED_CLAIMS } = {}) {
  const outputs = observations.map((observation) => {
    const scopePass = observation.scopePosition === 'inside-field-scope';
    const counterfactualPass = observation.recurrence > 1 || observation.independentSources > 1 || observation.sensor === 'user-note';
    const debriefPass = scopePass && counterfactualPass && !observation.privacy.includes('identity');
    const output = {
      oid: localOid(observation.id, now),
      sourceId: observation.id,
      label: observation.label,
      finalState: debriefPass ? 'reportable-context' : 'bound-imp-held',
      gates: [
        { gate: 'observation', state: 'pass', evidence: observation.id },
        { gate: 'normalization', state: observation.tokens.length ? 'pass' : 'hold', evidence: observation.tokens.slice() },
        { gate: 'scope-oath', state: scopePass ? 'pass' : 'hold', evidence: observation.scopePosition },
        {
          gate: 'counterfactual',
          state: counterfactualPass ? 'pass' : 'hold',
          evidence: counterfactualPass ? 'has repeat or contextual note' : 'needs repeat/independent source',
        },
        { gate: 'debrief', state: debriefPass ? 'pass' : 'hold', evidence: debriefPass ? 'safe to summarize' : 'not ready for hard claim' },
      ],
    };
    return output;
  });

  return loopResult('OID Pilgrimage of the Bound Imp', outputs.slice(0, maxDerivedClaimsPerLoop), outputs, 'force every observation through auditable state gates');
}

function buildRainCovShoreline(observations, { maxDerivedClaimsPerLoop = DEFAULT_MAX_DERIVED_CLAIMS } = {}) {
  const allOutputs = observations
    .map((observation) => {
      let uncertainty = 0.10;
      const reasons = [];

      if (observation.gpsQuality === 'low') {
        uncertainty += 0.25;
        reasons.push('low GPS');
      } else if (observation.gpsQuality === 'medium') {
        uncertainty += 0.12;
        reasons.push('medium GPS');
      }
      if (observation.collectionQuality.includes('rain')) {
        uncertainty += 0.18;
        reasons.push('rain/noisy collection');
      }
      if (observation.scopePosition === 'edge-of-field-scope') {
        uncertainty += 0.20;
        reasons.push('scope shoreline');
      }
      if (observation.recurrence === 1) {
        uncertainty += 0.15;
        reasons.push('single sighting');
      }
      if (observation.sensor === 'flipper-passive') {
        uncertainty += 0.08;
        reasons.push('BLE passive ambiguity');
      }

      uncertainty = Math.min(0.95, round2(uncertainty));
      return {
        sourceId: observation.id,
        label: observation.label,
        uncertainty,
        tideMark: tideMarkForUncertainty(uncertainty),
        downgradedClaim: downgradedClaimForUncertainty(uncertainty),
        reasons,
      };
    })
    .sort((left, right) => right.uncertainty - left.uncertainty);

  return loopResult('Rain-Cov Shoreline', allOutputs.slice(0, maxDerivedClaimsPerLoop), allOutputs, 'render collection covariates and scope boundaries as uncertainty tide marks');
}

function buildFeverLureQuarantine(observations, { maxDerivedClaimsPerLoop = DEFAULT_MAX_DERIVED_CLAIMS } = {}) {
  const allOutputs = observations
    .map((observation) => {
      const lureHits = observation.tokens.filter((token) => LURE_TOKENS.has(token));
      const reasons = [];
      let score = 0;

      if (lureHits.length) {
        score += 2;
        reasons.push(`lure tokens=${uniqueValues(lureHits).join(',')}`);
      }
      if (observation.recurrence === 1) {
        score += 1;
        reasons.push('single sighting');
      }
      if (observation.independentSources < 2) {
        score += 1;
        reasons.push('no independent source');
      }
      if (observation.gpsQuality === 'low') {
        score += 1;
        reasons.push('low GPS quality');
      }
      if (observation.privacy.includes('identity') || observation.privacy.includes('org')) {
        score += 1;
        reasons.push(`privacy=${observation.privacy}`);
      }

      const state = score >= 4 ? 'quarantine' : score >= 2 ? 'watch' : 'clear-low-drama';
      return {
        sourceId: observation.id,
        label: observation.label,
        score,
        state,
        reasons,
        safeNextStep: state === 'quarantine'
          ? 'Require repeat walk or independent passive source before any claim hardens.'
          : 'Retain as low-confidence context.',
      };
    })
    .sort((left, right) => right.score - left.score);

  return loopResult('Fever-Lure Quarantine', allOutputs.slice(0, maxDerivedClaimsPerLoop), allOutputs, 'prevent analyst overclaim from tempting one-off strings');
}

function buildNegativeSpaceIam(observations, { maxDerivedClaimsPerLoop = DEFAULT_MAX_DERIVED_CLAIMS } = {}) {
  const allOutputs = observations.flatMap((observation) => {
    const identityHits = observation.tokens.filter((token) => IDENTITY_TOKENS.has(token));
    const identityAdjacent = observation.privacy.includes('identity') || observation.privacy.includes('org');
    if (!identityHits.length && !identityAdjacent) {
      return [];
    }

    return [{
      sourceId: observation.id,
      temptingClaimForbidden: `'${observation.label}' identifies an organization/account/person`,
      blockedBecauseMissing: [
        'consented identity source',
        'account-control evidence',
        'repeatable independent corroboration',
        'authorization to enrich PII',
      ],
      safeClaim: `A passive local ${observation.kind} string resembling ${identityHits.join(', ') || observation.privacy} was observed in ${observation.geoBucket}.`,
      state: 'confess-and-redact',
    }];
  });

  return loopResult('Negative-Space IAM Confessional', allOutputs.slice(0, maxDerivedClaimsPerLoop), allOutputs, 'make forbidden identity inference visible without performing it');
}

function buildSporeLedger(observations, { maxDerivedClaimsPerLoop = DEFAULT_MAX_DERIVED_CLAIMS } = {}) {
  const buckets = new Map();
  observations.forEach((observation) => {
    addBucket(buckets, `route:${observation.route}`, observation);
    addBucket(buckets, `geo:${observation.geoBucket}`, observation);
    addBucket(buckets, `time:${observation.timeBucket}`, observation);
    observation.tokens.forEach((token) => addBucket(buckets, `token:${token}`, observation));
  });

  const allOutputs = Array.from(buckets.entries())
    .flatMap(([cluster, rows]) => {
      if (rows.length < 2) {
        return [];
      }
      const sensors = uniqueValues(rows.map((row) => row.sensor));
      const routes = uniqueValues(rows.map((row) => row.route));
      const recurrenceSum = rows.reduce((sum, row) => sum + row.recurrence, 0);
      const independentAxes = sensors.length + routes.length + (recurrenceSum > rows.length ? 1 : 0);
      return [{
        cluster,
        observations: rows.map((row) => row.id),
        sensors,
        independentAxes,
        growth: independentAxes >= 4 ? 'mycelium' : independentAxes >= 3 ? 'hypha' : 'spore',
        claim: {
          type: 'correlation-substrate',
          text: 'Correlation substrate only; not an identity/location attribution.',
        },
      }];
    })
    .sort((left, right) => {
      if (right.independentAxes !== left.independentAxes) return right.independentAxes - left.independentAxes;
      if (right.observations.length !== left.observations.length) return right.observations.length - left.observations.length;
      return bucketPriority(left.cluster) - bucketPriority(right.cluster);
    });

  return loopResult('Spore Ledger', allOutputs.slice(0, maxDerivedClaimsPerLoop), allOutputs, 'grow hypotheses only where independent evidence threads join');
}

function normalizeObservations(observations) {
  return (Array.isArray(observations) ? observations : [])
    .map((observation, index) => normalizeObservation(observation, index))
    .filter(Boolean);
}

function normalizeObservation(observation, index) {
  if (!observation || typeof observation !== 'object') {
    return null;
  }

  const label = cleanString(observation.label || observation.ssid || observation.name || observation.note || observation.annotation) || `observation-${index + 1}`;
  const id = cleanString(observation.id || observation.sourceId || observation.bssid || observation.mac) || `obs-${index + 1}`;
  const tokens = normalizeTokens(Array.isArray(observation.tokens) && observation.tokens.length ? observation.tokens : label.split(/[^a-z0-9]+/i));

  return {
    id,
    sensor: cleanString(observation.sensor || observation.source) || 'local-passive',
    kind: cleanString(observation.kind || observation.type || observation.deviceClass) || 'observation',
    label,
    tokens,
    timeBucket: cleanString(observation.timeBucket || observation.time_bucket) || 'unknown-time',
    route: cleanString(observation.route) || 'unknown-route',
    geoBucket: cleanString(observation.geoBucket || observation.geo_bucket) || 'unknown-geo',
    recurrence: Math.max(1, toInteger(observation.recurrence ?? observation.count ?? 1)),
    independentSources: Math.max(1, toInteger(observation.independentSources ?? observation.independent_sources ?? 1)),
    gpsQuality: cleanString(observation.gpsQuality || observation.gps_quality) || 'unknown',
    collectionQuality: cleanString(observation.collectionQuality || observation.collection_quality) || 'unknown',
    scopePosition: cleanString(observation.scopePosition || observation.scope_position) || 'inside-field-scope',
    privacy: cleanString(observation.privacy) || 'low',
    raw: observation,
  };
}

function loopResult(name, outputs, allOutputs, purpose) {
  const bySourceId = new Map();
  allOutputs.forEach((output) => {
    if (output.sourceId) {
      bySourceId.set(output.sourceId, output);
    }
  });
  return { name, purpose, outputs, allOutputs, bySourceId };
}

function publicLoop(loop) {
  return {
    name: loop.name,
    purpose: loop.purpose,
    outputs: loop.outputs,
  };
}

function localOid(sourceId, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  return `bss:cd:${day}:${fnv1aHex(`${day}:${sourceId}`).slice(0, 12)}`;
}

function fnv1aHex(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0') + fnv1a32(`${value}:bss`).toString(16).padStart(8, '0');
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function addBucket(buckets, key, observation) {
  if (!buckets.has(key)) {
    buckets.set(key, []);
  }
  buckets.get(key).push(observation);
}

function bucketPriority(cluster) {
  if (cluster.startsWith('route:')) return 0;
  if (cluster.startsWith('geo:')) return 1;
  if (cluster.startsWith('time:')) return 2;
  return 3;
}

function tideMarkForUncertainty(uncertainty) {
  if (uncertainty >= 0.65) return 'tidebreak';
  if (uncertainty >= 0.45) return 'high-tide';
  if (uncertainty >= 0.25) return 'mid-tide';
  return 'low-tide';
}

function downgradedClaimForUncertainty(uncertainty) {
  if (uncertainty >= 0.45) return 'context only';
  if (uncertainty >= 0.25) return 'weak supporting context';
  return 'stable background context';
}

function summarizeCards(cards) {
  const quarantined = cards.filter((card) => card.feverLure?.state === 'quarantine').length;
  const held = cards.filter((card) => card.oidPilgrimage?.finalState !== 'reportable-context').length;
  const reportable = cards.length - held;
  return `${cards.length} passive observations processed: ${quarantined} quarantined, ${held} held, ${reportable} reportable as background context.`;
}

function normalizeTokens(tokens) {
  return uniqueValues(tokens
    .map((token) => cleanString(token).toLowerCase())
    .flatMap((token) => token.split(/[^a-z0-9]+/i))
    .map((token) => token.trim())
    .filter(Boolean));
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && value !== '')));
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
}

function toInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : 0;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
