import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/tzeentch/index.js');
const { createOperatorToken } = require('../api/_lib/operator-auth.js');

const PAPER_LINES = ['standard', 'aggressive', 'hyper_aggressive'];
const PAPER_STRATEGIES = [
  'prediction_markets',
  'crypto',
  'equity_watch',
  'local_event_watch',
  'ai_cyber_watch',
  'cross_asset_momentum',
  'contrarian_reversion',
  'volatility_barbell',
];
const PAPER_BOOK_IDS = PAPER_LINES.flatMap((lineId) => PAPER_STRATEGIES.map((strategyId) => `${lineId}__${strategyId}`));

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
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY,
    BLUE_SWALLOW_OPERATOR_ID: process.env.BLUE_SWALLOW_OPERATOR_ID,
    BLUE_SWALLOW_PAPER_LEDGER_PATH: process.env.BLUE_SWALLOW_PAPER_LEDGER_PATH,
    BACKEND_PAPER_STATE_BASE_URL: process.env.BACKEND_PAPER_STATE_BASE_URL,
    BSS_PAPER_STATE_TOKEN: process.env.BSS_PAPER_STATE_TOKEN,
  };
  const ledgerDir = mkdtempSync(join(tmpdir(), 'bss-tzeentch-ledger-'));
  const digest = crypto.createHash('sha256').update('tzeentch-test-passcode').digest('hex');
  delete process.env.BLUE_SWALLOW_PASSCODE;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = digest;
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_TTL_MS = '60000';
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = 'tzeentch-route-token-signing-key-32-bytes-minimum';
  process.env.BLUE_SWALLOW_OPERATOR_ID = 'operator-test';
  process.env.BLUE_SWALLOW_PAPER_LEDGER_PATH = join(ledgerDir, 'ledger.json');
  process.env.BACKEND_PAPER_STATE_BASE_URL = 'http://paper-backend.test:8080';
  process.env.BSS_PAPER_STATE_TOKEN = 'test-paper-state-token-32-byte-minimum';
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
      handler._resetPaperBooksForTests?.({ deleteLedger: true });
      rmSync(ledgerDir, { recursive: true, force: true });
    });
}

function authorizationHeader({ operatorId } = {}) {
  const { token } = createOperatorToken({ operatorId });
  return { authorization: `Bearer ${token}` };
}


function canonicalPaperBackendResponse() {
  const books = PAPER_BOOK_IDS.map((book_id) => {
    const [line_id, strategy_id] = book_id.split('__');
    return {
      book_id,
      line_id,
      line_display_name: line_id.replaceAll('_', ' '),
      strategy_id,
      strategy_display_name: strategy_id.replaceAll('_', ' '),
      display_name: `${line_id.replaceAll('_', ' ')} / ${strategy_id.replaceAll('_', ' ')}`,
      aggression_profile: { target_gross_fraction: line_id === 'standard' ? 0.8 : line_id === 'aggressive' ? 0.95 : 1, private_secret: 'leak-me' },
      starting_balance: 2000,
      initial_bank_capital: 1000,
      initial_investment_capital: 1000,
      cash_balance: 1000,
      equity: 2000,
      realized_pnl: 0,
      positions: [{
        instrument_ref: `${book_id}:seed`,
        symbol: 'SEED',
        quantity: 1,
        entry_price: 1000,
        mark_price: 1000,
        market_value: 1000,
        mark_status: 'fresh',
      }],
    };
  });
  return {
    ok: true,
    source: 'mosaic-murmurs-paper-engine',
    state: {
      schema_version: 'bss.paper_state.v2',
      generated_at: '2026-07-13T01:00:00Z',
      paper_only: true,
      autonomous_execution: true,
      ledger: {
        schema_version: 4,
        paper_only: true,
        processed_idempotency_keys: ['tick-1'],
        book_dimensions: {
          lines: PAPER_LINES.map((line_id, order) => ({ line_id, display_name: line_id, order })),
          strategies: PAPER_STRATEGIES.map((strategy_id, order) => ({ strategy_id, display_name: strategy_id, order })),
        },
        books,
      },
      paper_books: books.map((book) => ({
        book_id: book.book_id,
        line_id: book.line_id,
        strategy_id: book.strategy_id,
        display_name: book.display_name,
        starting_balance: 2000,
        cash_balance: 1000,
        equity: 2000,
        open_position_count: 1,
        gross_paper_exposure: 1000,
        daily_pnl: 0,
        cumulative_pnl: 0,
        cumulative_pnl_pct: 0,
        drawdown_pct: 0,
        max_drawdown_pct: 0,
        status: 'flat',
      })),
      paper_action_candidates: [{
        decision_id: 'decision-1',
        book_id: 'aggressive__crypto',
        action: 'PAPER_BUY',
        paper_size: 333.34,
        instrument_ref: 'crypto:bitcoin',
        status: 'paper_filled',
        paper_only: true,
        autonomous_execution: true,
        human_review_required: false,
        generated_at: '2026-07-13T01:00:00Z',
      }],
      paper_ledger_events: [],
      recent_paper_trades: [{
        event_id: 'fill-1',
        event_type: 'paper_fill',
        book_id: 'aggressive__crypto',
        action: 'PAPER_BUY',
        paper_size: 333.34,
        instrument_ref: 'crypto:bitcoin',
        mark_price: 60000,
        paper_only: true,
        generated_at: '2026-07-13T01:00:00Z',
        private_secret: 'leak-me',
      }],
    },
  };
}

async function mockTzeentchFeedFetch(url, options = {}) {
  const href = String(url);
  if (href === 'http://paper-backend.test:8080/api/v1/paper/state') {
    assert.equal(options.headers['X-Blue-Swallow-Paper-State-Token'], process.env.BSS_PAPER_STATE_TOKEN);
    return jsonResponse(canonicalPaperBackendResponse());
  }
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
  globalThis.fetch = mockTzeentchFeedFetch;

  const context = { log: { error: () => {} } };
  try {
    await handler(context, { headers: new Headers(authorizationHeader()) });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(context.res.status, 200);
  assert.equal(context.res.body.ok, true);
  assert.equal(context.res.body.publicOnly, true);
  assert.match(context.res.headers['Cache-Control'], /no-store/i);
  assert.doesNotMatch(context.res.headers['Cache-Control'], /public/i);
  assert.equal(context.res.body.murmurs.hackerNews.length, 1);
  assert.equal(context.res.body.murmurs.reddit.length, 1);
  assert.equal(context.res.body.crypto.markets.length, 1);
  assert.equal(context.res.body.polymarket.newMarkets.length, 1);
  assert.equal(context.res.body.polymarket.resolvedMarkets.length, 1);
  assert.equal(context.res.body.paperBooks.books.length, 24);
  assert.equal(new Set(context.res.body.paperBooks.books.map((book) => book.lineId)).size, 3);
  assert.equal(new Set(context.res.body.paperBooks.books.map((book) => book.strategyId)).size, 8);
  assert.equal(context.res.body.paperBooks.loop.field_naming.canonical_case, 'snake_case');
  assert.deepEqual(context.res.body.paperBooks.loop.loop_topology.primary_loops, ['mosaic', 'murmurs']);
  assert.ok(context.res.body.paperBooks.loop.loop_topology.supporting_loops.includes('bridge'));
  assert.ok(context.res.body.paperBooks.books.every((book) => book.startingBalance === 2000));
  assert.ok(context.res.body.paperBooks.books.every((book) => book.startingCash === 1000));
  assert.ok(context.res.body.paperBooks.books.every((book) => book.startingInvestedCapital === 1000));
  assert.ok(context.res.body.paperBooks.books.every((book) => book.cash === 1000));
  assert.ok(context.res.body.paperBooks.books.every((book) => book.positions.length === 1));
  assert.equal(context.res.body.paperBooks.autonomousExecution, true);
  assert.equal(context.res.body.paperBooks.source, 'mosaic-murmurs-paper-engine');
  assert.ok(context.res.body.paperBooks.books.some((book) => book.pendingOrders.length > 0));
  assert.equal(context.res.body.paperBooks.recentTrades.length, 1);
  assert.equal(context.res.body.paperBooks.recentTrades[0].notional, 333.34);
  assert.equal(context.res.body.paperBooks.executionCostModel, null);
  assert.ok(context.res.body.paperBooks.books.every((book) => book.transactionCosts === null));
  assert.equal(context.res.body.paperBooks.recentTrades[0].totalTransactionCost, null);
  assert.equal(JSON.stringify(context.res.body).includes('leak-me'), false);
  assert.match(context.res.body.crypto.markets[0].symbol, /BTC/);
  });
});

test('api/tzeentch remains read-only and returns the same canonical backend ledger across requests', async () => {
  await withOperatorEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockTzeentchFeedFetch;

    try {
      const first = { log: { error: () => {} } };
      await handler(first, { headers: new Headers(authorizationHeader({ operatorId: 'operator-alpha' })) });
      assert.equal(first.res.status, 200);

      const second = { log: { error: () => {} } };
      await handler(second, { headers: new Headers(authorizationHeader({ operatorId: 'operator-beta' })) });
      assert.equal(second.res.status, 200);
      assert.deepEqual(second.res.body.paperBooks, first.res.body.paperBooks);
      assert.equal(second.res.body.paperBooks.books[0].startingBalance, 2000);
      assert.equal(second.res.body.paperBooks.books[0].cash, 1000);
      assert.equal(second.res.body.paperBooks.books[0].positions.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
