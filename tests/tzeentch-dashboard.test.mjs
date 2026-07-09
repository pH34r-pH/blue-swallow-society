import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSparklinePath, buildTzeentchDashboardModel, createDemoDashboardDataset } from '../app/tzeentch-dashboard.mjs';

test('buildTzeentchDashboardModel shapes the Murmurs, Crypto, Polymarket, and Actionable Intel tabs', () => {
  const now = Date.parse('2026-07-09T12:00:00Z');
  const raw = createDemoDashboardDataset(now);
  const model = buildTzeentchDashboardModel(raw, { now });

  assert.equal(model.publicOnly, true);
  assert.ok(model.accessNotes.some((note) => /public feeds/i.test(note)));
  assert.ok(model.accessNotes.some((note) => /on-behalf-of/i.test(note)));
  assert.equal(model.murmurs.items.length, 6);
  assert.equal(model.crypto.assets.length, 10);
  assert.equal(model.crypto.views['24h'].assets.length, 10);
  assert.equal(model.crypto.views['5d'].assets.length, 10);
  assert.equal(model.polymarket.newMarkets.length, 2);
  assert.equal(model.polymarket.resolvedMarkets.length, 2);
  assert.ok(model.actionable.proposals.some((proposal) => proposal.side === 'buy'));
  assert.ok(model.actionable.proposals.some((proposal) => proposal.side === 'sell'));
  assert.ok(model.murmurs.hero.viralityScore >= 0);
  assert.ok(model.crypto.views['24h'].assets[0].sparkline.line.length > 0);
  assert.ok(model.crypto.views['5d'].assets[0].sparkline.fill.length > 0);
});

test('buildSparklinePath returns svg path data for a simple series', () => {
  const sparkline = buildSparklinePath([
    { t: 1, p: 10 },
    { t: 2, p: 15 },
    { t: 3, p: 12 },
  ]);

  assert.match(sparkline.line, /^M /);
  assert.match(sparkline.fill, / Z$/);
});
