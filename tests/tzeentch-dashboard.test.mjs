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

test('buildTzeentchDashboardModel links crypto assets to murmur mentions from model objects', () => {
  const now = Date.parse('2026-07-09T12:00:00Z');
  const raw = {
    publicOnly: true,
    murmurs: {
      hackerNews: [
        {
          id: 'hn-btc',
          title: 'Bitcoin ETF flows light a BTC fuse',
          url: 'https://example.com/btc',
          source: 'Hacker News',
          score: 120,
          comments: 18,
          publishedAt: '2026-07-09T11:45:00Z',
        },
      ],
      reddit: [],
      updatedAt: '2026-07-09T12:00:00Z',
    },
    crypto: {
      markets: [
        {
          id: 'bitcoin',
          symbol: 'BTC',
          name: 'Bitcoin',
          currentPrice: 65000,
          marketCap: 1300000000000,
          marketCapRank: 1,
          totalVolume: 25000000000,
          priceChange24h: 2.5,
          priceChange7d: 6.1,
          high24h: 66000,
          low24h: 64000,
          lastUpdated: '2026-07-09T12:00:00Z',
          sparklinePrices: [63000, 64000, 65000],
        },
      ],
      updatedAt: '2026-07-09T12:00:00Z',
    },
    polymarket: { newMarkets: [], resolvedMarkets: [] },
    chainedDaemon: { observations: [] },
  };

  const model = buildTzeentchDashboardModel(raw, { now });
  const bitcoin = model.crypto.assets.find((asset) => asset.id === 'bitcoin');

  assert.ok(bitcoin, 'expected bitcoin asset to be present');
  assert.equal(bitcoin.mentions.length, 1);
  assert.equal(bitcoin.mentions[0].id, 'hn-btc');
  assert.ok(bitcoin.trendScore > 0);
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
