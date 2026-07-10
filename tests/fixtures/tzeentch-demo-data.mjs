const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function createDemoChainedDaemonObservations() {
  return [
    {
      id: 'obs-wifi-001',
      sensor: 'wigle-local',
      kind: 'wifi_ap',
      label: 'CorpGuest-Redmond-5G',
      tokens: ['corp', 'guest', 'redmond'],
      timeBucket: 'weekday-am-commute',
      route: 'bellevue-transit-loop',
      geoBucket: 'geohash-9q9j-demo',
      recurrence: 1,
      independentSources: 1,
      gpsQuality: 'medium',
      collectionQuality: 'rain-noisy',
      scopePosition: 'inside-field-scope',
      privacy: 'org-adjacent-string',
    },
    {
      id: 'obs-ble-002',
      sensor: 'flipper-passive',
      kind: 'ble_advert',
      label: 'BADGE-042-demo',
      tokens: ['badge', '042', 'demo'],
      timeBucket: 'weekday-am-commute',
      route: 'bellevue-transit-loop',
      geoBucket: 'geohash-9q9j-demo',
      recurrence: 1,
      independentSources: 1,
      gpsQuality: 'low',
      collectionQuality: 'rain-noisy',
      scopePosition: 'edge-of-field-scope',
      privacy: 'identity-adjacent-string',
    },
    {
      id: 'obs-wifi-003',
      sensor: 'wigle-local',
      kind: 'wifi_ap',
      label: 'xfinitywifi',
      tokens: ['public', 'carrier', 'wifi'],
      timeBucket: 'multiple',
      route: 'bellevue-transit-loop',
      geoBucket: 'geohash-9q9j-demo',
      recurrence: 4,
      independentSources: 1,
      gpsQuality: 'high',
      collectionQuality: 'clear',
      scopePosition: 'inside-field-scope',
      privacy: 'low',
    },
    {
      id: 'obs-wifi-004',
      sensor: 'wigle-local',
      kind: 'wifi_ap',
      label: 'BSS-DeadDrop',
      tokens: ['bss', 'dead', 'drop'],
      timeBucket: 'evening-field-test',
      route: 'capitol-hill-loop',
      geoBucket: 'geohash-9q9p-demo',
      recurrence: 1,
      independentSources: 1,
      gpsQuality: 'medium',
      collectionQuality: 'clear',
      scopePosition: 'inside-field-scope',
      privacy: 'narrative-lure-string',
    },
    {
      id: 'obs-note-005',
      sensor: 'user-note',
      kind: 'annotation',
      label: 'rain degraded BLE collection near station awning',
      tokens: ['rain', 'ble', 'station', 'quality'],
      timeBucket: 'weekday-am-commute',
      route: 'bellevue-transit-loop',
      geoBucket: 'geohash-9q9j-demo',
      recurrence: 1,
      independentSources: 1,
      gpsQuality: 'n/a',
      collectionQuality: 'operator-note',
      scopePosition: 'inside-field-scope',
      privacy: 'low',
    },
  ];
}

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
    chainedDaemon: {
      observations: createDemoChainedDaemonObservations(),
    },
  };
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
