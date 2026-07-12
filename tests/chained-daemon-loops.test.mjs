import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChainedDaemonLoopState,
  buildChainedDaemonSelfPentestRun,
  buildLoopBudget,
  buildRepairRegressionLoop,
  buildSelfPentestWarrant,
  buildTier2SensorFleetManifest,
  buildTier2SplitState,
} from '../app/operator/chained-daemon.mjs';
import { createDemoChainedDaemonObservations } from './fixtures/tzeentch-demo-data.mjs';

const NOW = Date.parse('2026-07-10T12:00:00Z');

test('buildLoopBudget defaults to a local-only bounded report budget', () => {
  const budget = buildLoopBudget({ observations: createDemoChainedDaemonObservations() });

  assert.equal(budget.network, false);
  assert.equal(budget.identityEnrichment, false);
  assert.equal(budget.offensiveActions, false);
  assert.equal(budget.writes, 'report-artifacts-only');
  assert.equal(budget.maxDerivedClaimsPerLoop, 3);
  assert.equal(budget.observations, 5);
});

test('buildChainedDaemonLoopState composes OID, rain-cov, fever-lure, IAM, and spore loops', () => {
  const state = buildChainedDaemonLoopState(createDemoChainedDaemonObservations(), { now: NOW });

  assert.equal(state.ok, true);
  assert.equal(state.loopOrder.length, 5);
  assert.deepEqual(state.loopOrder, [
    'oid-pilgrimage',
    'rain-cov-shoreline',
    'fever-lure-quarantine',
    'negative-space-iam-confessional',
    'spore-ledger',
  ]);
  assert.equal(state.cards.length, 5);
  assert.ok(state.cards.every((card) => card.oid.startsWith('bss:cd:2026-07-10:')));
  assert.ok(state.cards.every((card) => card.provenance.raw === true));
  assert.ok(state.cards.every((card) => card.claim.type !== 'identity-attribution'));
});

test('Fever-Lure and Rain-Cov hold tempting one-off identity-adjacent observations', () => {
  const state = buildChainedDaemonLoopState(createDemoChainedDaemonObservations(), { now: NOW });
  const badge = state.cards.find((card) => card.sourceId === 'obs-ble-002');

  assert.equal(badge.feverLure.state, 'quarantine');
  assert.equal(badge.feverLure.score, 6);
  assert.equal(badge.rainCov.tideMark, 'tidebreak');
  assert.equal(badge.rainCov.uncertainty, 0.95);
  assert.equal(badge.oidPilgrimage.finalState, 'bound-imp-held');
  assert.match(badge.safeNextStep, /repeat walk|independent passive source/i);
});

test('Negative-Space IAM blocks org/person/account claims and emits safe passive-string claims', () => {
  const state = buildChainedDaemonLoopState(createDemoChainedDaemonObservations(), { now: NOW });
  const confessions = state.loops.negativeSpaceIam.outputs;

  assert.equal(confessions.length, 2);
  assert.ok(confessions.some((entry) => entry.sourceId === 'obs-wifi-001'));
  assert.ok(confessions.some((entry) => entry.sourceId === 'obs-ble-002'));
  assert.ok(confessions.every((entry) => entry.state === 'confess-and-redact'));
  assert.ok(confessions.every((entry) => entry.safeClaim.includes('passive local')));
  assert.ok(confessions.every((entry) => entry.blockedBecauseMissing.includes('authorization to enrich PII')));
});

test('Spore Ledger only emits labeled correlation substrates, never attribution claims', () => {
  const state = buildChainedDaemonLoopState(createDemoChainedDaemonObservations(), { now: NOW });
  const spore = state.loops.sporeLedger.outputs;

  assert.equal(spore.length, 3);
  assert.equal(spore[0].cluster, 'route:bellevue-transit-loop');
  assert.equal(spore[0].growth, 'mycelium');
  assert.ok(spore.every((entry) => entry.claim.type === 'correlation-substrate'));
  assert.ok(spore.every((entry) => /not an identity\/location attribution/i.test(entry.claim.text)));
});

test('report cards promote stable background context but never harden single passive observations', () => {
  const state = buildChainedDaemonLoopState(createDemoChainedDaemonObservations(), { now: NOW });
  const publicWifi = state.cards.find((card) => card.sourceId === 'obs-wifi-003');
  const corpGuest = state.cards.find((card) => card.sourceId === 'obs-wifi-001');

  assert.equal(publicWifi.oidPilgrimage.finalState, 'reportable-context');
  assert.equal(publicWifi.claim.text, 'Stable background passive context observed; no identity inference attached.');
  assert.equal(corpGuest.oidPilgrimage.finalState, 'bound-imp-held');
  assert.equal(corpGuest.claim.text, 'Passive observation held for corroboration; no hard claim emitted.');
});

test('self-pentest warrant defaults to report-only local review with hard denied capabilities', () => {
  const warrant = buildSelfPentestWarrant({}, { now: NOW });

  assert.equal(warrant.networkMode, 'none');
  assert.equal(warrant.writeMode, 'report-artifacts-only');
  assert.ok(warrant.deniedCapabilities.includes('credential-exfiltration'));
  assert.ok(warrant.deniedCapabilities.includes('public-internet-scanning'));
  assert.deepEqual(warrant.requiredOutputs, ['self_pentest_report', 'repair_ticket_per_finding', 'retest_result_per_repair']);
});

test('self-pentest routine turns simulated compromises into findings and repair tickets', () => {
  const run = buildChainedDaemonSelfPentestRun({
    warrant: {
      allowedAssetIds: ['api-agent', 'static-app'],
      operator: 'test-operator',
    },
    assets: [
      {
        id: 'api-agent',
        name: 'Agent API',
        owned: true,
        authorized: true,
        writeCapable: true,
        authRequired: false,
        actionCapable: true,
        reviewRequired: false,
        evidenceRefs: ['api/agent/index.js', 'app/staticwebapp.config.json'],
      },
      {
        id: 'static-app',
        name: 'Static app shell',
        owned: true,
        authorized: true,
        kind: 'web',
        securityHeaders: [],
        evidenceRefs: ['app/staticwebapp.config.json'],
      },
      {
        id: 'third-party',
        name: 'External target',
        owned: false,
        authorized: false,
        writeCapable: true,
      },
    ],
  }, { now: NOW });

  assert.equal(run.ok, true);
  assert.equal(run.budget.activeExploitation, false);
  assert.equal(run.budget.credentialAccess, false);
  assert.ok(run.attempts.find((attempt) => attempt.assetId === 'third-party').status === 'blocked-out-of-scope');
  assert.ok(run.findings.some((finding) => finding.ruleId === 'unauthenticated-write-surface'));
  assert.ok(run.findings.some((finding) => finding.ruleId === 'missing-human-review-gate'));
  assert.ok(run.findings.some((finding) => finding.ruleId === 'missing-security-headers'));
  assert.equal(run.repairTickets.length, run.findings.length);
  assert.ok(run.findings.every((finding) => finding.compromiseState === 'simulated_or_unexploited'));
  assert.ok(run.repairTickets.some((ticket) => ticket.blocksPromotion));
});

test('self-pentest blocks unsafe warrant modes before active review', () => {
  const run = buildChainedDaemonSelfPentestRun({
    warrant: {
      networkMode: 'active-lab',
      writeMode: 'filesystem-write',
    },
    assets: [{ id: 'owned-service', name: 'Owned Service', owned: true, authorized: true }],
  }, { now: NOW });

  assert.equal(run.ok, false);
  assert.deepEqual(run.policyBlocks.map((block) => block.gate), ['write-mode', 'network-mode']);
  assert.equal(run.attempts[0].status, 'blocked-by-warrant');
  assert.match(run.summary, /blocked/);
});

test('self-pentest fails closed on ambiguous ownership and any active network mode', () => {
  const ambiguous = buildChainedDaemonSelfPentestRun({
    warrant: {
      allowedAssetIds: ['ambiguous-service'],
      operator: 'test-operator',
    },
    assets: [
      {
        id: 'ambiguous-service',
        name: 'Ambiguous Service',
        writeCapable: true,
        authRequired: false,
      },
    ],
  }, { now: NOW });

  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.policyBlocks[0].gate, 'scope-ownership');
  assert.equal(ambiguous.policyBlocks[0].assetId, 'ambiguous-service');
  assert.equal(ambiguous.attempts[0].status, 'blocked-by-warrant');
  assert.equal(ambiguous.findings.length, 0);

  const active = buildChainedDaemonSelfPentestRun({
    warrant: {
      networkMode: 'active-probe',
      allowedTargets: ['example.com'],
      operator: 'test-operator',
    },
    assets: [{ id: 'owned-service', name: 'Owned Service', owned: true, authorized: true }],
  }, { now: NOW });

  assert.equal(active.ok, false);
  assert.equal(active.policyBlocks[0].gate, 'network-mode');
  assert.equal(active.budget.network, false);
  assert.equal(active.attempts[0].status, 'blocked-by-warrant');
});

test('self-pentest detects prompt-tool and paper-action gate failures', () => {
  const run = buildChainedDaemonSelfPentestRun({
    warrant: {
      allowedAssetIds: ['agent-tool-policy', 'paper-action-surface'],
      operator: 'test-operator',
    },
    assets: [
      {
        id: 'agent-tool-policy',
        name: 'Agent tool policy',
        owned: true,
        authorized: true,
        kind: 'agent-policy',
        toolCapabilities: ['shell', 'network', 'external-message'],
        reviewRequired: false,
        evidenceRefs: ['app/operator/chained-daemon.mjs'],
      },
      {
        id: 'paper-action-surface',
        name: 'Paper action surface',
        owned: true,
        authorized: true,
        kind: 'paper-financial',
        actionCapable: true,
        paperOnly: false,
        reviewRequired: false,
        evidenceRefs: ['docs/mosaic-and-murmurs-operating-doctrine.md'],
      },
    ],
  }, { now: NOW });

  assert.ok(run.findings.some((finding) => finding.ruleId === 'prompt-tool-policy-overreach'));
  assert.ok(run.findings.some((finding) => finding.ruleId === 'paper-action-without-paper-only-gate'));
  assert.ok(run.repairTickets.some((ticket) => ticket.findingKey === 'paper-action-without-paper-only-gate:paper-action-surface'));
});

test('autonomous Mosaic and Murmurs investment actions do not require human review', () => {
  const run = buildChainedDaemonSelfPentestRun({
    warrant: {
      allowedAssetIds: ['autonomous-paper-treasury'],
      operator: 'test-operator',
    },
    assets: [{
      id: 'autonomous-paper-treasury',
      name: 'Mosaic and Murmurs autonomous paper treasury',
      owned: true,
      authorized: true,
      kind: 'paper-financial',
      actionCapable: true,
      paperOnly: true,
      autonomousInvestment: true,
      riskPolicyBound: true,
      reviewRequired: false,
      evidenceRefs: ['docs/mosaic-and-murmurs-operating-doctrine.md'],
    }],
  }, { now: NOW });

  assert.ok(!run.findings.some((finding) => finding.ruleId === 'missing-human-review-gate'));
  assert.ok(!run.findings.some((finding) => finding.ruleId === 'paper-action-without-paper-only-gate'));
});

test('autonomous investment actions without a risk policy remain a governance finding', () => {
  const run = buildChainedDaemonSelfPentestRun({
    warrant: {
      allowedAssetIds: ['unbounded-autonomous-treasury'],
      operator: 'test-operator',
    },
    assets: [{
      id: 'unbounded-autonomous-treasury',
      name: 'Unbounded autonomous treasury',
      owned: true,
      authorized: true,
      kind: 'paper-financial',
      actionCapable: true,
      paperOnly: true,
      autonomousInvestment: true,
      riskPolicyBound: false,
      reviewRequired: false,
    }],
  }, { now: NOW });

  assert.ok(run.findings.some((finding) => finding.ruleId === 'autonomous-investment-without-risk-policy'));
});

test('tier 2 sensor fleet keeps expanded local sensors disabled until opt-in and privacy gates pass', () => {
  const manifest = buildTier2SensorFleetManifest({
    operator: 'test-operator',
    sensors: [
      {
        id: 'owned-wifi-rssi',
        name: 'Owned Wi-Fi RSSI bridge',
        kind: 'wifi-rssi',
        enabled: true,
        owned: true,
        authorized: true,
        optIn: true,
        localOnly: true,
        visibleIndicator: true,
        retentionPolicy: 'ephemeral-24h',
        collectionModes: ['passive-local'],
      },
      {
        id: 'silent-env-probe',
        name: 'Silent environment probe',
        kind: 'environmental',
        enabled: true,
        owned: true,
        authorized: true,
        optIn: false,
        localOnly: true,
        visibleIndicator: false,
        retentionPolicy: '',
      },
    ],
  }, { now: NOW });

  assert.equal(manifest.lane, 'S2-A');
  assert.equal(manifest.ok, false);
  assert.equal(manifest.enabledSensors.length, 1);
  assert.equal(manifest.enabledSensors[0].id, 'owned-wifi-rssi');
  assert.equal(manifest.budget.network, false);
  assert.equal(manifest.budget.writes, 'local-retained-evidence-only');
  assert.ok(manifest.policyBlocks.some((block) => block.sensorId === 'silent-env-probe' && block.gate === 'opt-in'));
  assert.ok(manifest.policyBlocks.some((block) => block.sensorId === 'silent-env-probe' && block.gate === 'visible-indicator'));
  assert.ok(manifest.policyBlocks.some((block) => block.sensorId === 'silent-env-probe' && block.gate === 'retention-policy'));
});

test('repair regression loop requires patch, test, and retest evidence before clearing promotion blockers', () => {
  const run = buildChainedDaemonSelfPentestRun({
    warrant: {
      allowedAssetIds: ['api-agent'],
      operator: 'test-operator',
    },
    assets: [
      {
        id: 'api-agent',
        name: 'Agent API',
        owned: true,
        authorized: true,
        writeCapable: true,
        authRequired: false,
        evidenceRefs: ['api/agent/index.js'],
      },
    ],
  }, { now: NOW });

  const blocked = buildRepairRegressionLoop({ selfPentestRun: run }, { now: NOW });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.promotion.blocked, true);
  assert.ok(blocked.records[0].blocksPromotion);

  const repaired = buildRepairRegressionLoop({
    selfPentestRun: run,
    repairs: [
      {
        findingKey: 'unauthenticated-write-surface:api-agent',
        status: 'verified',
        patchRefs: ['api/agent/index.js'],
        testRefs: ['tests/security-review.test.mjs'],
        retestResult: 'pass',
      },
    ],
  }, { now: NOW });

  assert.equal(repaired.ok, true);
  assert.equal(repaired.promotion.blocked, false);
  assert.equal(repaired.records[0].status, 'verified');
  assert.equal(repaired.records[0].blocksPromotion, false);
});

test('tier 2 split state composes S2-A sensors, S2-B breach mirror, and S2-C repair gates', () => {
  const state = buildTier2SplitState({
    sensors: [
      {
        id: 'owned-greenfeed',
        name: 'Owned Greenfeed bridge',
        enabled: true,
        owned: true,
        authorized: true,
        optIn: true,
        localOnly: true,
        visibleIndicator: true,
        retentionPolicy: 'ephemeral-24h',
        collectionModes: ['owned-greenfeed'],
      },
    ],
    selfPentest: {
      warrant: {
        allowedAssetIds: ['static-app'],
        operator: 'test-operator',
      },
      assets: [
        {
          id: 'static-app',
          name: 'Static app shell',
          owned: true,
          authorized: true,
          kind: 'web',
          securityHeaders: ['content-security-policy'],
          evidenceRefs: ['app/staticwebapp.config.json'],
        },
      ],
    },
  }, { now: NOW });

  assert.equal(state.ok, true);
  assert.deepEqual(state.lanes.map((lane) => lane.id), ['S2-A', 'S2-B', 'S2-C']);
  assert.equal(state.lanes[0].status, 'ready');
  assert.equal(state.lanes[1].status, 'ready');
  assert.equal(state.lanes[2].status, 'ready');
  assert.match(state.summary, /Tier 2 split ready/);
});
