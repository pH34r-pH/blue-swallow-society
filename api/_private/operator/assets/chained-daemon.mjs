const DEFAULT_MAX_DERIVED_CLAIMS = 3;
const LURE_TOKENS = new Set(['corp', 'guest', 'redmond', 'badge', 'dead', 'drop', 'admin', 'security', 'key', 'iam']);
const IDENTITY_TOKENS = new Set(['badge', 'corp', 'redmond', 'iam', 'employee', 'person', '042']);
const AGENT_POLICY_RISK_CAPABILITIES = new Set(['shell', 'network', 'write', 'filesystem-write', 'external-message', 'send-message', 'social-post']);
const PAPER_FINANCIAL_KINDS = new Set(['paper-financial', 'paper-action', 'market-action', 'financial-action', 'treasury']);
const TIER2_SENSOR_DENIED_COLLECTION_MODES = new Set(['public-targeting', 'doxxing', 'private-feed', 'credentialed-scrape', 'greyfeed', 'redfeed']);
const SELF_PENTEST_DENIED_CAPABILITIES = Object.freeze([
  'credential-exfiltration',
  'persistence',
  'stealth-or-evasion',
  'lateral-movement',
  'public-internet-scanning',
  'third-party-targeting',
  'destructive-payloads',
]);
const SELF_PENTEST_RULES = Object.freeze([
  {
    id: 'client-secret-exposure',
    title: 'Client-visible secret or privileged token',
    severity: 'critical',
    matches: (asset) => asset.secretsInClient || asset.exposures.includes('client-secret') || asset.exposures.includes('privileged-token'),
    evidence: (asset) => `Review ${asset.evidenceRefs.join(', ') || asset.sourcePath || asset.name}: privileged material is marked client-visible.`,
    repair: 'Move the secret to server-side configuration, rotate it, and add a regression test that the client bundle cannot contain it.',
    verification: 'Search built/static client artifacts for the secret identifier and run the auth/security review tests.',
  },
  {
    id: 'unauthenticated-write-surface',
    title: 'Write-capable surface without an auth gate',
    severity: 'high',
    matches: (asset) => asset.writeCapable && !asset.authRequired,
    evidence: (asset) => `${asset.name} is marked write-capable while authRequired=false.`,
    repair: 'Require operator auth or passcode-issued bearer token before writes; keep anonymous paths read-only.',
    verification: 'Run API authorization tests that deny unauthenticated writes and allow explicitly authorized requests only.',
  },
  {
    id: 'public-admin-surface',
    title: 'Admin/control surface reachable from public network',
    severity: 'high',
    matches: (asset) => asset.adminSurface && (asset.allowedSourceIp === '*' || asset.publicNetwork),
    evidence: (asset) => `${asset.name} is an admin/control surface with public exposure (${asset.allowedSourceIp || 'publicNetwork=true'}).`,
    repair: 'Restrict ingress to owned IPs/tailnet, require auth, and document the scope exception if public reachability is intentional.',
    verification: 'Review IaC/effective rules and run allowed/denied source checks for the control endpoint.',
  },
  {
    id: 'missing-human-review-gate',
    title: 'Non-investment action path lacks human-review gate',
    severity: 'medium',
    matches: (asset) => asset.actionCapable && !asset.reviewRequired && !isAuthorizedAutonomousInvestment(asset),
    evidence: (asset) => `${asset.name} can propose or perform non-investment actions but reviewRequired=false.`,
    repair: 'Add reviewRequired=true unless the action is an explicitly autonomous, risk-policy-bound Mosaic/Murmurs investment surface.',
    verification: 'Run governance tests that distinguish autonomous investments from review-gated tool, write, spend, and actuation paths.',
  },
  {
    id: 'missing-security-headers',
    title: 'Web surface missing baseline browser security headers',
    severity: 'medium',
    matches: (asset) => asset.kind === 'web' && !asset.securityHeaders.includes('content-security-policy'),
    evidence: (asset) => `${asset.name} is a web surface without an explicit Content-Security-Policy marker.`,
    repair: 'Add a restrictive CSP and same-origin network defaults before enabling privileged UI surfaces.',
    verification: 'Run static web config tests and a rendered browser smoke test for same-origin API behavior.',
  },
  {
    id: 'unbounded-private-retention',
    title: 'Private/local evidence lacks retention boundary',
    severity: 'medium',
    matches: (asset) => asset.privateEvidence && !asset.retentionPolicy,
    evidence: (asset) => `${asset.name} stores or derives private/local evidence without a retentionPolicy marker.`,
    repair: 'Add retention class, TTL, redaction path, and cleanup test before the evidence can leave local draft state.',
    verification: 'Run retention cleanup tests and inspect the report manifest for privacy class plus TTL.',
  },
  {
    id: 'prompt-tool-policy-overreach',
    title: 'Prompt/tool policy allows risky tools without review',
    severity: 'high',
    matches: (asset) => isAgentPolicyAsset(asset) && asset.toolCapabilities.some((capability) => AGENT_POLICY_RISK_CAPABILITIES.has(capability)) && !asset.reviewRequired,
    evidence: (asset) => `${asset.name} exposes ${asset.toolCapabilities.join(', ')} without reviewRequired=true.`,
    repair: 'Require explicit human review for shell, network, write, and external-message tool paths; deny risky tools by default for scheduled runs.',
    verification: 'Run tool-policy regression tests proving risky tools are unavailable until a reviewed warrant grants them.',
  },
  {
    id: 'paper-action-without-paper-only-gate',
    title: 'Paper/financial action surface is not isolated to paper execution',
    severity: 'high',
    matches: (asset) => isPaperFinancialAsset(asset) && !asset.paperOnly,
    evidence: (asset) => `${asset.name} is financial/action-capable with paperOnly=${asset.paperOnly}.`,
    repair: 'Mark the surface paperOnly=true and block real-money/account-bound writes until a separate autonomous-capital policy authorizes them.',
    verification: 'Run governance tests that paper actions cannot emit real-money execution payloads.',
  },
  {
    id: 'autonomous-investment-without-risk-policy',
    title: 'Autonomous investment surface lacks a bounded risk policy',
    severity: 'high',
    matches: (asset) => isPaperFinancialAsset(asset) && asset.autonomousInvestment && !asset.riskPolicyBound,
    evidence: (asset) => `${asset.name} is autonomousInvestment=true with riskPolicyBound=${asset.riskPolicyBound}.`,
    repair: 'Attach an explicit capital, exposure, drawdown, stale-data, and execution policy; autonomy does not require per-action human review.',
    verification: 'Run governance tests proving autonomous investment remains bounded by machine-enforced risk and idempotent execution controls.',
  },
]);

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

export function buildSelfPentestWarrant({
  warrantId = '',
  purpose = 'self-pentest/report-and-repair drill',
  allowedAssetIds = [],
  allowedTargets = [],
  deniedAssetIds = [],
  networkMode = 'none',
  writeMode = 'report-artifacts-only',
  maxFindings = 8,
  operator = 'local-operator',
} = {}, { now = Date.now() } = {}) {
  const day = new Date(now).toISOString().slice(0, 10);
  return {
    warrantId: cleanString(warrantId) || `bss:self-pentest:${day}:${fnv1aHex(`${day}:${purpose}:${operator}`).slice(0, 8)}`,
    issuedAt: new Date(now).toISOString(),
    operator: cleanString(operator) || 'local-operator',
    purpose: cleanString(purpose) || 'self-pentest/report-and-repair drill',
    allowedAssetIds: normalizeStringArray(allowedAssetIds),
    deniedAssetIds: normalizeStringArray(deniedAssetIds),
    allowedTargets: normalizeStringArray(allowedTargets),
    networkMode: cleanString(networkMode) || 'none',
    writeMode: cleanString(writeMode) || 'report-artifacts-only',
    maxFindings: Math.max(1, toInteger(maxFindings) || 8),
    deniedCapabilities: SELF_PENTEST_DENIED_CAPABILITIES.slice(),
    requiredOutputs: ['self_pentest_report', 'repair_ticket_per_finding', 'retest_result_per_repair'],
  };
}

export function buildChainedDaemonSelfPentestRun({ warrant, assets = [], repairs = [] } = {}, { now = Date.now() } = {}) {
  const scope = buildSelfPentestWarrant(warrant || {}, { now });
  const normalizedAssets = normalizeSelfPentestAssets(assets);
  const repairRecords = new Map(normalizeRepairs(repairs).map((repair) => [repair.findingKey, repair]));
  const policyBlocks = buildSelfPentestPolicyBlocks(scope, normalizedAssets);
  const warrantCleared = policyBlocks.length === 0;
  const attempts = normalizedAssets.map((asset) => buildSelfPentestAttempt(asset, scope, policyBlocks));
  const findings = warrantCleared ? normalizedAssets
    .filter((asset) => isAssetInSelfPentestScope(asset, scope))
    .flatMap((asset) => SELF_PENTEST_RULES
      .filter((rule) => rule.matches(asset))
      .map((rule) => buildSelfPentestFinding(rule, asset, scope, repairRecords, now)))
    .sort((left, right) => severityScore(right.severity) - severityScore(left.severity) || left.assetId.localeCompare(right.assetId))
    .slice(0, scope.maxFindings) : [];
  const repairTickets = findings.map((finding) => buildRepairTicketForFinding(finding, now));

  return {
    ok: policyBlocks.length === 0,
    runId: `bss:self-pentest-run:${new Date(now).toISOString().slice(0, 10)}:${fnv1aHex(`${scope.warrantId}:${normalizedAssets.length}`).slice(0, 8)}`,
    generatedAt: new Date(now).toISOString(),
    warrant: scope,
    policyBlocks,
    budget: {
      model: 'chained-daemon/local-adversarial-review',
      network: scope.networkMode !== 'none' && warrantCleared,
      writes: scope.writeMode,
      deniedCapabilities: scope.deniedCapabilities,
      activeExploitation: false,
      credentialAccess: false,
    },
    loopOrder: [
      'scope-warrant',
      'asset-snapshot',
      'chained-daemon-adversarial-hypotheses',
      'deterministic-safety-rules',
      'finding-report',
      'repair-ticket',
      'retest-gate',
    ],
    assets: normalizedAssets,
    attempts,
    findings,
    repairTickets,
    summary: summarizeSelfPentestRun(normalizedAssets, findings, repairTickets, policyBlocks),
  };
}

export function buildTier2SensorFleetManifest({ sensors = [], operator = 'local-operator' } = {}, { now = Date.now() } = {}) {
  const generatedAt = new Date(now).toISOString();
  const normalizedSensors = normalizeTier2Sensors(sensors);
  const policyBlocks = normalizedSensors.flatMap((sensor) => buildTier2SensorPolicyBlocks(sensor));
  const policyBlocksBySensor = groupBlocksBySensor(policyBlocks);
  const sensorsWithStatus = normalizedSensors.map((sensor) => ({
    ...sensor,
    status: sensor.enabled ? policyBlocksBySensor.has(sensor.id) ? 'blocked' : 'enabled' : 'disabled',
  }));
  const enabledSensors = sensorsWithStatus.filter((sensor) => sensor.status === 'enabled');

  return {
    ok: policyBlocks.length === 0,
    lane: 'S2-A',
    manifestId: `bss:tier2-sensor-fleet:${generatedAt.slice(0, 10)}:${fnv1aHex(`${generatedAt}:${operator}:${normalizedSensors.length}`).slice(0, 8)}`,
    generatedAt,
    operator: cleanString(operator) || 'local-operator',
    budget: {
      network: false,
      writes: 'local-retained-evidence-only',
      externalTargets: false,
      accountBoundWrites: false,
      identityEnrichment: false,
    },
    sensors: sensorsWithStatus,
    enabledSensors,
    policyBlocks,
    summary: summarizeTier2SensorFleet(sensorsWithStatus, policyBlocks),
  };
}

export function buildRepairRegressionLoop({ selfPentestRun, repairs = [] } = {}, { now = Date.now() } = {}) {
  const run = selfPentestRun || buildChainedDaemonSelfPentestRun({}, { now });
  const normalizedRepairs = normalizeRepairs(repairs);
  const repairRecords = new Map(normalizedRepairs.map((repair) => [repair.findingKey, repair]));
  const ticketsByFindingKey = new Map((Array.isArray(run.repairTickets) ? run.repairTickets : []).map((ticket) => [ticket.findingKey, ticket]));
  const records = (Array.isArray(run.findings) ? run.findings : []).map((finding) => {
    const repair = repairRecords.get(finding.findingKey) || normalizeRepairFromFinding(finding);
    const evaluation = evaluateRepairRegression(finding, repair);
    const ticket = ticketsByFindingKey.get(finding.findingKey);
    return {
      findingId: finding.findingId,
      findingKey: finding.findingKey,
      assetId: finding.assetId,
      severity: finding.severity,
      ticketId: ticket?.ticketId || '',
      status: evaluation.status,
      patchRefs: repair.patchRefs || [],
      testRefs: repair.testRefs || [],
      retestResult: repair.retestResult || '',
      missingEvidence: evaluation.missingEvidence,
      residualRisk: evaluation.residualRisk,
      blocksPromotion: evaluation.blocksPromotion,
      retestGate: ticket?.retestGate || finding.repair?.verification || '',
    };
  });
  const policyBlocks = records
    .filter((record) => !record.ticketId)
    .map((record) => ({ gate: 'repair-ticket', state: 'blocked', findingKey: record.findingKey, reason: 'self-pentest finding lacks repair ticket' }));
  const blockers = records.filter((record) => record.blocksPromotion);

  return {
    ok: policyBlocks.length === 0 && blockers.length === 0,
    lane: 'S2-C',
    generatedAt: new Date(now).toISOString(),
    selfPentestRunId: run.runId || '',
    records,
    policyBlocks,
    promotion: {
      blocked: blockers.length > 0,
      blockers: blockers.map((record) => record.findingKey),
    },
    summary: summarizeRepairRegressionLoop(records, blockers, policyBlocks),
  };
}

export function buildTier2SplitState({ sensors = [], selfPentest = {}, repairs = [] } = {}, { now = Date.now() } = {}) {
  const sensorFleet = buildTier2SensorFleetManifest({ sensors, operator: selfPentest?.warrant?.operator }, { now });
  const selfPentestRun = selfPentest?.run || buildChainedDaemonSelfPentestRun({ ...selfPentest, repairs: selfPentest.repairs || repairs }, { now });
  const repairLoop = buildRepairRegressionLoop({ selfPentestRun, repairs: repairs.length ? repairs : selfPentest.repairs || [] }, { now });
  const lanes = [
    {
      id: 'S2-A',
      name: 'Expanded Local Sensor Fleet',
      status: sensorFleet.ok ? 'ready' : 'blocked',
      blockers: sensorFleet.policyBlocks.map((block) => `${block.sensorId}:${block.gate}`),
    },
    {
      id: 'S2-B',
      name: 'Breach Mirror Self-Pentest',
      status: selfPentestRun.ok ? 'ready' : 'blocked',
      blockers: selfPentestRun.policyBlocks.map((block) => block.gate),
    },
    {
      id: 'S2-C',
      name: 'Repair / Regression Loop',
      status: repairLoop.ok ? 'ready' : 'blocked',
      blockers: repairLoop.promotion.blockers.concat(repairLoop.policyBlocks.map((block) => block.findingKey)),
    },
  ];
  const ok = lanes.every((lane) => lane.status === 'ready');

  return {
    ok,
    generatedAt: new Date(now).toISOString(),
    lanes,
    sensorFleet,
    selfPentestRun,
    repairLoop,
    summary: ok
      ? `Tier 2 split ready: ${sensorFleet.enabledSensors.length} enabled local sensor(s), ${selfPentestRun.findings.length} Breach Mirror finding(s), ${repairLoop.records.length} repair record(s).`
      : `Tier 2 split blocked: ${lanes.filter((lane) => lane.status === 'blocked').map((lane) => lane.id).join(', ')}.` ,
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

function normalizeTier2Sensors(sensors) {
  return (Array.isArray(sensors) ? sensors : [])
    .map((sensor, index) => normalizeTier2Sensor(sensor, index))
    .filter(Boolean);
}

function normalizeTier2Sensor(sensor, index) {
  if (!sensor || typeof sensor !== 'object') {
    return null;
  }
  return {
    id: cleanString(sensor.id || sensor.sensorId || sensor.name) || `tier2-sensor-${index + 1}`,
    name: cleanString(sensor.name || sensor.label || sensor.id) || `Tier 2 sensor ${index + 1}`,
    kind: cleanString(sensor.kind || sensor.type) || 'local-sensor',
    enabled: sensor.enabled === true,
    owned: sensor.owned === true,
    authorized: sensor.authorized === true,
    optIn: sensor.optIn === true || sensor.opt_in === true,
    localOnly: sensor.localOnly === true || sensor.local_only === true,
    visibleIndicator: sensor.visibleIndicator === true || sensor.visible_indicator === true,
    retentionPolicy: cleanString(sensor.retentionPolicy || sensor.retention_policy || sensor.retention),
    collectionModes: normalizeStringArray(sensor.collectionModes || sensor.collection_modes || sensor.modes).map((mode) => mode.toLowerCase()),
    evidenceRefs: normalizeStringArray(sensor.evidenceRefs || sensor.evidence || sensor.refs),
    raw: sensor,
  };
}

function buildTier2SensorPolicyBlocks(sensor) {
  if (!sensor.enabled) {
    return [];
  }
  const blocks = [];
  if (!sensor.owned || !sensor.authorized) {
    blocks.push(sensorPolicyBlock(sensor, 'scope', 'sensor must be owned and explicitly authorized'));
  }
  if (!sensor.optIn) {
    blocks.push(sensorPolicyBlock(sensor, 'opt-in', 'expanded local sensors require explicit opt-in'));
  }
  if (!sensor.localOnly) {
    blocks.push(sensorPolicyBlock(sensor, 'local-only', 'S2-A sensor collection is local-only by default'));
  }
  if (!sensor.visibleIndicator) {
    blocks.push(sensorPolicyBlock(sensor, 'visible-indicator', 'enabled sensors need a visible collection indicator'));
  }
  if (!sensor.retentionPolicy) {
    blocks.push(sensorPolicyBlock(sensor, 'retention-policy', 'enabled sensors need a retention class or TTL'));
  }
  const deniedModes = sensor.collectionModes.filter((mode) => TIER2_SENSOR_DENIED_COLLECTION_MODES.has(mode));
  if (deniedModes.length) {
    blocks.push(sensorPolicyBlock(sensor, 'collection-mode', `denied collection modes: ${deniedModes.join(', ')}`));
  }
  return blocks;
}

function sensorPolicyBlock(sensor, gate, reason) {
  return {
    gate,
    state: 'blocked',
    sensorId: sensor.id,
    sensorName: sensor.name,
    reason,
  };
}

function groupBlocksBySensor(blocks) {
  const grouped = new Map();
  blocks.forEach((block) => {
    if (!grouped.has(block.sensorId)) {
      grouped.set(block.sensorId, []);
    }
    grouped.get(block.sensorId).push(block);
  });
  return grouped;
}

function summarizeTier2SensorFleet(sensors, policyBlocks) {
  const enabled = sensors.filter((sensor) => sensor.status === 'enabled').length;
  const blocked = sensors.filter((sensor) => sensor.status === 'blocked').length;
  const disabled = sensors.filter((sensor) => sensor.status === 'disabled').length;
  return `S2-A sensor fleet: ${enabled} enabled, ${blocked} blocked, ${disabled} disabled; ${policyBlocks.length} gate(s) active.`;
}

function isAgentPolicyAsset(asset) {
  return asset.kind === 'agent-policy' || asset.tags.includes('agent-policy') || asset.toolCapabilities.length > 0;
}

function isPaperFinancialAsset(asset) {
  return PAPER_FINANCIAL_KINDS.has(asset.kind) || asset.tags.some((tag) => PAPER_FINANCIAL_KINDS.has(tag)) || asset.instrumentType || asset.paperActionCapable;
}

function isAuthorizedAutonomousInvestment(asset) {
  return isPaperFinancialAsset(asset) && asset.autonomousInvestment && asset.riskPolicyBound;
}

function normalizeSelfPentestAssets(assets) {
  return (Array.isArray(assets) ? assets : [])
    .map((asset, index) => normalizeSelfPentestAsset(asset, index))
    .filter(Boolean);
}

function normalizeSelfPentestAsset(asset, index) {
  if (!asset || typeof asset !== 'object') {
    return null;
  }
  const name = cleanString(asset.name || asset.title || asset.path || asset.url) || `asset-${index + 1}`;
  return {
    id: cleanString(asset.id || asset.assetId || asset.path || asset.url) || `asset-${index + 1}`,
    name,
    kind: cleanString(asset.kind || asset.type) || 'service',
    sourcePath: cleanString(asset.sourcePath || asset.path),
    evidenceRefs: normalizeStringArray(asset.evidenceRefs || asset.evidence || asset.refs),
    tags: normalizeStringArray(asset.tags).map((tag) => tag.toLowerCase()),
    exposures: normalizeStringArray(asset.exposures || asset.exposure).map((exposure) => exposure.toLowerCase()),
    owned: asset.owned === true,
    authorized: asset.authorized === true,
    authRequired: asset.authRequired === true,
    writeCapable: asset.writeCapable === true,
    actionCapable: asset.actionCapable === true,
    reviewRequired: asset.reviewRequired === true || asset.human_review_required === true,
    paperOnly: asset.paperOnly === true || asset.paper_only === true,
    autonomousInvestment: asset.autonomousInvestment === true || asset.autonomous_investment === true,
    riskPolicyBound: asset.riskPolicyBound === true || asset.risk_policy_bound === true,
    paperActionCapable: asset.paperActionCapable === true || asset.paper_action_capable === true,
    instrumentType: cleanString(asset.instrumentType || asset.instrument_type),
    toolCapabilities: normalizeStringArray(asset.toolCapabilities || asset.tool_capabilities || asset.capabilities).map((capability) => capability.toLowerCase()),
    adminSurface: asset.adminSurface === true,
    publicNetwork: asset.publicNetwork === true,
    allowedSourceIp: cleanString(asset.allowedSourceIp || asset.allowed_source_ip),
    secretsInClient: asset.secretsInClient === true || asset.secretInClient === true,
    privateEvidence: asset.privateEvidence === true,
    retentionPolicy: cleanString(asset.retentionPolicy || asset.retention_class || asset.retention),
    securityHeaders: normalizeStringArray(asset.securityHeaders || asset.headers).map((header) => header.toLowerCase()),
    raw: asset,
  };
}

function normalizeRepairs(repairs) {
  return (Array.isArray(repairs) ? repairs : [])
    .map((repair) => ({
      findingKey: cleanString(repair?.findingKey || repair?.finding_key || repair?.key),
      status: cleanString(repair?.status).toLowerCase(),
      patchRefs: normalizeStringArray(repair?.patchRefs || repair?.patch_refs || repair?.patches),
      testRefs: normalizeStringArray(repair?.testRefs || repair?.test_refs || repair?.tests),
      retestResult: cleanString(repair?.retestResult || repair?.retest_result).toLowerCase(),
      residualRiskAccepted: repair?.residualRiskAccepted === true || repair?.residual_risk_accepted === true,
      acceptedBy: cleanString(repair?.acceptedBy || repair?.accepted_by),
      reason: cleanString(repair?.reason || repair?.acceptanceReason || repair?.acceptance_reason),
    }))
    .filter((repair) => repair.findingKey);
}

function buildSelfPentestPolicyBlocks(warrant, assets = []) {
  const blocks = [];
  if (warrant.writeMode !== 'report-artifacts-only') {
    blocks.push({ gate: 'write-mode', state: 'blocked', reason: 'self-pentest may only write report artifacts and repair tickets' });
  }
  if (warrant.networkMode !== 'none') {
    blocks.push({ gate: 'network-mode', state: 'blocked', reason: 'self-pentest network execution is disabled until an explicit owned-target active-review gate exists' });
  }

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const assetId of warrant.allowedAssetIds) {
    const asset = assetsById.get(assetId);
    if (!asset) {
      blocks.push({
        gate: 'scope-asset',
        state: 'blocked',
        assetId,
        reason: 'self-pentest warrant names an asset that is absent from the reviewed asset inventory',
      });
      continue;
    }
    if (!asset.owned || !asset.authorized) {
      blocks.push({
        gate: 'scope-ownership',
        state: 'blocked',
        assetId: asset.id,
        reason: 'self-pentest assets must be explicitly marked owned=true and authorized=true before review can proceed',
      });
    }
  }
  return blocks;
}

function buildSelfPentestAttempt(asset, warrant, policyBlocks) {
  const inScope = isAssetInSelfPentestScope(asset, warrant);
  return {
    assetId: asset.id,
    assetName: asset.name,
    inScope,
    mode: 'static-config-and-canary-review',
    status: policyBlocks.length ? 'blocked-by-warrant' : inScope ? 'evaluated' : 'blocked-out-of-scope',
    evaluatedRules: inScope && !policyBlocks.length ? SELF_PENTEST_RULES.map((rule) => rule.id) : [],
    deniedCapabilities: warrant.deniedCapabilities,
    note: 'Chained daemon proposes adversarial hypotheses; deterministic rules produce reportable findings. No exploit payload, credential access, persistence, or third-party probing is executed.',
  };
}

function isAssetInSelfPentestScope(asset, warrant) {
  if (!asset.owned || !asset.authorized) return false;
  if (warrant.deniedAssetIds.includes(asset.id)) return false;
  if (warrant.allowedAssetIds.length && !warrant.allowedAssetIds.includes(asset.id)) return false;
  return true;
}

function buildSelfPentestFinding(rule, asset, warrant, repairRecords, now) {
  const findingKey = `${rule.id}:${asset.id}`;
  const repairRecord = repairRecords.get(findingKey);
  const repairStatus = repairStatusForRecord(repairRecord);
  return {
    findingId: `bss:self-pentest-finding:${new Date(now).toISOString().slice(0, 10)}:${fnv1aHex(findingKey).slice(0, 10)}`,
    findingKey,
    ruleId: rule.id,
    assetId: asset.id,
    assetName: asset.name,
    title: rule.title,
    severity: rule.severity,
    compromiseState: 'simulated_or_unexploited',
    scopeWarrant: warrant.warrantId,
    evidence: {
      type: 'static-config-or-canary-proof',
      refs: asset.evidenceRefs.length ? asset.evidenceRefs : [asset.sourcePath || asset.id],
      text: rule.evidence(asset),
    },
    repair: {
      status: repairStatus,
      recommendedAction: rule.repair,
      verification: rule.verification,
      evidence: repairRecord ? repairEvidenceForRecord(repairRecord) : null,
    },
    deniedCapabilities: warrant.deniedCapabilities,
  };
}

function buildRepairTicketForFinding(finding, now) {
  return {
    ticketId: `bss:repair:${new Date(now).toISOString().slice(0, 10)}:${fnv1aHex(finding.findingId).slice(0, 10)}`,
    findingId: finding.findingId,
    findingKey: finding.findingKey,
    assetId: finding.assetId,
    severity: finding.severity,
    status: repairTicketStatus(finding.repair.status),
    repairAction: finding.repair.recommendedAction,
    retestGate: finding.repair.verification,
    blocksPromotion: !['verified', 'accepted_residual_risk'].includes(finding.repair.status) && ['critical', 'high'].includes(finding.severity),
  };
}

function repairStatusForRecord(repair) {
  if (isVerifiedRepair(repair)) return 'verified';
  if (isAcceptedResidualRisk(repair)) return 'accepted_residual_risk';
  return 'repair_required';
}

function repairTicketStatus(status) {
  if (status === 'verified') return 'verified';
  if (status === 'accepted_residual_risk') return 'accepted_residual_risk';
  return 'open';
}

function repairEvidenceForRecord(repair) {
  return {
    patchRefs: repair.patchRefs,
    testRefs: repair.testRefs,
    retestResult: repair.retestResult,
    residualRiskAccepted: repair.residualRiskAccepted,
    acceptedBy: repair.acceptedBy,
    reason: repair.reason,
  };
}

function normalizeRepairFromFinding(finding) {
  const evidence = finding.repair?.evidence || {};
  return {
    findingKey: finding.findingKey,
    status: cleanString(finding.repair?.status).toLowerCase(),
    patchRefs: normalizeStringArray(evidence.patchRefs || evidence.patch_refs),
    testRefs: normalizeStringArray(evidence.testRefs || evidence.test_refs),
    retestResult: cleanString(evidence.retestResult || evidence.retest_result).toLowerCase(),
    residualRiskAccepted: evidence.residualRiskAccepted === true || evidence.residual_risk_accepted === true,
    acceptedBy: cleanString(evidence.acceptedBy || evidence.accepted_by),
    reason: cleanString(evidence.reason),
  };
}

function evaluateRepairRegression(finding, repair) {
  const missingEvidence = [];
  if (repair.status === 'verified') {
    if (!repair.patchRefs?.length) missingEvidence.push('patchRefs');
    if (!repair.testRefs?.length) missingEvidence.push('testRefs');
    if (repair.retestResult !== 'pass') missingEvidence.push('retestResult=pass');
  }
  if (repair.status === 'accepted_residual_risk') {
    if (!repair.residualRiskAccepted) missingEvidence.push('residualRiskAccepted');
    if (!repair.acceptedBy) missingEvidence.push('acceptedBy');
    if (!repair.reason) missingEvidence.push('reason');
  }

  if (isVerifiedRepair(repair)) {
    return { status: 'verified', missingEvidence, residualRisk: false, blocksPromotion: false };
  }
  if (isAcceptedResidualRisk(repair)) {
    return { status: 'accepted_residual_risk', missingEvidence, residualRisk: true, blocksPromotion: false };
  }
  const blocksPromotion = ['critical', 'high'].includes(finding.severity);
  return { status: 'open', missingEvidence, residualRisk: false, blocksPromotion };
}

function isVerifiedRepair(repair) {
  return Boolean(repair)
    && repair.status === 'verified'
    && repair.patchRefs.length > 0
    && repair.testRefs.length > 0
    && repair.retestResult === 'pass';
}

function isAcceptedResidualRisk(repair) {
  return Boolean(repair)
    && repair.status === 'accepted_residual_risk'
    && repair.residualRiskAccepted
    && Boolean(repair.acceptedBy)
    && Boolean(repair.reason);
}

function summarizeSelfPentestRun(assets, findings, repairTickets, policyBlocks) {
  if (policyBlocks.length) {
    return `Self-pentest blocked by ${policyBlocks.length} warrant gate(s); no active compromise attempt executed.`;
  }
  const openCriticalHigh = repairTickets.filter((ticket) => ticket.blocksPromotion).length;
  return `${assets.length} owned assets reviewed; ${findings.length} simulated compromise finding(s); ${repairTickets.length} repair ticket(s); ${openCriticalHigh} critical/high gate(s) still block promotion.`;
}

function summarizeRepairRegressionLoop(records, blockers, policyBlocks) {
  if (policyBlocks.length) {
    return `S2-C repair loop blocked by ${policyBlocks.length} missing repair-ticket gate(s).`;
  }
  return `S2-C repair loop: ${records.length} record(s), ${blockers.length} promotion blocker(s), ${records.filter((record) => record.status === 'verified').length} verified repair(s).`;
}

function severityScore(severity) {
  return ({ critical: 4, high: 3, medium: 2, low: 1 })[severity] || 0;
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

function normalizeStringArray(value) {
  const values = Array.isArray(value) ? value : cleanString(value) ? [value] : [];
  return uniqueValues(values
    .map((item) => cleanString(item))
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
