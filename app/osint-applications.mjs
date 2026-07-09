const CURRENCY_ZERO_DECIMALS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const CURRENCY_TWO_DECIMALS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PERCENT_ONE_DECIMAL = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const DEFAULT_CRYPTO_SYMBOLS = [
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'ethereum', name: 'Ethereum', symbol: 'ETH' },
  { id: 'solana', name: 'Solana', symbol: 'SOL' },
];

const DEFAULT_POLYMARKET_PROMPTS = [
  'Macro / election / policy markets',
  'Tech / culture event markets',
  'Sports / outcomes / surprise catalysts',
];

export function buildTzeentchApplications({ cryptoMarkets = [], polymarketMarkets = [] } = {}) {
  const normalizedCrypto = normalizeCryptoMarkets(cryptoMarkets);
  const normalizedPolymarket = normalizePolymarketMarkets(polymarketMarkets);

  return {
    applications: [
      buildCryptoLane(normalizedCrypto),
      buildPolymarketLane(normalizedPolymarket),
    ],
    sourceFamilies: ['CoinGecko', 'Polymarket Gamma', 'Polymarket CLOB'],
  };
}

export function normalizeCryptoMarkets(markets = []) {
  const sorted = Array.isArray(markets)
    ? [...markets].sort((left, right) => {
      const leftRank = Number(left?.market_cap_rank ?? Number.POSITIVE_INFINITY);
      const rightRank = Number(right?.market_cap_rank ?? Number.POSITIVE_INFINITY);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftVolume = Number(left?.total_volume ?? 0);
      const rightVolume = Number(right?.total_volume ?? 0);
      return rightVolume - leftVolume;
    })
    : [];

  if (!sorted.length) {
    return DEFAULT_CRYPTO_SYMBOLS.map((asset) => ({
      ...asset,
      current_price: null,
      price_change_percentage_24h: null,
      total_volume: null,
      market_cap_rank: null,
      last_updated: null,
      href: `https://www.coingecko.com/en/coins/${asset.id}`,
      label: asset.name,
      value: 'Awaiting live feed',
      detail: 'Connect CoinGecko market data to surface live prices and changes.',
      tone: 'idle',
    }));
  }

  return sorted.slice(0, 4).map((market) => {
    const price = toNumber(market.current_price ?? market.price ?? market.last_price);
    const change24h = toNumber(market.price_change_percentage_24h ?? market.price_change_percentage_24h_in_currency);
    const volume = toNumber(market.total_volume ?? market.volume ?? market.volume24h);
    const rank = market.market_cap_rank ?? market.rank ?? null;
    const name = market.name || market.symbol?.toUpperCase() || market.id || 'Asset';

    return {
      ...market,
      href: `https://www.coingecko.com/en/coins/${market.id || slugify(name)}`,
      label: name,
      value: price === null ? '—' : formatPrice(price),
      detail: [
        rank !== null ? `Rank #${rank}` : null,
        change24h === null ? null : `${formatSignedPercent(change24h)} 24h`,
        volume === null ? null : `Vol ${formatCompactUsd(volume)}`,
      ].filter(Boolean).join(' · ') || 'Live CoinGecko pulse',
      tone: 'live',
    };
  });
}

export function normalizePolymarketMarkets(markets = []) {
  const sorted = Array.isArray(markets)
    ? [...markets].sort((left, right) => {
      const leftLiquidity = toNumber(left?.liquidity ?? left?.liquidityNum ?? 0) ?? 0;
      const rightLiquidity = toNumber(right?.liquidity ?? right?.liquidityNum ?? 0) ?? 0;
      return rightLiquidity - leftLiquidity;
    })
    : [];

  if (!sorted.length) {
    return DEFAULT_POLYMARKET_PROMPTS.map((prompt, index) => ({
      question: prompt,
      slug: `placeholder-${index + 1}`,
      outcomePrices: null,
      outcomes: null,
      liquidity: null,
      volume: null,
      endDate: null,
      href: 'https://polymarket.com/',
      label: prompt,
      value: 'Awaiting live feed',
      detail: 'Connect Polymarket market data to surface active markets and liquidity leaders.',
      tone: 'idle',
    }));
  }

  return sorted.slice(0, 4).map((market) => {
    const question = cleanString(market.question || market.title || market.slug || 'Market');
    const outcomes = parseJsonish(market.outcomes) || [];
    const outcomePrices = parseJsonish(market.outcomePrices) || [];
    const yesPrice = toNumber(Array.isArray(outcomePrices) ? outcomePrices[0] : outcomePrices?.yes);
    const noPrice = toNumber(Array.isArray(outcomePrices) ? outcomePrices[1] : outcomePrices?.no);
    const liquidity = toNumber(market.liquidity ?? market.liquidityNum ?? market.liquidityClob);
    const volume = toNumber(market.volume ?? market.volumeNum ?? market.volume24hr ?? market.volume24hrClob);
    const endDate = market.endDate || market.endDateIso || market.end_date_iso || null;
    const slug = cleanString(market.slug || market.market_slug || slugify(question));
    const yesPercent = yesPrice === null ? null : clamp(yesPrice * 100, 0, 100);

    return {
      ...market,
      href: `https://polymarket.com/market/${slug}`,
      label: shortenText(question, 48),
      value: yesPercent === null ? '—' : `${Math.round(yesPercent)}% yes`,
      detail: [
        liquidity === null ? null : `Liquidity ${formatCompactUsd(liquidity)}`,
        volume === null ? null : `Volume ${formatCompactUsd(volume)}`,
        endDate ? `Closes ${formatDate(endDate)}` : null,
        yesPrice !== null && noPrice !== null ? `Yes ${formatPercent(yesPrice)} · No ${formatPercent(noPrice)}` : null,
        outcomes.length ? outcomes.join(' / ') : null,
      ].filter(Boolean).join(' · ') || 'Live Polymarket pulse',
      tone: 'live',
    };
  });
}

function buildCryptoLane(resources) {
  const liveCount = resources.filter((item) => item.tone === 'live').length;
  return {
    key: 'crypto',
    name: 'Crypto Markets',
    headline: 'Crypto markets lane',
    summary: liveCount
      ? 'CoinGecko spot data for the most relevant market leaders.'
      : 'CoinGecko spot data lane ready for live market input.',
    sourceCount: 1,
    chip: 'CoinGecko',
    resources,
    status: liveCount ? 'Live market pulse' : 'Awaiting market feed',
    detail: liveCount
      ? 'Track prices, 24h change, rank, and volume for market leaders.'
      : 'Seed the lane with CoinGecko market data when available.',
  };
}

function buildPolymarketLane(resources) {
  const liveCount = resources.filter((item) => item.tone === 'live').length;
  return {
    key: 'polymarket',
    name: 'Polymarket Betting',
    headline: 'Polymarket betting lane',
    summary: liveCount
      ? 'Active prediction markets ranked by liquidity and closing date.'
      : 'Polymarket lane ready for active market and liquidity data.',
    sourceCount: 2,
    chip: 'Polymarket',
    resources,
    status: liveCount ? 'Active markets loaded' : 'Awaiting market feed',
    detail: liveCount
      ? 'Use liquidity, pricing, and end dates to watch the sharpest boards.'
      : 'Seed the lane with live Polymarket market data when available.',
  };
}

function formatPrice(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return value >= 1 ? CURRENCY_ZERO_DECIMALS.format(value) : CURRENCY_TWO_DECIMALS.format(value);
}

function formatCompactUsd(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`;
  }

  return CURRENCY_TWO_DECIMALS.format(value);
}

function formatSignedPercent(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${PERCENT_ONE_DECIMAL.format(value)}%`;
}

function formatPercent(value) {
  return `${PERCENT_ONE_DECIMAL.format(value * 100)}%`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function cleanString(value) {
  return String(value || '').trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonish(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : parsed;
  } catch {
    return null;
  }
}

function shortenText(value, maxLength) {
  const text = cleanString(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function slugify(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'market';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
