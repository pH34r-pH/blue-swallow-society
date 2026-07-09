
const USER_AGENT = 'BlueSwallowSociety/1.0 (+https://blueswallow.co.in)';
const DEFAULT_TIMEOUT_MS = 9000;
const HN_API = 'https://hacker-news.firebaseio.com/v0';
const REDDIT_API = 'https://www.reddit.com/r/all/hot.json?limit=25';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const POLYMARKET_API = 'https://gamma-api.polymarket.com';

module.exports = async function (context, req) {
  try {
    const payload = await buildDashboardPayload();
    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
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

async function buildDashboardPayload() {
  const warnings = [];
  const [murmurs, crypto, polymarket] = await Promise.all([
    buildMurmurs({ warnings }),
    buildCrypto({ warnings }),
    buildPolymarket({ warnings }),
  ]);

  return {
    updatedAt: new Date().toISOString(),
    publicOnly: true,
    sourceFamilies: ['Hacker News', 'Reddit', 'CoinGecko', 'Polymarket Gamma'],
    warnings,
    murmurs,
    crypto,
    polymarket,
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
