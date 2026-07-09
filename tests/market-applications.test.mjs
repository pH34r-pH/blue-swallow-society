import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTzeentchApplications } from '../app/osint-applications.mjs';

test('buildTzeentchApplications creates crypto and polymarket application lanes', () => {
  const payload = buildTzeentchApplications({
    cryptoMarkets: [
      {
        id: 'bitcoin',
        name: 'Bitcoin',
        symbol: 'btc',
        current_price: 62610,
        price_change_percentage_24h: 1.02,
        market_cap_rank: 1,
        total_volume: 123456789,
        image: 'https://example.com/btc.png',
        last_updated: '2026-07-09T12:00:00Z',
      },
    ],
    polymarketMarkets: [
      {
        question: 'Will Bitcoin finish above 70k this quarter?',
        slug: 'btc-above-70k-q3',
        liquidity: '24686.01',
        volume: '853363.34',
        outcomePrices: '["0.62", "0.38"]',
        outcomes: '["Yes", "No"]',
        endDate: '2026-07-31T12:00:00Z',
        image: 'https://example.com/market.jpg',
      },
    ],
  });

  assert.equal(payload.applications.length, 2);
  assert.equal(payload.applications[0].key, 'crypto');
  assert.equal(payload.applications[1].key, 'polymarket');
  assert.match(payload.applications[0].headline, /Crypto markets/i);
  assert.match(payload.applications[1].headline, /Polymarket/i);
  assert.ok(payload.applications[0].resources.length >= 1);
  assert.ok(payload.applications[1].resources.length >= 1);
  assert.equal(payload.applications[0].resources[0].label, 'Bitcoin');
  assert.equal(payload.applications[1].resources[0].label, 'Will Bitcoin finish above 70k this quarter?');
});

test('buildTzeentchApplications formats market resource details', () => {
  const payload = buildTzeentchApplications({
    cryptoMarkets: [],
    polymarketMarkets: [],
  });

  assert.ok(payload.applications[0].summary.length > 0);
  assert.ok(payload.applications[1].summary.length > 0);
  assert.ok(payload.applications[0].sourceCount >= 1);
  assert.ok(payload.applications[1].sourceCount >= 1);
});
