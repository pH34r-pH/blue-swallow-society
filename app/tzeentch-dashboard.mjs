
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_CRYPTO_VIEW = '24h';
const DEFAULT_VIEW_OPTIONS = [
  { key: '24h', label: 'Last 24 hours' },
  { key: '5d', label: 'Last 5 days' },
];
const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDP', 'USDD', 'PYUSD', 'FRAX', 'USDE']);
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
  'about',
  'after',
  'before',
  'over',
  'under',
  'today',
  'now',
]);

export function createDemoDashboardDataset(now = Date.now()) {
  const demoAssets = [
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', base: 62100, swing: 2300, rank: 1, volume: 45800000000 },
    { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', base: 3470, swing: 240, rank: 2, volume: 24800000000 },
    { id: 'tether', name: 'Tether', symbol: 'USDT', base: 1, swing: 0.001, rank: 3, volume: 40000000000 },
    { id: 'xrp', name: 'XRP', symbol: 'XRP', base: 2.35, swing: 0.18, rank: 4, volume: 7200000000 },
    { id: 'solana', name: 'Solana', symbol: 'SOL', base: 165, swing: 14, rank: 5, volume: 6800000000 },
    { id: 'usd-coin', name: 'USD Coin', symbol: 'USDC', base: 1, swing: 0.001, rank: 6, volume: 6000000000 },
    { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', base: 0.18, swing: 0.018, rank: 7, volume: 5200000000 },
    { id: 'cardano', name: 'Cardano', symbol: 'ADA', base: 0.68, swing: 0.06, rank: 8, volume: 3800000000 },
    { id: 'tron', name: 'TRON', symbol: 'TRX', base: 0.29, swing: 0.012, rank: 9, volume: 3300000000 },
    { id: 'chainlink', name: 'Chainlink', symbol: 'LINK', base: 15.8, swing: 1.4, rank: 10, volume: 2800000000 },
  ];

  return {
    updatedAt: new Date(now).toISOString(),
    publicOnly: true,
    sourceFamilies: ['Hacker News', 'Reddit', 'CoinGecko', 'Polymarket Gamma'],
    warnings: [],
    murmurs: {
      hackerNews: [
        demoStory('hn-1', 'Open-source agents keep getting faster, and the tooling stack is spreading with them', 'https://news.ycombinator.com/', 'ph3', 482, 116, now - 90 * 60 * 1000, 'news.ycombinator.com', 'open source agents keep getting faster tooling stack'),
        demoStory('hn-2', 'A new local-first market dashboard surfaces public data without account friction', 'https://news.ycombinator.com/', 'synth', 363, 74, now - 140 * 60 * 1000, 'news.ycombinator.com', 'local first market dashboard public data'),
        demoStory('hn-3', 'Micro-frontend swipe patterns that actually work on touch devices', 'https://news.ycombinator.com/', 'trace', 225, 42, now - 4 * HOUR_MS, 'news.ycombinator.com', 'micro frontend swipe patterns touch devices'),
      ],
      reddit: [
        demoReddit('rd-1', 'A rapid meme cycle is pushing a niche AI tool into mainstream visibility', 'https://www.reddit.com/r/technology/', 'technology', 'riley', 20540, 1390, now - 75 * 60 * 1000, 'technology', 'rapid meme cycle niche ai tool mainstream visibility'),
        demoReddit('rd-2', 'Crypto traders are watching volume leadership more than headline price action this week', 'https://www.reddit.com/r/CryptoCurrency/', 'CryptoCurrency', 'nocturne', 16100, 870, now - 3 * HOUR_MS, 'cryptocurrency', 'crypto traders watching volume leadership headline price action'),
        demoReddit('rd-3', 'Prediction markets are turning small rumors into quick consensus tests', 'https://www.reddit.com/r/Polymarket/', 'Polymarket', 'oracle', 11200, 640, now - 5 * HOUR_MS, 'prediction markets', 'prediction markets turning rumors into consensus tests'),
      ],
    },
    crypto: {
      markets: demoAssets.map((asset, index) => buildDemoCoin(asset, now, index)),
      updatedAt: new Date(now).toISOString(),
    },
    polymarket: {
      newMarkets: [
        demoMarket('pm-1', 'Will the July build ship before the weekend?', 0.36, 0.64, 248000, 810000, now - 2 * HOUR_MS, now + 4 * DAY_MS, 'new build ships before weekend', 'new build ship before weekend'),
        demoMarket('pm-2', 'Will Bitcoin close the week above 70k?', 0.58, 0.42, 1260000, 3910000, now - 7 * HOUR_MS, now + 5 * DAY_MS, 'bitcoin close the week above 70k', 'bitcoin close week above 70k'),
      ],
      resolvedMarkets: [
        demoResolvedMarket('pm-r1', 'Did the earnings rumor spread faster than the correction?', 'Yes', 0.92, 0.08, 410000, 1320000, now - 6 * HOUR_MS, now - 5 * HOUR_MS, 'earnings rumor spread faster than the correction', 'earnings rumor spread faster correction'),
        demoResolvedMarket('pm-r2', 'Will the signal turn into a sustained trend?', 'No', 0.12, 0.88, 156000, 540000, now - 12 * HOUR_MS, now - 10 * HOUR_MS, 'signal turn into a sustained trend', 'signal turn into sustained trend'),
      ],
    },
  };
}

export function buildTzeentchDashboardModel(raw = {}, { now = Date.now(), cryptoView = DEFAULT_CRYPTO_VIEW } = {}) {
  const murmurs = buildMurmursModel(raw.murmurs || {}, now);
  const crypto = buildCryptoModel(raw.crypto || {}, { now, cryptoView, murmurs });
  const polymarket = buildPolymarketModel(raw.polymarket || {}, now);
  const actionable = buildActionableIntelModel({ murmurs, crypto, polymarket }, now);

  return {
    updatedAt: raw.updatedAt || new Date(now).toISOString(),
    publicOnly: raw.publicOnly !== false,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter(Boolean) : [],
    sourceFamilies: Array.isArray(raw.sourceFamilies) && raw.sourceFamilies.length
      ? raw.sourceFamilies.slice()
      : ['Hacker News', 'Reddit', 'CoinGecko', 'Polymarket Gamma'],
    accessNotes: [
      'CoinGecko and Polymarket Gamma read as public feeds; no account is needed for dashboard browsing.',
      'Any live execution path must use user-mediated sign-in/on-behalf-of flow and must never persist credentials.',
      'The current dashboard is paper-only and keeps live trading out of scope.',
    ],
    murmurs,
    crypto,
    polymarket,
    actionable,
  };
}

export function buildSparklinePath(points = [], { width = 100, height = 28 } = {}) {
  const series = normalizeSeries(points);
  if (!series.length) {
    return { line: '', fill: '', min: null, max: null, width, height };
  }

  const min = Math.min(...series.map((point) => point.p));
  const max = Math.max(...series.map((point) => point.p));
  const spread = max - min || 1;
  const step = series.length > 1 ? width / (series.length - 1) : 0;
  const coords = series.map((point, index) => {
    const x = index * step;
    const y = height - ((point.p - min) / spread) * height;
    return [x, y];
  });

  const line = coordsToPath(coords);
  const fill = `${line} L ${width.toFixed(2)} ${height.toFixed(2)} L 0 ${height.toFixed(2)} Z`;
  return { line, fill, min, max, width, height };
}

export function scoreVirality(item = {}, clusterCount = 1, now = Date.now()) {
  const ageMs = Math.max(now - (Date.parse(item.publishedAt || item.createdAt || now) || now), 1);
  const ageHours = ageMs / HOUR_MS;
  const engagement = Math.max(0, toNumber(item.score) || 0) * 2 + Math.max(0, toNumber(item.comments) || 0) * 3;
  const clusterBoost = Math.max(0, clusterCount - 1) * 8;
  const velocity = engagement / Math.pow(ageHours + 0.3, 0.85);
  const rawScore = Math.log10(velocity + 1) * 35 + clusterBoost;
  return clamp(Math.round(rawScore), 0, 100);
}

export function buildActionableIntelModel({ murmurs, crypto, polymarket } = {}, now = Date.now()) {
  const cryptoAssets = Array.isArray(crypto?.assets) ? crypto.assets.slice() : [];
  const murmursItems = Array.isArray(murmurs?.items) ? murmurs.items.slice() : [];
  const activeMarkets = Array.isArray(polymarket?.newMarkets) ? polymarket.newMarkets.slice() : [];

  const buyCandidates = cryptoAssets
    .filter((asset) => !asset.isStablecoin)
    .sort((left, right) => right.trendScore - left.trendScore);
  const sellCandidates = cryptoAssets
    .filter((asset) => !asset.isStablecoin)
    .sort((left, right) => left.trendScore - right.trendScore);

  const proposals = [];

  if (buyCandidates[0]) {
    proposals.push(buildCryptoProposal('buy', buyCandidates[0], murmursItems, now));
  }
  if (buyCandidates[1] && buyCandidates[1].trendScore > 0.1) {
    proposals.push(buildCryptoProposal('buy', buyCandidates[1], murmursItems, now));
  }
  if (sellCandidates[0]) {
    proposals.push(buildCryptoProposal('sell', sellCandidates[0], murmursItems, now));
  }
  if (sellCandidates[1]) {
    proposals.push(buildCryptoProposal('sell', sellCandidates[1], murmursItems, now));
  }

  const marketPick = pickPolymarketCandidate(activeMarkets);
  if (marketPick) {
    proposals.push(buildPolymarketProposal(marketPick, murmursItems, now));
  }

  const deduped = dedupeProposals(proposals)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 6);

  return {
    paperOnly: true,
    reviewCadence: '24h',
    summary: deduped.length
      ? `${deduped.length} paper candidates queued for review.`
      : 'No strong paper candidates yet; keep gathering public signals.',
    loopNote: 'Paper-only loop: record thesis, watch outcomes, and promote only net-positive patterns.',
    proposals: deduped,
  };
}

function buildMurmursModel(raw = {}, now = Date.now()) {
  const sourceItems = [
    ...(Array.isArray(raw.hackerNews) ? raw.hackerNews : []),
    ...(Array.isArray(raw.reddit) ? raw.reddit : []),
  ]
    .map((item) => normalizeMurmursItem(item))
    .filter(Boolean);

  const clusters = buildTopicClusters(sourceItems);
  const items = sourceItems
    .map((item) => {
      const cluster = clusters.get(item.topicKey) || [];
      const clusterCount = cluster.length;
      const viralityScore = scoreVirality(item, clusterCount, now);
      const ageLabel = formatRelativeTime(item.publishedAt || item.createdAt, now);
      return {
        ...item,
        clusterCount,
        viralityScore,
        viralityLabel: viralityLabelForScore(viralityScore, clusterCount),
        ageLabel,
        signalLabel: item.source === 'Hacker News' ? 'HN' : item.source,
        spreadLabel: clusterCount > 1 ? `${clusterCount} posts share this beat` : 'single-source pulse',
      };
    })
    .sort((left, right) => {
      if (right.viralityScore !== left.viralityScore) {
        return right.viralityScore - left.viralityScore;
      }
      if ((right.score || 0) !== (left.score || 0)) {
        return (right.score || 0) - (left.score || 0);
      }
      return (right.comments || 0) - (left.comments || 0);
    });

  const hero = items[0] || null;
  const viralCount = items.filter((item) => item.viralityScore >= 70).length;
  const crossSourceCount = items.filter((item) => item.clusterCount > 1).length;
  const sourceCounts = items.reduce((acc, item) => {
    acc[item.source] = (acc[item.source] || 0) + 1;
    return acc;
  }, {});

  return {
    updatedAt: new Date(now).toISOString(),
    items,
    hero,
    clusters: Array.from(clusters.entries())
      .map(([topicKey, groupedItems]) => ({
        topicKey,
        count: groupedItems.length,
        sources: uniqueValues(groupedItems.map((item) => item.source)),
        topItem: groupedItems.slice().sort((left, right) => right.viralityScore - left.viralityScore)[0] || null,
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
    metrics: [
      {
        label: 'Signals',
        value: String(items.length),
        detail: 'HN + Reddit public feed items',
      },
      {
        label: 'Cross-source beats',
        value: String(crossSourceCount),
        detail: 'Content showing up in multiple places',
      },
      {
        label: 'Rapid spread',
        value: String(viralCount),
        detail: 'Virality score above 70',
      },
      {
        label: 'Top source',
        value: topSourceLabel(sourceCounts),
        detail: 'Where the feed is hottest right now',
      },
    ],
    summary: hero
      ? `${hero.source} is leading with ${hero.viralityLabel.toLowerCase()} coverage.`
      : 'No murmur signals loaded yet.',
  };
}

function buildCryptoModel(raw = {}, { now = Date.now(), cryptoView = DEFAULT_CRYPTO_VIEW, murmurs = null } = {}) {
  const markets = Array.isArray(raw.markets) ? raw.markets.map((market) => normalizeCryptoAsset(market, now)).filter(Boolean) : [];
  const assets = markets
    .sort((left, right) => (right.totalVolume || 0) - (left.totalVolume || 0))
    .slice(0, 10)
    .map((asset) => enrichCryptoAsset(asset, now, murmurs));

  const views = DEFAULT_VIEW_OPTIONS.reduce((acc, view) => {
    acc[view.key] = {
      key: view.key,
      label: view.label,
      headline: view.key === '24h' ? 'Volume leaders over the last 24 hours' : 'Volume leaders over the last 5 days',
      assets: assets.map((asset) => projectCryptoAssetForView(asset, view.key)),
    };
    return acc;
  }, {});

  return {
    updatedAt: raw.updatedAt || new Date(now).toISOString(),
    activeView: views[cryptoView] ? cryptoView : DEFAULT_CRYPTO_VIEW,
    viewOptions: DEFAULT_VIEW_OPTIONS.map((entry) => ({ ...entry })),
    assets,
    views,
    summary: assets.length
      ? `${assets.length} public market leaders from CoinGecko, sorted by trading volume.`
      : 'CoinGecko market feed is empty.',
  };
}

function buildPolymarketModel(raw = {}, now = Date.now()) {
  const newMarkets = Array.isArray(raw.newMarkets) ? raw.newMarkets.map((market) => normalizePolymarketItem(market, now)).filter(Boolean) : [];
  const resolvedMarkets = Array.isArray(raw.resolvedMarkets) ? raw.resolvedMarkets.map((market) => normalizePolymarketItem(market, now)).filter(Boolean) : [];

  return {
    updatedAt: raw.updatedAt || new Date(now).toISOString(),
    newMarkets,
    resolvedMarkets,
    summary: [
      `${newMarkets.length} fresh public markets`,
      `${resolvedMarkets.length} recent resolutions`,
    ].join(' · '),
  };
}

function normalizeMurmursItem(item = {}) {
  const title = cleanString(item.title);
  const url = cleanString(item.url);
  const publishedAt = item.publishedAt || item.createdAt || null;
  const source = cleanString(item.source) || (item.subreddit ? `r/${item.subreddit}` : 'Web');

  if (!title) {
    return null;
  }

  return {
    id: cleanString(item.id) || `${source}:${title}`,
    title,
    url: url || null,
    source,
    author: cleanString(item.author) || null,
    subreddit: cleanString(item.subreddit) || null,
    score: toNumber(item.score) || 0,
    comments: toNumber(item.comments) || 0,
    publishedAt,
    domain: cleanString(item.domain) || null,
    topicKey: cleanString(item.topicKey) || topicKeyFromText(title),
  };
}

function buildTopicClusters(items) {
  const clusters = new Map();
  for (const item of items) {
    const key = item.topicKey || topicKeyFromText(item.title);
    if (!clusters.has(key)) {
      clusters.set(key, []);
    }
    clusters.get(key).push(item);
  }
  return clusters;
}

function normalizeCryptoAsset(asset = {}, now = Date.now()) {
  const sparklinePrices = Array.isArray(asset.sparklinePrices) ? asset.sparklinePrices.map((point) => toNumber(point)).filter((point) => Number.isFinite(point)) : [];
  const lastUpdated = asset.lastUpdated ? Date.parse(asset.lastUpdated) : now;
  const series7d = pricesToSeries(sparklinePrices, lastUpdated || now, 7);
  const series5d = sliceSeries(series7d, now - 5 * DAY_MS);
  const series24h = sliceSeries(series7d, now - DAY_MS);
  const change24h = Number.isFinite(asset.priceChange24h) ? asset.priceChange24h : percentChange(series24h);
  const change5d = percentChange(series5d);
  const trendScore = calculateTrendScore(change24h, change5d, asset.marketCapRank);

  return {
    id: cleanString(asset.id) || null,
    name: cleanString(asset.name) || null,
    symbol: cleanString(asset.symbol) || null,
    image: cleanString(asset.image) || null,
    currentPrice: toNumber(asset.currentPrice),
    marketCap: toNumber(asset.marketCap),
    marketCapRank: toNumber(asset.marketCapRank),
    totalVolume: toNumber(asset.totalVolume),
    priceChange24h: change24h,
    priceChange5d: change5d,
    priceLabel: formatTokenPrice(asset.currentPrice),
    volumeLabel: formatCompactUsd(asset.totalVolume),
    marketCapLabel: formatCompactUsd(asset.marketCap),
    changeLabel: formatSignedPercent(change24h),
    change5dLabel: formatSignedPercent(change5d),
    high24h: toNumber(asset.high24h),
    low24h: toNumber(asset.low24h),
    sparklinePrices,
    series7d,
    series5d,
    series24h,
    trendScore,
    isStablecoin: STABLECOINS.has(cleanString(asset.symbol).toUpperCase()),
    lastUpdated: asset.lastUpdated || new Date(lastUpdated || now).toISOString(),
    topicKey: cleanString(asset.topicKey) || topicKeyFromText(asset.name),
  };
}

function enrichCryptoAsset(asset = {}, now = Date.now(), murmurs = null) {
  const mentions = findMurmurMentions(asset, murmurs);
  const mentionBoost = mentions.length ? Math.min(0.18, mentions.length * 0.06) : 0;
  const trendScore = clamp(asset.trendScore + mentionBoost, -1, 1);
  return {
    ...asset,
    mentions,
    trendScore,
    trendLabel: trendLabelForScore(trendScore),
  };
}

function projectCryptoAssetForView(asset = {}, viewKey = '24h') {
  const series = viewKey === '5d' ? asset.series5d : asset.series24h;
  const change = viewKey === '5d' ? asset.priceChange5d : asset.priceChange24h;
  const sparkline = buildSparklinePath(series);
  const selectedSeries = Array.isArray(series) ? series : [];
  const startPrice = selectedSeries.length ? selectedSeries[0].p : null;
  const endPrice = selectedSeries.length ? selectedSeries[selectedSeries.length - 1].p : null;

  return {
    ...asset,
    selectedView: viewKey,
    change,
    changeLabel: formatSignedPercent(change),
    priceLabel: formatTokenPrice(asset.currentPrice),
    volumeLabel: formatCompactUsd(asset.totalVolume),
    marketCapLabel: formatCompactUsd(asset.marketCap),
    sparkline,
    selectedSeries,
    priceRangeLabel: selectedSeries.length
      ? `${formatTokenPrice(startPrice)} → ${formatTokenPrice(endPrice)}`
      : 'No chart data',
    viewLabel: viewKey === '24h' ? '24H' : '5D',
  };
}

function normalizePolymarketItem(item = {}, now = Date.now()) {
  if (!item) {
    return null;
  }

  const outcomes = parseList(item.outcomes || item.outcomesArray);
  const outcomePrices = parseList(item.outcomePrices || item.outcomePricesArray).map((value) => toNumber(value)).filter((value) => Number.isFinite(value));
  const winningIndex = outcomePrices.length ? outcomePrices.indexOf(Math.max(...outcomePrices)) : -1;
  const winner = winningIndex >= 0 ? outcomes[winningIndex] || null : null;
  const liquidity = toNumber(item.liquidity);
  const volume = toNumber(item.volume);
  const volume24hr = toNumber(item.volume24hr);
  const yesPrice = outcomePrices[0] ?? null;
  const noPrice = outcomePrices[1] ?? null;
  const createdAt = item.createdAt || item.creationDate || null;
  const updatedAt = item.updatedAt || item.creationDate || createdAt;
  const resolvedAt = item.resolvedAt || item.closedTime || item.updatedAt || updatedAt;
  const endDate = item.endDate || null;
  const label = item.closed ? 'Resolved' : item.active ? 'Active' : 'Queued';

  return {
    id: cleanString(item.id) || null,
    slug: cleanString(item.slug) || null,
    title: cleanString(item.question || item.title) || 'Untitled market',
    description: cleanString(item.description) || null,
    image: cleanString(item.image || item.icon) || null,
    icon: cleanString(item.icon) || null,
    active: Boolean(item.active),
    closed: Boolean(item.closed),
    archived: Boolean(item.archived),
    liquidity,
    volume,
    volume24hr,
    openInterest: toNumber(item.openInterest),
    yesPrice,
    noPrice,
    outcomePrices,
    outcomes,
    winner,
    createdAt,
    updatedAt,
    resolvedAt,
    endDate,
    label,
    marketUrl: item.marketUrl || (item.slug ? `https://polymarket.com/event/${encodeURIComponent(item.slug)}` : null),
    resolutionSource: cleanString(item.resolutionSource) || null,
    umaResolutionStatus: cleanString(item.umaResolutionStatus) || null,
    resolvedBy: cleanString(item.resolvedBy) || null,
    contextDescription: cleanString(item.contextDescription) || null,
    timeLabel: item.closed ? formatRelativeTime(resolvedAt, now) : formatRelativeTime(createdAt, now),
    endLabel: endDate ? formatFutureTime(endDate, now) : null,
    priceLabel: yesPrice !== null ? `${formatPercent(yesPrice)} / ${formatPercent(noPrice)}` : '—',
    liquidityLabel: formatCompactUsd(liquidity),
    volumeLabel: formatCompactUsd(volume),
    volume24hrLabel: formatCompactUsd(volume24hr),
    resolutionLabel: winner ? `Resolved to ${winner}` : item.closed ? 'Resolved' : 'Open',
    topicKey: cleanString(item.topicKey) || topicKeyFromText(item.title || item.question),
  };
}

function buildCryptoProposal(side, asset, murmursItems, now) {
  const mentions = asset.mentions || [];
  const isBuy = side === 'buy';
  const rationale = [];
  rationale.push(`${asset.name} is trading at ${asset.trendLabel.toLowerCase()} momentum with ${asset.changeLabel} over the selected window.`);
  rationale.push(`Volume rank ${asset.marketCapRank || 'n/a'} and ${asset.volumeLabel} in public trading volume.`);
  if (mentions.length) {
    rationale.push(`Murmurs cross-check: ${mentions.length} related public posts are touching this beat.`);
  }

  const confidence = clamp(
    Math.round(50 + Math.abs(asset.trendScore) * 35 + (mentions.length ? 6 : 0) + ((asset.totalVolume || 0) > 1_000_000_000 ? 5 : 0)),
    15,
    96,
  );

  return {
    id: `${side}:${asset.id}`,
    side,
    instrumentType: 'crypto',
    assetId: asset.id,
    title: `${isBuy ? 'Buy' : 'Sell'} ${asset.symbol || asset.name}`,
    label: asset.name,
    subtitle: `${asset.symbol || asset.name} spot`,
    thesis: isBuy
      ? `${asset.name} is leading the volume board with positive price pressure.`
      : `${asset.name} is underperforming while liquidity remains high enough to trim or fade.`,
    justification: rationale,
    evidence: [
      `24h ${asset.changeLabel}`,
      `5d ${formatSignedPercent(asset.priceChange5d)}`,
      asset.volumeLabel,
      ...(mentions.slice(0, 2).map((item) => `Murmur: ${item.title}`)),
    ],
    confidence,
    paperOnly: true,
    horizon: '24h-5d',
    actionText: isBuy ? 'Paper buy' : 'Paper sell',
    sourceLinks: asset.mentions?.length ? asset.mentions.slice(0, 2).map((item) => item.url).filter(Boolean) : [],
  };
}

function buildPolymarketProposal(market, murmursItems, now) {
  const mentions = matchMarketToMurmurs(market, murmursItems);
  const yesPrice = market.yesPrice !== null ? market.yesPrice : 0.5;
  const side = yesPrice <= 0.5 ? 'buy' : 'sell';
  const stance = side === 'buy' ? 'Buy YES' : 'Buy NO';
  const confidence = clamp(
    Math.round(48 + (0.5 - Math.abs(yesPrice - 0.5)) * 70 + (market.liquidity ? Math.min(14, Math.log10(market.liquidity + 1) * 2) : 0)),
    20,
    94,
  );

  const rationale = [
    `${market.title} is public, recent, and still forming price discovery.`,
    `${market.priceLabel} with ${market.liquidityLabel} liquidity and ${market.volumeLabel} total volume.`,
  ];
  if (mentions.length) {
    rationale.push(`Murmurs match: ${mentions.length} public event(s) are talking about the same beat.`);
  }
  if (market.endLabel) {
    rationale.push(`Window closes ${market.endLabel}.`);
  }

  return {
    id: `polymarket:${market.id || market.slug || market.title}`,
    side: 'buy',
    instrumentType: 'polymarket',
    assetId: market.id,
    title: `${stance} on ${market.title}`,
    label: market.title,
    subtitle: market.label || 'Polymarket event',
    thesis: yesPrice <= 0.5
      ? 'The market is still cheap enough to buy a directional stake while the board is liquid.'
      : 'The board looks rich; use the opposite side or wait for a better entry.',
    justification: rationale,
    evidence: [
      market.priceLabel,
      market.liquidityLabel,
      market.volumeLabel,
      ...(mentions.slice(0, 2).map((item) => `Murmur: ${item.title}`)),
    ],
    confidence,
    paperOnly: true,
    horizon: market.endLabel ? `Until ${market.endLabel}` : 'event horizon',
    actionText: stance,
    sourceLinks: market.marketUrl ? [market.marketUrl] : [],
  };
}

function pickPolymarketCandidate(markets = []) {
  const liquid = markets
    .filter((market) => market && (market.liquidity || 0) > 50_000)
    .sort((left, right) => (right.liquidity || 0) - (left.liquidity || 0) || compareIso(right.createdAt, left.createdAt));
  return liquid[0] || markets[0] || null;
}

function buildDemoCoin(asset, now, index) {
  const points = buildDemoSeries(asset.base, asset.swing, 168, now, index);
  return {
    id: asset.id,
    name: asset.name,
    symbol: asset.symbol,
    image: `https://dummyimage.com/64x64/0b1220/55e8ff.png&text=${encodeURIComponent(asset.symbol.slice(0, 2))}`,
    currentPrice: asset.base,
    marketCap: asset.volume * 30,
    marketCapRank: asset.rank,
    totalVolume: asset.volume,
    priceChange24h: roundPercent(((points[points.length - 1] - points[points.length - 25]) / points[points.length - 25]) * 100),
    priceChange5d: roundPercent(((points[points.length - 1] - points[points.length - 120]) / points[points.length - 120]) * 100),
    high24h: Math.max(...points.slice(-24)),
    low24h: Math.min(...points.slice(-24)),
    lastUpdated: new Date(now).toISOString(),
    sparklinePrices: points,
  };
}

function demoStory(id, title, url, author, score, comments, publishedAt, domain, topicKey) {
  return {
    id,
    title,
    url,
    author,
    score,
    comments,
    publishedAt: new Date(publishedAt).toISOString(),
    source: 'Hacker News',
    domain,
    topicKey,
  };
}

function demoReddit(id, title, url, subreddit, author, score, comments, publishedAt, domain, topicKey) {
  return {
    id,
    title,
    url,
    subreddit,
    author,
    score,
    comments,
    publishedAt: new Date(publishedAt).toISOString(),
    source: `r/${subreddit}`,
    domain,
    topicKey,
  };
}

function demoMarket(id, title, yesPrice, noPrice, liquidity, volume, createdAt, endDate, contextDescription, topicKey) {
  return {
    id,
    slug: id,
    title,
    description: contextDescription,
    image: null,
    icon: null,
    active: true,
    closed: false,
    archived: false,
    liquidity,
    volume,
    volume24hr: Math.round(volume * 0.24),
    openInterest: Math.round(liquidity * 1.8),
    yesPrice,
    noPrice,
    outcomePrices: [yesPrice, noPrice],
    outcomes: ['Yes', 'No'],
    winner: null,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(createdAt).toISOString(),
    resolvedAt: null,
    endDate: new Date(endDate).toISOString(),
    label: 'Active',
    marketUrl: `https://polymarket.com/event/${encodeURIComponent(id)}`,
    resolutionSource: 'https://polymarket.com/',
    umaResolutionStatus: null,
    resolvedBy: null,
    contextDescription,
    topicKey,
  };
}

function demoResolvedMarket(id, title, winner, yesPrice, noPrice, liquidity, volume, createdAt, resolvedAt, contextDescription, topicKey) {
  return {
    id,
    slug: id,
    title,
    description: contextDescription,
    image: null,
    icon: null,
    active: false,
    closed: true,
    archived: false,
    liquidity,
    volume,
    volume24hr: Math.round(volume * 0.2),
    openInterest: Math.round(liquidity * 1.2),
    yesPrice,
    noPrice,
    outcomePrices: [yesPrice, noPrice],
    outcomes: ['Yes', 'No'],
    winner,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(resolvedAt).toISOString(),
    resolvedAt: new Date(resolvedAt).toISOString(),
    endDate: new Date(resolvedAt).toISOString(),
    label: 'Resolved',
    marketUrl: `https://polymarket.com/event/${encodeURIComponent(id)}`,
    resolutionSource: 'https://polymarket.com/',
    umaResolutionStatus: 'resolved',
    resolvedBy: '0x0000000000000000000000000000000000000000',
    contextDescription,
    topicKey,
  };
}

function buildDemoSeries(base, swing, count, now, seed = 0) {
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const phase = index / Math.max(1, count - 1);
    const wave = Math.sin(phase * Math.PI * 3 + seed * 0.45) * swing * 0.18;
    const trend = swing * (phase - 0.5);
    const wobble = Math.cos(phase * Math.PI * 8 + seed) * swing * 0.04;
    points.push(roundNumber(base + trend + wave + wobble));
  }
  return points;
}

function buildSeries(points, lastUpdatedMs, spanDays = 7) {
  const values = Array.isArray(points) ? points.map((value) => toNumber(value)).filter((value) => Number.isFinite(value)) : [];
  if (!values.length) {
    return [];
  }

  const end = Number.isFinite(lastUpdatedMs) ? lastUpdatedMs : Date.now();
  const start = end - spanDays * DAY_MS;
  const step = values.length > 1 ? (end - start) / (values.length - 1) : 0;
  return values.map((price, index) => ({
    t: start + index * step,
    p: price,
  }));
}

function pricesToSeries(points, lastUpdatedMs, spanDays = 7) {
  return buildSeries(points, lastUpdatedMs, spanDays);
}

function sliceSeries(series, cutoffMs) {
  const points = Array.isArray(series) ? series.filter((point) => point && point.t >= cutoffMs) : [];
  if (points.length >= 2) {
    return points;
  }
  if (Array.isArray(series) && series.length > 2) {
    return series.slice(Math.max(0, series.length - 48));
  }
  return Array.isArray(series) ? series.slice() : [];
}

function percentChange(series = []) {
  if (!Array.isArray(series) || series.length < 2) {
    return null;
  }
  const first = series[0].p;
  const last = series[series.length - 1].p;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) {
    return null;
  }
  return roundPercent(((last - first) / first) * 100);
}

function calculateTrendScore(change24h, change5d, rank) {
  const normalized24h = clamp((change24h || 0) / 12, -1, 1);
  const normalized5d = clamp((change5d || 0) / 18, -1, 1);
  const rankBias = Number.isFinite(rank) ? clamp((11 - rank) / 10, 0, 1) : 0.5;
  return clamp(normalized24h * 0.58 + normalized5d * 0.42 + rankBias * 0.12, -1, 1);
}

function findMurmurMentions(asset, murmurs) {
  const items = Array.isArray(murmurs) ? murmurs : [];
  const needles = [asset.symbol, asset.name, asset.topicKey]
    .map((value) => cleanString(value).toLowerCase())
    .filter(Boolean);
  if (!needles.length) {
    return [];
  }

  return items.filter((item) => {
    const title = cleanString(item.title).toLowerCase();
    return needles.some((needle) => title.includes(needle));
  });
}

function matchMarketToMurmurs(market, murmurs) {
  const items = Array.isArray(murmurs) ? murmurs : [];
  const needles = [market.title, market.topicKey]
    .map((value) => cleanString(value).toLowerCase())
    .filter(Boolean);
  if (!needles.length) {
    return [];
  }

  return items.filter((item) => {
    const title = cleanString(item.title).toLowerCase();
    return needles.some((needle) => title.includes(needle) || needle.includes(title));
  });
}

function viralityLabelForScore(score, clusterCount) {
  if (clusterCount > 1 && score >= 80) {
    return 'Wildfire';
  }
  if (clusterCount > 1 && score >= 65) {
    return 'Spreading fast';
  }
  if (score >= 65) {
    return 'Loud';
  }
  if (score >= 45) {
    return 'Building';
  }
  return 'Early';
}

function trendLabelForScore(score) {
  if (score > 0.55) {
    return 'strong up';
  }
  if (score > 0.2) {
    return 'up';
  }
  if (score < -0.55) {
    return 'strong down';
  }
  if (score < -0.2) {
    return 'down';
  }
  return 'flat';
}

function topSourceLabel(counts = {}) {
  const entries = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  if (!entries.length) {
    return '—';
  }
  return entries[0][0];
}

function formatCompactUsd(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  if (Math.abs(value) >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return formatTokenPrice(value);
}

function formatTokenPrice(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  if (Math.abs(value) >= 1000) {
    return `$${value.toFixed(0)}`;
  }
  if (Math.abs(value) >= 1) {
    return `$${value.toFixed(2).replace(/\.00$/, '')}`;
  }
  if (Math.abs(value) >= 0.01) {
    return `$${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
  }
  return `$${value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2).replace(/\.00$/, '')}%`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(0)}%`;
}

function formatRelativeTime(iso, now = Date.now()) {
  const timestamp = Date.parse(iso || '');
  if (!Number.isFinite(timestamp)) {
    return 'recent';
  }

  const diff = Math.max(now - timestamp, 0);
  if (diff < HOUR_MS) {
    const minutes = Math.max(1, Math.round(diff / 60000));
    return `${minutes}m ago`;
  }
  if (diff < DAY_MS) {
    const hours = Math.max(1, Math.round(diff / HOUR_MS));
    return `${hours}h ago`;
  }
  const days = Math.max(1, Math.round(diff / DAY_MS));
  return `${days}d ago`;
}

function formatFutureTime(iso, now = Date.now()) {
  const timestamp = Date.parse(iso || '');
  if (!Number.isFinite(timestamp)) {
    return 'soon';
  }

  const diff = timestamp - now;
  if (diff <= 0) {
    return 'closing soon';
  }
  if (diff < HOUR_MS) {
    const minutes = Math.max(1, Math.round(diff / 60000));
    return `in ${minutes}m`;
  }
  if (diff < DAY_MS) {
    const hours = Math.max(1, Math.round(diff / HOUR_MS));
    return `in ${hours}h`;
  }
  const days = Math.max(1, Math.round(diff / DAY_MS));
  return `in ${days}d`;
}

function normalizeSeries(points = []) {
  const series = Array.isArray(points)
    ? points
        .map((point) => {
          if (Array.isArray(point) && point.length >= 2) {
            return { t: toNumber(point[0]), p: toNumber(point[1]) };
          }
          if (point && typeof point === 'object') {
            return { t: toNumber(point.t ?? point.time ?? point.timestamp), p: toNumber(point.p ?? point.price ?? point.value) };
          }
          return { t: null, p: toNumber(point) };
        })
        .filter((point) => Number.isFinite(point.p))
    : [];
  return series;
}

function coordsToPath(coords = []) {
  if (!coords.length) {
    return '';
  }
  return coords
    .map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord[0].toFixed(2)} ${coord[1].toFixed(2)}`)
    .join(' ');
}

function dedupeProposals(proposals = []) {
  const seen = new Set();
  return proposals.filter((proposal) => {
    const key = `${proposal.side}:${proposal.instrumentType}:${proposal.assetId || proposal.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueValues(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function roundNumber(value) {
  if (!Number.isFinite(value)) {
    return value;
  }
  return Math.round(value * 100) / 100;
}

function roundPercent(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
}
