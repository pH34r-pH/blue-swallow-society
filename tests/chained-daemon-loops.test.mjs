import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChainedDaemonLoopState,
  buildLoopBudget,
} from '../app/chained-daemon.mjs';
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
