import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSparklinePath, buildTzeentchDashboardModel } from '../app/tzeentch-dashboard.mjs';
import { createDemoDashboardDataset } from './fixtures/tzeentch-demo-data.mjs';

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
  assert.equal(model.chainedDaemon.loopOrder.length, 5);
  assert.ok(model.chainedDaemon.cards.some((card) => card.feverLure.state === 'quarantine'));
  assert.ok(model.chainedDaemon.cards.every((card) => card.claim.type !== 'identity-attribution'));
  assert.ok(model.actionable.proposals.some((proposal) => proposal.side === 'buy'));
  assert.ok(model.actionable.proposals.some((proposal) => proposal.side === 'sell'));
  assert.ok(model.murmurs.hero.viralityScore >= 0);
  assert.ok(model.crypto.views['24h'].assets[0].sparkline.line.length > 0);
  assert.ok(model.crypto.views['5d'].assets[0].sparkline.fill.length > 0);
});

test('buildTzeentchDashboardModel threads paper books into Actionable Intel', () => {
  const now = Date.parse('2026-07-09T12:00:00Z');
  const raw = createDemoDashboardDataset(now);
  raw.paperBooks = {
    updatedAt: '2026-07-09T12:00:00Z',
    paperOnly: true,
    summary: '3 paper books running in parallel against public feeds.',
    benchmark: { label: 'BTC 24h proxy', returnPct: 2.5 },
    books: [
      {
        id: 'murmur-momentum',
        name: 'Murmur Momentum',
        account: 'paper-momentum-001',
        strategy: 'Buy high-volume crypto assets showing positive public-feed momentum.',
        equity: 10325,
        totalPnl: 325,
        totalReturnPct: 3.25,
        benchmarkReturnPct: 2.5,
        alphaPct: 0.75,
        cash: 8125,
        positions: [{ title: 'Bitcoin', symbol: 'BTC', gainPct: 1.9, marketValue: 2200 }],
        pendingOrders: [{ title: 'Bitcoin', actionText: 'Paper buy', reason: 'Momentum score 4.2' }],
      },
    ],
  };

  const model = buildTzeentchDashboardModel(raw, { now });

  assert.equal(model.paperBooks.books.length, 1);
  assert.equal(model.paperBooks.books[0].returnLabel, '+3.25%');
  assert.ok(model.actionable.paperBooks.books.length > 0);
  assert.ok(model.actionable.proposals.some((proposal) => proposal.instrumentType === 'paper-book'));
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
