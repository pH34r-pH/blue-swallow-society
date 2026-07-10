import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/tzeentch/index.js');
const { createOperatorToken } = require('../api/_lib/operator-auth.js');

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function withOperatorEnv(fn) {
  const previous = {
    BLUE_SWALLOW_PASSCODE_SHA256: process.env.BLUE_SWALLOW_PASSCODE_SHA256,
    BLUE_SWALLOW_PASSCODE: process.env.BLUE_SWALLOW_PASSCODE,
    BLUE_SWALLOW_OPERATOR_TOKEN_TTL_MS: process.env.BLUE_SWALLOW_OPERATOR_TOKEN_TTL_MS,
  };
  const digest = crypto.createHash('sha256').update('tzeentch-test-passcode').digest('hex');
  delete process.env.BLUE_SWALLOW_PASSCODE;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = digest;
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_TTL_MS = '60000';
  handler._resetPaperBooksForTests?.();

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      handler._resetPaperBooksForTests?.();
    });
}

function authorizationHeader() {
  const { token } = createOperatorToken();
  return { authorization: `Bearer ${token}` };
}

test('api/tzeentch function.json exposes an anonymous GET trigger', () => {
  const raw = readFileSync(new URL('../api/tzeentch/function.json', import.meta.url), 'utf8');
  assert.ok(raw.trim().length > 0, 'function.json should not be empty');

  const config = JSON.parse(raw);
  const httpTrigger = config.bindings.find((binding) => binding.type === 'httpTrigger');
  const httpOutput = config.bindings.find((binding) => binding.type === 'http');

  assert.ok(httpTrigger, 'expected an httpTrigger binding');
  assert.ok(httpOutput, 'expected an http output binding');
  assert.equal(httpTrigger.authLevel, 'anonymous');
  assert.deepEqual(httpTrigger.methods, ['get']);
  assert.equal(httpTrigger.route, 'tzeentch');
});

test('api/tzeentch rejects requests without a passcode-issued operator session', async () => {
  await withOperatorEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('fetch should not run before auth passes');
    };

    const context = { log: { error: () => {} } };
    try {
      await handler(context, { headers: {} });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(context.res.status, 403);
    assert.equal(context.res.body.ok, false);
    assert.match(context.res.body.error, /operator session/i);
  });
});

test('api/tzeentch returns a bearer-token protected read-only payload', async () => {
  await withOperatorEnv(async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('hacker-news.firebaseio.com/v0/topstories.json')) {
      return jsonResponse([1]);
    }
    if (href.includes('hacker-news.firebaseio.com/v0/item/1.json')) {
      return jsonResponse({
        id: 1,
        type: 'story',
        title: 'Public signal blooms on a small board',
        url: 'https://example.com/hn',
        by: 'alice',
        score: 42,
        descendants: 7,
        time: 1710000000,
      });
    }
    if (href.includes('reddit.com/r/all/hot.json')) {
      return jsonResponse({
        data: {
          children: [
            {
              data: {
                id: 'r1',
                title: 'A meme spreads fast across the timeline',
                url: 'https://example.com/reddit',
                subreddit: 'all',
                author: 'bob',
                score: 123,
                num_comments: 9,
                created_utc: 1710000100,
                permalink: '/r/all/comments/r1',
              },
            },
          ],
        },
      });
    }
    if (href.includes('api.coingecko.com/api/v3/coins/markets')) {
      return jsonResponse([
        {
          id: 'bitcoin',
          symbol: 'btc',
          name: 'Bitcoin',
          image: 'https://example.com/btc.png',
          current_price: 65000,
          market_cap: 1300000000000,
          market_cap_rank: 1,
          total_volume: 25000000000,
          price_change_percentage_24h: 2.5,
          price_change_percentage_7d_in_currency: 6.1,
          high_24h: 66000,
          low_24h: 64000,
          last_updated: '2026-07-09T12:00:00Z',
          sparkline_in_7d: { price: [63000, 64000, 65000] },
        },
      ]);
    }
    if (href.includes('gamma-api.polymarket.com/events?limit=10&closed=false&active=true')) {
      return jsonResponse([
        {
          id: 'pm-active',
          slug: 'will-bitcoin-close-above-70k',
          title: 'Will Bitcoin close above 70k?',
          active: true,
          closed: false,
          liquidity: 125000,
          volume: 425000,
          openInterest: 99000,
          createdAt: '2026-07-09T11:00:00Z',
          endDate: '2026-07-15T00:00:00Z',
          markets: [
            {
              question: 'Will Bitcoin close above 70k?',
              outcomes: ['Yes', 'No'],
              outcomePrices: ['0.44', '0.56'],
              bestBid: 0.43,
              bestAsk: 0.45,
              lastTradePrice: 0.44,
            },
          ],
        },
      ]);
    }
    if (href.includes('gamma-api.polymarket.com/events?limit=10&closed=true&active=false')) {
      return jsonResponse([
        {
          id: 'pm-resolved',
          slug: 'did-the-rumor-spread-faster',
          title: 'Did the rumor spread faster?',
          active: false,
          closed: true,
          liquidity: 75000,
          volume: 190000,
          openInterest: 0,
          resolvedAt: '2026-07-08T18:00:00Z',
          markets: [
            {
              question: 'Did the rumor spread faster?',
              outcomes: ['Yes', 'No'],
              outcomePrices: ['1', '0'],
              bestBid: 0,
              bestAsk: 0,
              lastTradePrice: 1,
              umaResolutionStatus: 'resolved',
            },
          ],
        },
      ]);
    }
    throw new Error(`Unexpected URL: ${href}`);
  };

  const context = { log: { error: () => {} } };
  try {
    await handler(context, { headers: authorizationHeader() });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(context.res.status, 200);
  assert.equal(context.res.body.ok, true);
  assert.equal(context.res.body.publicOnly, true);
  assert.equal(context.res.body.murmurs.hackerNews.length, 1);
  assert.equal(context.res.body.murmurs.reddit.length, 1);
  assert.equal(context.res.body.crypto.markets.length, 1);
  assert.equal(context.res.body.polymarket.newMarkets.length, 1);
  assert.equal(context.res.body.polymarket.resolvedMarkets.length, 1);
  assert.equal(context.res.body.paperBooks.books.length, 3);
  assert.ok(context.res.body.paperBooks.books.some((book) => book.pendingOrders.length > 0));
  assert.match(context.res.body.crypto.markets[0].symbol, /BTC/);
  });
});
