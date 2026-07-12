const crypto = require('node:crypto');
const { dirname } = require('node:path');
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { requireOperatorToken } = require('../_lib/operator-auth');

const USER_AGENT = 'BlueSwallowSociety/1.0 (+https://blueswallow.net)';
const DEFAULT_TIMEOUT_MS = 9000;
const HN_API = 'https://hacker-news.firebaseio.com/v0';
const REDDIT_API = 'https://www.reddit.com/r/all/hot.json?limit=25';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const POLYMARKET_API = 'https://gamma-api.polymarket.com';
const PAPER_STARTING_CASH = 1_000;
const PAPER_ORDER_FRACTION = 0.12;
const FIELD_NAMING = {
  canonical_case: 'snake_case',
  scope: 'local append-only records and VM API payloads',
  ui_boundary: 'SWA JavaScript may adapt to camelCase internally, but persisted loop records stay snake_case.',
};
const LOOP_TOPOLOGY = {
  primary_loops: ['mosaic', 'murmurs'],
  supporting_loops: ['bridge', 'paper', 'narrative', 'memory_sync', 'source_health'],
  rule: 'Mosaic and Murmurs are the two primary owned loops; Bridge, paper, narrative, memory_sync, and source_health are supporting loops.',
};
const PAPER_STRATEGIES = [
  {
    id: 'prediction_markets',
    account: 'paper-prediction-markets-001',
    name: 'Prediction Markets',
    loopAffinity: 'bridge',
    instrumentType: 'prediction_market',
    orderModel: 'prediction_market_probability',
    strategy: 'Paper-only probability deltas where Mosaic evidence and Murmurs belief diverge from market-implied odds.',
  },
  {
    id: 'crypto',
    account: 'paper-crypto-001',
    name: 'Crypto',
    loopAffinity: 'bridge',
    instrumentType: 'crypto',
    orderModel: 'crypto_momentum',
    strategy: 'Paper-only liquid crypto momentum/reversion signals from public market and perception feeds.',
  },
  {
    id: 'equity_watch',
    account: 'paper-equity-watch-001',
    name: 'Equity Watch',
    loopAffinity: 'mosaic',
    instrumentType: 'equity_watch',
    orderModel: 'watch_only',
    strategy: 'Paper-only watchlist for public-company, macro, and regulatory signals; no brokerage execution.',
  },
  {
    id: 'local_event_watch',
    account: 'paper-local-event-watch-001',
    name: 'Local Event Watch',
    loopAffinity: 'mosaic',
    instrumentType: 'local_event_watch',
    orderModel: 'watch_only',
    strategy: 'Paper-only Seattle/Bellevue/Redmond and Washington State event-risk theses.',
  },
  {
    id: 'ai_cyber_watch',
    account: 'paper-ai-cyber-watch-001',
    name: 'AI/Cyber Watch',
    loopAffinity: 'murmurs',
    instrumentType: 'other_paper_only',
    orderModel: 'watch_only',
    strategy: 'Paper-only AI, security, breach, and agent-tooling hype/fact deltas.',
  },
];
const paperBookState = new Map();
let paperLedgerLoaded = false;

module.exports = async function (context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) {
    return;
  }

  try {
    const payload = await buildDashboardPayload(auth.token);
    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      body: {
        ok: true,
        ...payload,
      },
    };
  } catch (error) {
    context.log.error(`Tzeentch dashboard failed: ${error.stack || error.message}`);
    context.res = {
      status: error.statusCode || 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: {
        ok: false,
        error: error.message || 'Tzeentch dashboard failed',
      },
    };
  }
};

async function buildDashboardPayload(operatorToken = {}) {
  const warnings = [];
  const [murmurs, crypto, polymarket] = await Promise.all([
    buildMurmurs({ warnings }),
    buildCrypto({ warnings }),
    buildPolymarket({ warnings }),
  ]);

  const paperBooks = buildPaperBooks({ murmurs, crypto, polymarket, operator: operatorFromToken(operatorToken) });

  return {
    updatedAt: new Date().toISOString(),
    publicOnly: true,
    sourceFamilies: ['Hacker News', 'Reddit', 'CoinGecko', 'Polymarket Gamma'],
    warnings,
    murmurs,
    crypto,
    polymarket,
    paperBooks,
  };
}

async function buildMurmurs({ warnings }) {
  const result = {
    hackerNews: [],
    reddit: [],
    updatedAt: new Date().toISOString(),
  };

  const topIds = await fetchJson(`${HN_API}/topstories.json`, { warnings });
  const ids = Array.isArray(topIds) ? topIds.slice(0, 12) : [];
  if (!ids.length) {
    warnings.push('Hacker News top stories unavailable.');
  }

  const stories = await Promise.all(
    ids.map(async (id) => {
      const item = await fetchJson(`${HN_API}/item/${encodeURIComponent(id)}.json`, { warnings });
      return normalizeHnStory(item);
    }),
  );

  result.hackerNews = stories.filter(Boolean).sort(sortByViralitySeed).slice(0, 8);

  const reddit = await fetchJson(REDDIT_API, { warnings });
  const children = reddit?.data?.children;
  if (Array.isArray(children)) {
    result.reddit = children
      .map((child) => normalizeRedditPost(child?.data || child))
      .filter(Boolean)
      .sort(sortByViralitySeed)
      .slice(0, 8);
  } else {
    warnings.push('Reddit hot feed unavailable.');
  }

  return result;
}

async function buildCrypto({ warnings }) {
  const markets = await fetchJson(
    `${COINGECKO_API}/coins/markets?vs_currency=usd&order=volume_desc&per_page=10&page=1&sparkline=true&price_change_percentage=24h,7d`,
    { warnings },
  );

  if (!Array.isArray(markets)) {
    warnings.push('CoinGecko market feed unavailable.');
    return {
      markets: [],
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    markets: markets.map(normalizeCoinMarket).filter(Boolean).slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
}

async function buildPolymarket({ warnings }) {
  const [active, resolved] = await Promise.all([
    fetchJson(`${POLYMARKET_API}/events?limit=10&closed=false&active=true&order=createdAt&ascending=false`, { warnings }),
    fetchJson(`${POLYMARKET_API}/events?limit=10&closed=true&active=false&order=updatedAt&ascending=false`, { warnings }),
  ]);

  const activeEvents = Array.isArray(active) ? active.map((event) => normalizePolymarketEvent(event)).filter(Boolean) : [];
  const resolvedEvents = Array.isArray(resolved) ? resolved.map((event) => normalizePolymarketEvent(event)).filter(Boolean) : [];

  if (!activeEvents.length) {
    warnings.push('Polymarket active events unavailable.');
  }
  if (!resolvedEvents.length) {
    warnings.push('Polymarket resolved events unavailable.');
  }

  return {
    newMarkets: activeEvents.sort((left, right) => compareIso(right.createdAt, left.createdAt)),
    resolvedMarkets: resolvedEvents.sort((left, right) => compareIso(right.resolvedAt || right.updatedAt, left.resolvedAt || left.updatedAt)),
    updatedAt: new Date().toISOString(),
  };
}

function buildPaperBooks({ crypto = {}, polymarket = {}, operator = operatorFromToken() } = {}) {
  const now = new Date().toISOString();
  const cryptoMarkets = Array.isArray(crypto.markets) ? crypto.markets.filter((market) => market?.id && Number.isFinite(market.currentPrice)) : [];
  const activeMarkets = Array.isArray(polymarket.newMarkets) ? polymarket.newMarkets.filter((market) => market?.id) : [];
  const benchmark = buildPaperBenchmark(cryptoMarkets);
  const ledger = getPaperBookLedger(operator.operatorScope, operator.operatorId);
  const books = PAPER_STRATEGIES.map((strategy) => {
    const previous = ledger.books.get(strategy.id) || createPaperBook(strategy, now);
    const book = clonePaperBook(previous);
    book.updatedAt = now;
    book.iteration = (book.iteration || 0) + 1;
    book.pendingOrders = [];

    markPaperBook(book, { cryptoMarkets, activeMarkets, benchmark });
    const order = buildPaperOrder(strategy.id, book, { cryptoMarkets, activeMarkets, now });
    if (order) {
      executePaperOrder(book, order, { cryptoMarkets, activeMarkets, now });
    }
    markPaperBook(book, { cryptoMarkets, activeMarkets, benchmark });

    ledger.books.set(strategy.id, clonePaperBook(book));
    return publicPaperBook(book);
  });
  persistPaperLedger();

  return {
    updatedAt: now,
    operatorId: operator.operatorId,
    operatorScope: operator.operatorScope,
    paperOnly: true,
    summary: `${books.length} paper books running in parallel against public feeds.`,
    loop: {
      cadence: 'per live feed refresh',
      strategyCount: books.length,
      iterationCount: books.reduce((max, book) => Math.max(max, book.iteration || 0), 0),
      field_naming: FIELD_NAMING,
      loop_topology: LOOP_TOPOLOGY,
      riskNote: 'No live orders. Books are warm-function paper ledgers and may cold-start if the serverless worker is recycled.',
    },
    benchmark,
    books,
  };
}

function operatorFromToken(token = {}) {
  const operatorId = cleanString(token.operatorId || process.env.BLUE_SWALLOW_OPERATOR_ID || 'operator');
  const scopedId = operatorId || 'operator';
  return {
    operatorId: scopedId,
    operatorScope: `operator:${crypto.createHash('sha256').update(scopedId, 'utf8').digest('hex').slice(0, 16)}`,
  };
}

function getPaperBookLedger(operatorScope, operatorId) {
  ensurePaperLedgerLoaded();
  const scope = cleanString(operatorScope) || operatorFromToken({ operatorId }).operatorScope;
  let ledger = paperBookState.get(scope);
  if (!ledger) {
    ledger = { operatorId: cleanString(operatorId) || 'operator', books: new Map() };
    paperBookState.set(scope, ledger);
  }
  if (operatorId) {
    ledger.operatorId = cleanString(operatorId) || ledger.operatorId;
  }
  return ledger;
}

function ensurePaperLedgerLoaded() {
  if (paperLedgerLoaded) {
    return;
  }
  paperLedgerLoaded = true;
  const ledgerPath = getPaperLedgerPath();
  if (!ledgerPath || !existsSync(ledgerPath)) {
    return;
  }

  try {
    const raw = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const operators = raw && typeof raw === 'object' ? raw.operators || {} : {};
    for (const [operatorScope, entry] of Object.entries(operators)) {
      const books = new Map();
      const rawBooks = entry?.books && typeof entry.books === 'object' ? entry.books : {};
      for (const [strategyId, book] of Object.entries(rawBooks)) {
        if (book && typeof book === 'object') {
          books.set(strategyId, clonePaperBook(book));
        }
      }
      paperBookState.set(operatorScope, {
        operatorId: cleanString(entry?.operatorId) || 'operator',
        books,
      });
    }
  } catch {
    paperBookState.clear();
  }
}

function persistPaperLedger() {
  const ledgerPath = getPaperLedgerPath();
  if (!ledgerPath) {
    return;
  }

  const operators = {};
  for (const [operatorScope, entry] of paperBookState.entries()) {
    operators[operatorScope] = {
      operatorId: entry.operatorId,
      books: Object.fromEntries(Array.from(entry.books.entries()).map(([strategyId, book]) => [strategyId, clonePaperBook(book)])),
    };
  }

  mkdirSync(dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), operators }, null, 2));
}

function getPaperLedgerPath() {
  return cleanString(process.env.BLUE_SWALLOW_PAPER_LEDGER_PATH);
}

function createPaperBook(strategy, now) {
  return {
    id: strategy.id,
    bookId: strategy.id,
    account: strategy.account,
    name: strategy.name,
    displayName: strategy.name,
    loopAffinity: strategy.loopAffinity,
    instrumentType: strategy.instrumentType,
    orderModel: strategy.orderModel,
    strategy: strategy.strategy,
    createdAt: now,
    updatedAt: now,
    iteration: 0,
    startingCash: PAPER_STARTING_CASH,
    startingBalance: PAPER_STARTING_CASH,
    cash: PAPER_STARTING_CASH,
    equity: PAPER_STARTING_CASH,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    totalReturnPct: 0,
    benchmarkReturnPct: 0,
    alphaPct: 0,
    positions: [],
    pendingOrders: [],
    tradeLog: [],
  };
}

function buildPaperBenchmark(cryptoMarkets = []) {
  const btc = cryptoMarkets.find((market) => market.id === 'bitcoin') || cryptoMarkets[0] || null;
  const returnPct = toNumber(btc?.priceChange24h) || 0;
  return {
    label: btc ? `${btc.symbol || btc.name} 24h proxy` : 'No market benchmark',
    assetId: btc?.id || null,
    mark: toNumber(btc?.currentPrice),
    returnPct: roundNumber(returnPct, 4),
  };
}

function buildPaperOrder(strategyId, book, { cryptoMarkets = [], activeMarkets = [], now }) {
  if (strategyId === 'crypto') {
    const candidate = cryptoMarkets
      .filter((market) => !isStablecoin(market.symbol) && (toNumber(market.priceChange24h) || 0) > 0)
      .sort((left, right) => cryptoMomentumScore(right) - cryptoMomentumScore(left))[0];
    if (!candidate) return null;
    return cryptoPaperOrder('buy', candidate, book, now, `Momentum score ${roundNumber(cryptoMomentumScore(candidate), 2)} from public price/volume feeds.`);
  }

  if (strategyId === 'prediction_markets') {
    const market = activeMarkets
      .filter((entry) => Number.isFinite(entry.yesPrice) && entry.yesPrice > 0.12 && entry.yesPrice < 0.88)
      .sort((left, right) => (toNumber(right.liquidity) || 0) - (toNumber(left.liquidity) || 0))[0];
    if (!market) return null;
    const outcome = market.yesPrice <= 0.5 ? 'YES' : 'NO';
    const price = outcome === 'YES' ? market.yesPrice : market.noPrice;
    if (!Number.isFinite(price) || price <= 0) return null;
    const notional = clampNumber(book.cash * PAPER_ORDER_FRACTION, 50, Math.min(book.cash, 1_000));
    return {
      id: `paper-${book.id}-${Date.now()}-${market.id}`,
      side: 'buy',
      instrumentType: 'polymarket',
      marketId: market.id,
      symbol: outcome,
      title: `${outcome} ${market.title || market.question || 'Polymarket event'}`,
      mark: roundNumber(price, 4),
      basis: roundNumber(price, 4),
      notional: roundNumber(notional, 2),
      quantity: roundNumber(notional / price, 6),
      status: 'paper-open',
      reason: `Liquid prediction-market entry at ${formatPercentApi(price)} probability mark.`,
      createdAt: now,
      sourceUrl: market.marketUrl || null,
    };
  }

  return null;
}

function cryptoPaperOrder(side, market, book, now, reason) {
  const price = toNumber(market.currentPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const maxNotional = side === 'buy'
    ? Math.min(book.cash, 1_000)
    : Math.min(positionQuantity(book, market.id) * price, 1_000);
  const notional = clampNumber(book.equity * PAPER_ORDER_FRACTION, 50, Math.max(0, maxNotional));
  if (!Number.isFinite(notional) || notional <= 0) return null;

  return {
    id: `paper-${book.id}-${Date.now()}-${market.id}`,
    side,
    instrumentType: 'crypto',
    assetId: market.id,
    symbol: market.symbol,
    title: market.name || market.symbol || market.id,
    mark: roundNumber(price, 8),
    basis: roundNumber(price, 8),
    notional: roundNumber(notional, 2),
    quantity: roundNumber(notional / price, 8),
    status: 'paper-open',
    reason,
    createdAt: now,
  };
}

function executePaperOrder(book, order, { now }) {
  const executed = { ...order, executedAt: now, status: 'paper-filled' };
  if (order.side === 'buy') {
    if (book.cash < order.notional) {
      book.pendingOrders.push({ ...order, status: 'skipped', reason: `${order.reason} Cash below order notional.` });
      return;
    }
    book.cash = roundNumber(book.cash - order.notional, 2);
    upsertPaperPosition(book, order);
    book.tradeLog.unshift(executed);
    book.pendingOrders.push(executed);
    return;
  }

  const position = findPaperPosition(book, order);
  if (!position || position.quantity <= 0) {
    book.pendingOrders.push({ ...order, status: 'skipped', reason: `${order.reason} No matching paper position to sell.` });
    return;
  }

  const sellQuantity = Math.min(position.quantity, order.quantity);
  const proceeds = sellQuantity * order.mark;
  const costBasis = sellQuantity * position.basis;
  position.quantity = roundNumber(position.quantity - sellQuantity, 8);
  book.cash = roundNumber(book.cash + proceeds, 2);
  book.realizedPnl = roundNumber((book.realizedPnl || 0) + proceeds - costBasis, 2);
  book.positions = book.positions.filter((entry) => entry.quantity > 0.00000001);
  book.tradeLog.unshift({ ...executed, quantity: roundNumber(sellQuantity, 8), notional: roundNumber(proceeds, 2), realizedPnl: roundNumber(proceeds - costBasis, 2) });
  book.pendingOrders.push(executed);
}

function upsertPaperPosition(book, order) {
  const existing = findPaperPosition(book, order);
  const quantity = toNumber(order.quantity) || 0;
  const notional = toNumber(order.notional) || 0;
  if (!existing) {
    book.positions.push({
      id: order.instrumentType === 'polymarket' ? `polymarket:${order.marketId}:${order.symbol}` : `crypto:${order.assetId}`,
      instrumentType: order.instrumentType,
      assetId: order.assetId || null,
      marketId: order.marketId || null,
      symbol: order.symbol || null,
      title: order.title,
      quantity,
      basis: order.basis,
      mark: order.mark,
      marketValue: notional,
      unrealizedPnl: 0,
      gainPct: 0,
      sourceUrl: order.sourceUrl || null,
    });
    return;
  }

  const oldCost = existing.quantity * existing.basis;
  const newQuantity = existing.quantity + quantity;
  const newBasis = newQuantity > 0 ? (oldCost + notional) / newQuantity : order.basis;
  existing.quantity = roundNumber(newQuantity, 8);
  existing.basis = roundNumber(newBasis, 8);
  existing.mark = order.mark;
  existing.marketValue = roundNumber(existing.quantity * order.mark, 2);
}

function markPaperBook(book, { cryptoMarkets = [], activeMarkets = [], benchmark = {} }) {
  let marketValue = 0;
  let unrealized = 0;
  book.positions = book.positions.map((position) => {
    const mark = currentMarkForPosition(position, { cryptoMarkets, activeMarkets });
    const marketPositionValue = Number.isFinite(mark) ? position.quantity * mark : position.marketValue || 0;
    const positionUnrealized = Number.isFinite(mark) ? position.quantity * (mark - position.basis) : 0;
    marketValue += marketPositionValue;
    unrealized += positionUnrealized;
    return {
      ...position,
      mark: Number.isFinite(mark) ? roundNumber(mark, 8) : position.mark,
      marketValue: roundNumber(marketPositionValue, 2),
      unrealizedPnl: roundNumber(positionUnrealized, 2),
      gainPct: position.basis ? roundNumber(((mark - position.basis) / position.basis) * 100, 4) : 0,
    };
  });

  book.cash = roundNumber(book.cash, 2);
  book.unrealizedPnl = roundNumber(unrealized, 2);
  book.equity = roundNumber(book.cash + marketValue, 2);
  book.totalPnl = roundNumber(book.equity - book.startingCash, 2);
  book.totalReturnPct = roundNumber((book.totalPnl / book.startingCash) * 100, 4);
  book.benchmarkReturnPct = roundNumber(benchmark.returnPct || 0, 4);
  book.alphaPct = roundNumber(book.totalReturnPct - book.benchmarkReturnPct, 4);
}

function currentMarkForPosition(position, { cryptoMarkets = [], activeMarkets = [] }) {
  if (position.instrumentType === 'crypto') {
    const market = cryptoMarkets.find((entry) => entry.id === position.assetId || entry.symbol === position.symbol);
    return toNumber(market?.currentPrice) ?? position.mark;
  }
  if (position.instrumentType === 'polymarket') {
    const market = activeMarkets.find((entry) => entry.id === position.marketId);
    if (!market) return position.mark;
    return position.symbol === 'NO' ? toNumber(market.noPrice) ?? position.mark : toNumber(market.yesPrice) ?? position.mark;
  }
  return position.mark;
}

function findPaperPosition(book, order) {
  return book.positions.find((position) => {
    if (order.instrumentType === 'crypto') return position.instrumentType === 'crypto' && position.assetId === order.assetId;
    if (order.instrumentType === 'polymarket') return position.instrumentType === 'polymarket' && position.marketId === order.marketId && position.symbol === order.symbol;
    return false;
  });
}

function positionQuantity(book, assetId) {
  return book.positions
    .filter((position) => position.instrumentType === 'crypto' && position.assetId === assetId)
    .reduce((total, position) => total + (toNumber(position.quantity) || 0), 0);
}

function publicPaperBook(book) {
  return {
    ...book,
    positions: book.positions.slice(0, 8),
    pendingOrders: book.pendingOrders.slice(0, 5),
    tradeLog: book.tradeLog.slice(0, 12),
  };
}

function clonePaperBook(book) {
  return JSON.parse(JSON.stringify(book));
}

function cryptoMomentumScore(market) {
  const change24h = toNumber(market.priceChange24h) || 0;
  const change7d = toNumber(market.priceChange7d) || 0;
  const volume = toNumber(market.totalVolume) || 0;
  const rankBias = market.marketCapRank ? Math.max(0, 12 - market.marketCapRank) : 0;
  return change24h * 0.7 + change7d * 0.3 + Math.log10(volume + 1) * 0.1 + rankBias * 0.2;
}

function isStablecoin(symbol) {
  return ['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDP', 'USDD', 'PYUSD', 'FRAX', 'USDE'].includes(cleanString(symbol).toUpperCase());
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  if (max < min) return 0;
  return Math.min(max, Math.max(min, parsed));
}

function roundNumber(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function formatSignedPercentApi(value) {
  const parsed = toNumber(value) || 0;
  const prefix = parsed > 0 ? '+' : '';
  return `${prefix}${roundNumber(parsed, 2)}%`;
}

function formatPercentApi(value) {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? `${roundNumber(parsed * 100, 1)}%` : '—';
}

async function fetchJson(url, { warnings } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/plain, */*',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} for ${url}`);
      error.statusCode = response.status;
      throw error;
    }

    return await response.json();
  } catch (error) {
    if (warnings) {
      warnings.push(`${url} failed: ${error.message || error}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeHnStory(item) {
  if (!item || item.type !== 'story') {
    return null;
  }

  const url = cleanString(item.url) || `https://news.ycombinator.com/item?id=${item.id}`;
  return {
    id: String(item.id),
    title: cleanString(item.title) || 'Untitled Hacker News story',
    url,
    author: cleanString(item.by) || null,
    score: toNumber(item.score) || 0,
    comments: toNumber(item.descendants) || 0,
    publishedAt: item.time ? new Date(item.time * 1000).toISOString() : null,
    source: 'Hacker News',
    domain: hostnameFromUrl(url),
    topicKey: topicKeyFromText(item.title),
  };
}

function normalizeRedditPost(item) {
  if (!item) {
    return null;
  }

  const url = cleanString(item.url_overridden_by_dest) || cleanString(item.url) || (item.permalink ? `https://www.reddit.com${item.permalink}` : null);
  return {
    id: cleanString(item.id) || cleanString(item.name) || null,
    title: cleanString(item.title) || 'Untitled Reddit post',
    url: url || (item.permalink ? `https://www.reddit.com${item.permalink}` : null),
    subreddit: cleanString(item.subreddit) || null,
    author: cleanString(item.author) || null,
    score: toNumber(item.score) || 0,
    comments: toNumber(item.num_comments) || 0,
    publishedAt: item.created_utc ? new Date(item.created_utc * 1000).toISOString() : null,
    source: item.subreddit ? `r/${item.subreddit}` : 'Reddit',
    domain: hostnameFromUrl(url),
    topicKey: topicKeyFromText(item.title),
  };
}

function normalizeCoinMarket(market) {
  if (!market) {
    return null;
  }

  const sparklinePrices = Array.isArray(market.sparkline_in_7d?.price)
    ? market.sparkline_in_7d.price.map((value) => toNumber(value)).filter((value) => Number.isFinite(value))
    : [];

  return {
    id: cleanString(market.id) || null,
    symbol: cleanString(market.symbol || '').toUpperCase() || null,
    name: cleanString(market.name) || null,
    image: cleanString(market.image) || null,
    currentPrice: toNumber(market.current_price),
    marketCap: toNumber(market.market_cap),
    marketCapRank: toNumber(market.market_cap_rank),
    totalVolume: toNumber(market.total_volume),
    priceChange24h: toNumber(market.price_change_percentage_24h_in_currency ?? market.price_change_percentage_24h),
    priceChange7d: toNumber(market.price_change_percentage_7d_in_currency),
    high24h: toNumber(market.high_24h),
    low24h: toNumber(market.low_24h),
    lastUpdated: cleanString(market.last_updated) || null,
    sparklinePrices,
    topicKey: topicKeyFromText(market.name),
  };
}

function normalizePolymarketEvent(event) {
  if (!event) {
    return null;
  }

  const market = Array.isArray(event.markets) && event.markets.length > 0 ? event.markets[0] : event;
  const outcomes = parseList(market.outcomes || event.outcomes);
  const outcomePrices = parseList(market.outcomePrices || event.outcomePrices).map((value) => toNumber(value)).filter((value) => Number.isFinite(value));
  const winningIndex = outcomePrices.length ? outcomePrices.indexOf(Math.max(...outcomePrices)) : -1;
  const winner = winningIndex >= 0 ? outcomes[winningIndex] || null : null;
  const slug = cleanString(event.slug || market.slug || event.ticker || market.ticker || event.id || market.id) || null;
  const createdAt = isoOrNull(event.createdAt || market.createdAt || event.creationDate || event.startDate || market.startDate);
  const updatedAt = isoOrNull(event.updatedAt || market.updatedAt || event.creationDate || event.startDate || market.startDate);
  const resolvedAt = isoOrNull(event.closedTime || market.closedTime || event.updatedAt || market.updatedAt || event.endDate || market.endDate);

  return {
    id: cleanString(event.id || market.id || slug) || null,
    slug,
    question: cleanString(market.question || event.title || market.title) || 'Untitled market',
    title: cleanString(event.title || market.question || market.title || 'Untitled market'),
    description: cleanString(event.description || market.description) || null,
    image: cleanString(event.image || market.image || event.icon || market.icon) || null,
    icon: cleanString(event.icon || market.icon) || null,
    active: Boolean(event.active ?? market.active),
    closed: Boolean(event.closed ?? market.closed),
    archived: Boolean(event.archived ?? market.archived),
    new: Boolean(event.new ?? market.new),
    featured: Boolean(event.featured ?? market.featured),
    restricted: Boolean(event.restricted ?? market.restricted),
    liquidity: toNumber(event.liquidity ?? market.liquidity),
    volume: toNumber(event.volume ?? market.volume),
    volume24hr: toNumber(event.volume24hr ?? market.volume24hr),
    openInterest: toNumber(event.openInterest ?? market.openInterest),
    bestBid: toNumber(market.bestBid),
    bestAsk: toNumber(market.bestAsk),
    lastTradePrice: toNumber(market.lastTradePrice),
    yesPrice: outcomePrices[0] ?? null,
    noPrice: outcomePrices[1] ?? null,
    outcomes,
    outcomePrices,
    winner,
    createdAt,
    updatedAt,
    resolvedAt,
    endDate: isoOrNull(event.endDate || market.endDate),
    resolutionSource: cleanString(event.resolutionSource || market.resolutionSource) || null,
    umaResolutionStatus: cleanString(event.umaResolutionStatus || market.umaResolutionStatus) || null,
    resolvedBy: cleanString(event.resolvedBy || market.resolvedBy) || null,
    contextDescription: cleanString(event.eventMetadata?.context_description) || null,
    marketUrl: slug ? `https://polymarket.com/event/${encodeURIComponent(slug)}` : null,
    topicKey: topicKeyFromText(market.question || event.title || market.title),
  };
}

function parseList(value) {
  if (Array.isArray(value)) {
    return value.slice();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return trimmed.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
  }

  return [];
}

function topicKeyFromText(text) {
  const words = cleanString(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  return words.slice(0, 6).join(' ');
}

function sortByViralitySeed(left, right) {
  const leftScore = viralitySeed(left);
  const rightScore = viralitySeed(right);
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  const leftTime = left?.publishedAt || left?.createdAt || '';
  const rightTime = right?.publishedAt || right?.createdAt || '';
  return compareIso(rightTime, leftTime);
}

function viralitySeed(item) {
  if (!item || typeof item !== 'object') {
    return 0;
  }

  const score = toNumber(item.score) || 0;
  const comments = toNumber(item.comments) || 0;
  return score + comments * 2;
}

function compareIso(left, right) {
  const leftMs = Date.parse(left || '') || 0;
  const rightMs = Date.parse(right || '') || 0;
  return leftMs - rightMs;
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isoOrNull(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'what',
  'will',
  'when',
  'into',
  'your',
  'you',
  'are',
  'can',
  'how',
  'why',
  'new',
  'news',
  'reddit',
  'hacker',
  'story',
  'post',
  'posts',
  'live',
  'hot',
]);

module.exports._resetPaperBooksForTests = ({ memoryOnly = false, deleteLedger = false } = {}) => {
  paperBookState.clear();
  paperLedgerLoaded = false;
  const ledgerPath = getPaperLedgerPath();
  if (deleteLedger && ledgerPath) {
    rmSync(ledgerPath, { force: true });
  }
  if (!memoryOnly && !deleteLedger) {
    // Memory reset only by default; production ledgers remain intact unless tests ask to delete them.
  }
};
module.exports._internals = { buildPaperBooks };
