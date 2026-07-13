const { requireOperatorToken } = require('../_lib/operator-auth');

const USER_AGENT = 'BlueSwallowSociety/1.0 (+https://blueswallow.net)';
const DEFAULT_TIMEOUT_MS = 9000;
const HN_API = 'https://hacker-news.firebaseio.com/v0';
const REDDIT_API = 'https://www.reddit.com/r/all/hot.json?limit=25';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const POLYMARKET_API = 'https://gamma-api.polymarket.com';
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
  const [murmurs, crypto, polymarket, paperState] = await Promise.all([
    buildMurmurs({ warnings }),
    buildCrypto({ warnings }),
    buildPolymarket({ warnings }),
    fetchCanonicalPaperState({ warnings }),
  ]);

  const paperBooks = buildCanonicalPaperBooks(paperState);

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

async function fetchCanonicalPaperState({ warnings } = {}) {
  const baseUrl = cleanString(process.env.BACKEND_PAPER_STATE_BASE_URL || process.env.BACKEND_CYBERMAP_BASE_URL).replace(/\/+$/, '');
  const token = cleanString(process.env.BSS_PAPER_STATE_TOKEN);
  if (!baseUrl || token.length < 32) {
    warnings?.push('Canonical paper-state backend is not configured.');
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  const url = `${baseUrl}/api/v1/paper/state`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'X-Blue-Swallow-Paper-State-Token': token,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body?.source !== 'mosaic-murmurs-paper-engine' || !isCanonicalPaperState(body?.state)) {
      throw new Error('invalid canonical paper-state envelope');
    }
    return body;
  } catch (error) {
    warnings?.push(`Canonical paper-state backend failed: ${error.message || error}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isCanonicalPaperState(state) {
  const canonicalIds = new Set(PAPER_STRATEGIES.map((strategy) => strategy.id));
  return state?.schema_version === 'bss.paper_state.v1'
    && state.paper_only === true
    && state.autonomous_execution === true
    && state.ledger?.schema_version === 3
    && state.ledger?.paper_only === true
    && Array.isArray(state.ledger?.books)
    && state.ledger.books.length === canonicalIds.size
    && state.ledger.books.every((book) => canonicalIds.has(book?.book_id)
      && Number(book?.starting_balance) === 2000
      && Number.isFinite(Number(book?.cash_balance))
      && Array.isArray(book?.positions))
    && Array.isArray(state.paper_action_candidates)
    && state.paper_action_candidates.every((action) => action?.paper_only === true);
}

function buildCanonicalPaperBooks(backend) {
  const state = backend?.state;
  const empty = {
    updatedAt: null,
    source: 'mosaic-murmurs-paper-engine',
    paperOnly: true,
    autonomousExecution: true,
    summary: 'Canonical paper state is unavailable; no demo ledger was substituted.',
    loop: canonicalLoopMetadata(0, 0),
    books: [],
    actions: [],
    ledgerEvents: [],
  };
  if (!isCanonicalPaperState(state)) return empty;

  const summaries = new Map((state.paper_books || []).map((book) => [book.book_id, book]));
  const actions = state.paper_action_candidates || [];
  const events = state.paper_ledger_events || [];
  const iterationCount = Array.isArray(state.ledger.processed_idempotency_keys)
    ? state.ledger.processed_idempotency_keys.length
    : 0;
  const books = state.ledger.books.map((book) => {
    const strategy = PAPER_STRATEGIES.find((item) => item.id === book.book_id) || {};
    const summary = summaries.get(book.book_id) || {};
    const equity = toNumber(summary.equity ?? book.equity) ?? (
      (toNumber(book.cash_balance) || 0)
      + (book.positions || []).reduce((total, position) => total + (toNumber(position.market_value) || 0), 0)
    );
    const startingBalance = toNumber(book.starting_balance) || 2000;
    const totalPnl = roundNumber(equity - startingBalance, 2);
    const bookActions = actions.filter((action) => action.book_id === book.book_id);
    const bookEvents = events.filter((event) => event.book_id === book.book_id);
    return {
      id: book.book_id,
      bookId: book.book_id,
      account: `paper-${book.book_id.replaceAll('_', '-')}-canonical`,
      name: summary.display_name || book.display_name || strategy.name || book.book_id,
      displayName: summary.display_name || book.display_name || strategy.name || book.book_id,
      loopAffinity: strategy.loopAffinity || 'paper',
      instrumentType: strategy.instrumentType || 'paper_only',
      orderModel: strategy.orderModel || 'deterministic_public_mark',
      strategy: strategy.strategy || 'Autonomous paper-only decisions from public marks.',
      createdAt: state.ledger.created_at || state.generated_at,
      updatedAt: state.generated_at,
      iteration: iterationCount,
      startingCash: startingBalance,
      startingBalance,
      cash: roundNumber(book.cash_balance, 2),
      investedCapital: roundNumber(startingBalance - (toNumber(book.cash_balance) || 0), 2),
      equity: roundNumber(equity, 2),
      realizedPnl: roundNumber(summary.realized_pnl ?? book.realized_pnl, 2),
      unrealizedPnl: roundNumber(summary.unrealized_pnl, 2),
      totalPnl,
      totalReturnPct: roundNumber((totalPnl / startingBalance) * 100, 4),
      benchmarkReturnPct: null,
      alphaPct: null,
      grossPaperExposure: roundNumber(summary.gross_paper_exposure, 2),
      drawdownPct: roundNumber(summary.drawdown_pct, 4),
      maxDrawdownPct: roundNumber(summary.max_drawdown_pct, 4),
      positions: (book.positions || []).slice(0, 16).map(publicCanonicalPosition),
      pendingOrders: bookActions.slice(0, 16).map(publicCanonicalAction),
      tradeLog: bookEvents.slice(0, 24).map(publicCanonicalEvent),
    };
  });
  return {
    updatedAt: state.generated_at,
    source: backend.source,
    paperOnly: true,
    autonomousExecution: true,
    summary: `${books.length} canonical autonomous paper books; each began with $1,000 invested and $1,000 banked.`,
    loop: canonicalLoopMetadata(books.length, iterationCount),
    books,
    actions: actions.map(publicCanonicalAction),
    ledgerEvents: events.map(publicCanonicalEvent),
  };
}

function canonicalLoopMetadata(strategyCount, iterationCount) {
  return {
    cadence: 'hourly autonomous paper tick',
    strategyCount,
    iterationCount,
    field_naming: FIELD_NAMING,
    loop_topology: LOOP_TOPOLOGY,
    riskNote: 'Paper only. No brokerage, wallet, exchange, or real-money execution path exists.',
  };
}

function publicCanonicalPosition(position) {
  const entry = toNumber(position.entry_price) || 0;
  const mark = toNumber(position.mark_price) || 0;
  return {
    id: position.instrument_ref,
    instrumentRef: position.instrument_ref,
    instrumentType: position.instrument_type || 'paper_only',
    assetId: position.source_asset_id || null,
    marketId: position.market_id || null,
    symbol: position.symbol || null,
    title: position.title || position.symbol || position.instrument_ref,
    quantity: toNumber(position.quantity) || 0,
    basis: entry,
    mark,
    marketValue: roundNumber(position.market_value ?? ((toNumber(position.quantity) || 0) * mark), 2),
    unrealizedPnl: roundNumber(position.unrealized_pnl ?? ((mark - entry) * (toNumber(position.quantity) || 0)), 2),
    gainPct: entry > 0 ? roundNumber(((mark / entry) - 1) * 100, 4) : 0,
    markStatus: position.mark_status || null,
    markedAt: position.marked_at || null,
    sourceUrl: position.source_url || null,
  };
}

function publicCanonicalAction(action) {
  return {
    id: action.decision_id || action.candidate_id,
    side: String(action.action || '').replace('PAPER_', '').toLowerCase(),
    action: action.action,
    bookId: action.book_id,
    instrumentRef: action.instrument_ref || null,
    symbol: action.symbol || null,
    title: action.title || action.instrument_ref || action.book_id,
    mark: toNumber(action.mark_price),
    basis: toNumber(action.fill_price ?? action.mark_price),
    notional: toNumber(action.paper_size) || 0,
    quantity: toNumber(action.quantity) || 0,
    status: String(action.status || '').replaceAll('_', '-'),
    reason: action.reason || null,
    createdAt: action.created_at || action.decided_at || null,
    executedAt: action.filled_at || null,
    paperOnly: true,
    autonomousExecution: action.autonomous_execution !== false,
    humanReviewRequired: false,
    sourceUrl: action.source_url || null,
  };
}

function publicCanonicalEvent(event) {
  return {
    ...event,
    id: event.event_id,
    bookId: event.book_id,
    paperOnly: true,
  };
}

function roundNumber(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
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

module.exports._internals = { buildCanonicalPaperBooks, isCanonicalPaperState };
