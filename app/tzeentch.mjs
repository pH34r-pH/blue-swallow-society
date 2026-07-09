import { buildTzeentchDashboardModel, createDemoDashboardDataset } from './tzeentch-dashboard.mjs';

const STORAGE_KEY = 'blue-swallow-society:tzeentch:recent-queries';
const MAX_RECENT = 6;

const state = {
  bound: false,
  loaded: false,
  busy: false,
  abortController: null,
  recent: loadRecentQueries(),
  marketModel: null,
  marketTab: 'murmurs',
  marketTouch: null,
  marketFetchPromise: null,
  marketBound: false,
};

const $ = (id) => document.getElementById(id);

export function initTzeentchDashboard({ refresh = false } = {}) {
  const queryInput = $('tzeentchQuery');
  const modeSelect = $('tzeentchMode');
  const searchBtn = $('tzeentchSearchBtn');
  const clearBtn = $('tzeentchClearBtn');

  if (!queryInput || !modeSelect || !searchBtn || !clearBtn) {
    return;
  }

  if (!state.bound) {
    searchBtn.addEventListener('click', () => runCurrentQuery());
    clearBtn.addEventListener('click', () => {
      queryInput.value = '';
      modeSelect.value = 'auto';
      loadOverview({ focus: true });
    });
    queryInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runCurrentQuery();
      }
    });
    modeSelect.addEventListener('change', () => {
      if (!queryInput.value.trim()) {
        loadOverview();
      }
    });
    state.bound = true;
  }

  renderRecentQueries();
  void loadTzeentchMarketFeed({ refresh });

  if (!state.loaded || refresh) {
    void loadOverview();
  }
}

async function runCurrentQuery() {
  const query = $('tzeentchQuery')?.value.trim() || '';
  const mode = $('tzeentchMode')?.value || 'auto';
  if (!query) {
    await loadOverview({ focus: true });
    return;
  }
  await runScan(query, mode, { recordRecent: true });
}

async function loadOverview({ focus = false } = {}) {
  const queryInput = $('tzeentchQuery');
  if (queryInput) {
    queryInput.placeholder = 'example.com, @handle, 8.8.8.8, or a URL';
  }
  await runScan('', 'overview', { recordRecent: false, focus });
}

async function runScan(query, mode, { recordRecent = true, focus = false } = {}) {
  const status = $('tzeentchStatus');
  const searchBtn = $('tzeentchSearchBtn');
  const clearBtn = $('tzeentchClearBtn');

  abortInFlight();
  const controller = new AbortController();
  state.abortController = controller;
  state.busy = true;

  setBusy(true);
  setStatus(status, query ? `Scanning ${query}…` : 'Loading live overview…');

  try {
    const url = new URL('/api/osint', window.location.origin);
    if (query) {
      url.searchParams.set('query', query);
      url.searchParams.set('mode', mode || 'auto');
    } else {
      url.searchParams.set('limit', '5');
      url.searchParams.set('mode', 'overview');
    }

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`OSINT endpoint returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      if (!contentType.includes('json')) {
        throw new Error('OSINT backend is not mounted in this local server.');
      }

      throw new Error('OSINT backend returned invalid JSON.');
    }
    if (!payload || payload.ok !== true) {
      throw new Error(payload?.error || 'OSINT endpoint returned an empty payload.');
    }

    renderPayload(payload, query ? { query, mode } : { query: '', mode: 'overview' });

    if (query && recordRecent) {
      rememberRecentQuery(query, mode, payload);
    }

    state.loaded = true;
    if (focus) {
      $('tzeentchQuery')?.focus();
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    console.error('Tzeentch scan failed', error);
    setStatus(status, `Scan unavailable: ${error.message}`);
    renderFailure(error.message);
  } finally {
    state.busy = false;
    state.abortController = null;
    setBusy(false);
    if (searchBtn) searchBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;
  }
}

function renderPayload(payload, requestMeta) {
  setText('tzeentchMetricType', payload.detectedLabel || 'Overview');
  setText('tzeentchMetricTypeNote', payload.normalizedQuery || payload.summary || 'Awaiting target.');
  setText('tzeentchMetricSources', String(payload.metrics?.sourceCount ?? 0));
  setText('tzeentchMetricFindings', String(payload.metrics?.findingCount ?? 0));
  setText('tzeentchMetricFindingsNote', payload.headline || payload.summary || 'Signals updated.');
  setText('tzeentchMetricRefresh', formatTimestamp(payload.metrics?.updatedAt));
  setText('tzeentchMetricRefreshNote', requestMeta.query ? `Mode: ${requestMeta.mode}` : 'Live overview from public feeds.');

  setStatus($('tzeentchStatus'), payload.summary || 'Dashboard updated.');

  renderSourceChips(payload.supportedSources || []);
  renderSourceCards(payload.sources || []);
  renderApplications([]);
  void loadTzeentchMarketFeed();
  renderRows('tzeentchProfile', payload.sections?.profile || []);
  renderRows('tzeentchNetwork', payload.sections?.network || []);
  renderRows('tzeentchSocial', payload.sections?.social || []);
  renderRows('tzeentchArchive', payload.sections?.archive || []);
  renderSignalFeeds(payload.signals || []);
  renderRecentQueries();
}

function renderFailure(message) {
  setText('tzeentchMetricType', '—');
  setText('tzeentchMetricTypeNote', message || 'No data available.');
  setText('tzeentchMetricSources', '0');
  setText('tzeentchMetricFindings', '0');
  setText('tzeentchMetricFindingsNote', 'No scan yet.');
  setText('tzeentchMetricRefresh', '—');
  setText('tzeentchMetricRefreshNote', 'Waiting for input.');
  renderSourceChips([]);
  renderSourceCards([]);
  renderApplications([]);
  void loadTzeentchMarketFeed({ refresh: true });
  renderRows('tzeentchProfile', [{ label: 'Status', value: 'No data', detail: message }]);
  renderRows('tzeentchNetwork', []);
  renderRows('tzeentchSocial', []);
  renderRows('tzeentchArchive', []);
  renderSignalFeeds([]);
}

function renderSourceChips(sources) {
  const container = $('tzeentchSources');
  if (!container) return;

  const fragment = document.createDocumentFragment();
  const displaySources = sources.length
    ? sources
    : ['RDAP / WHOIS', 'DNS', 'crt.sh', 'Wayback Machine', 'GitHub', 'Reddit', 'Wikipedia', 'Hacker News', 'CoinGecko', 'Polymarket Gamma'];

  displaySources.forEach((source) => {
    const chip = document.createElement('span');
    chip.className = 'source-chip';
    chip.textContent = typeof source === 'string' ? source : source.name || 'Source';
    fragment.appendChild(chip);
  });

  container.replaceChildren(fragment);
}

function renderSourceCards(cards) {
  const container = $('tzeentchSourcesList');
  if (!container) return;

  if (!cards.length) {
    container.replaceChildren(createEmptyState('No source details available yet.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  cards.forEach((card) => {
    const article = document.createElement('article');
    article.className = 'source-result-card';

    const chip = document.createElement('span');
    chip.className = `source-chip source-chip-${card.status || 'live'}`;
    chip.textContent = card.name || 'Source';
    article.appendChild(chip);

    const detail = document.createElement('p');
    detail.className = 'source-result-detail';
    detail.textContent = card.detail || 'Live source';
    article.appendChild(detail);

    fragment.appendChild(article);
  });

  container.replaceChildren(fragment);
}

function renderApplications() {
  renderTzeentchMarketSurface();
}

function renderRows(containerId, rows) {
  const container = $(containerId);
  if (!container) return;

  if (!rows.length) {
    container.replaceChildren(createEmptyState('No results yet.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    const article = document.createElement('article');
    article.className = 'result-row';

    const label = document.createElement('span');
    label.className = 'result-row-label';
    label.textContent = row.label || 'Field';
    article.appendChild(label);

    if (row.href) {
      const link = document.createElement('a');
      link.className = 'result-row-value result-row-link';
      link.href = row.href;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = row.value || '—';
      article.appendChild(link);
    } else {
      const value = document.createElement('div');
      value.className = 'result-row-value';
      value.textContent = row.value || '—';
      article.appendChild(value);
    }

    if (row.detail) {
      const detail = document.createElement('p');
      detail.className = 'result-row-detail';
      detail.textContent = row.detail;
      article.appendChild(detail);
    }

    fragment.appendChild(article);
  });

  container.replaceChildren(fragment);
}

function renderSignalFeeds(feeds) {
  const container = $('tzeentchSignals');
  if (!container) return;

  if (!feeds.length) {
    container.replaceChildren(createEmptyState('No public signals returned.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  feeds.forEach((feed) => {
    const feedCard = document.createElement('article');
    feedCard.className = 'signal-feed-card';

    const header = document.createElement('div');
    header.className = 'signal-feed-header';

    const title = document.createElement('h4');
    title.textContent = feed.source || 'Feed';
    header.appendChild(title);

    const meta = document.createElement('span');
    meta.className = 'source-chip';
    meta.textContent = `${feed.items?.length || 0} items`;
    header.appendChild(meta);

    feedCard.appendChild(header);

    const list = document.createElement('div');
    list.className = 'signal-item-list';

    const items = Array.isArray(feed.items) ? feed.items : [];
    if (!items.length) {
      list.appendChild(createEmptyState('No items returned from this feed.'));
    } else {
      items.forEach((item) => {
        const row = document.createElement('article');
        row.className = 'signal-item';

      if (item.url) {
        const itemTitle = document.createElement('a');
        itemTitle.className = 'signal-item-title';
        itemTitle.href = item.url;
        itemTitle.target = '_blank';
        itemTitle.rel = 'noreferrer';
        itemTitle.textContent = item.title || 'Untitled';
        row.appendChild(itemTitle);
      } else {
        const itemTitle = document.createElement('div');
        itemTitle.className = 'signal-item-title';
        itemTitle.textContent = item.title || 'Untitled';
        row.appendChild(itemTitle);
      }

        if (item.detail) {
          const detail = document.createElement('p');
          detail.className = 'signal-item-detail';
          detail.textContent = item.detail;
          row.appendChild(detail);
        }

        list.appendChild(row);
      });
    }

    feedCard.appendChild(list);
    fragment.appendChild(feedCard);
  });

  container.replaceChildren(fragment);
}

function renderRecentQueries() {
  const container = $('tzeentchRecent');
  if (!container) return;

  if (!state.recent.length) {
    container.replaceChildren(createEmptyState('Recent queries will appear here.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  state.recent.forEach((entry) => {
    const row = document.createElement('article');
    row.className = 'recent-query-row';

    const main = document.createElement('div');
    main.className = 'recent-query-main';

    const label = document.createElement('span');
    label.className = 'result-row-label';
    label.textContent = entry.mode || 'auto';
    main.appendChild(label);

    const value = document.createElement('div');
    value.className = 'result-row-value';
    value.textContent = entry.query;
    main.appendChild(value);

    const detail = document.createElement('p');
    detail.className = 'result-row-detail';
    detail.textContent = `${entry.detectedType || 'target'} · ${entry.at}`;
    main.appendChild(detail);

    row.appendChild(main);
    fragment.appendChild(row);
  });

  container.replaceChildren(fragment);
}

function rememberRecentQuery(query, mode, payload) {
  const entry = {
    query,
    mode: mode || 'auto',
    detectedType: payload.detectedLabel || payload.detectedType || 'target',
    at: formatTimestamp(payload.metrics?.updatedAt, true),
  };

  state.recent = [entry, ...state.recent.filter((item) => item.query !== query)].slice(0, MAX_RECENT);
  persistRecentQueries();
  renderRecentQueries();
}

function persistRecentQueries() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.recent));
  } catch {
    // no-op
  }
}

function loadRecentQueries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry.query === 'string').slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

function abortInFlight() {
  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
}

function setBusy(isBusy) {
  const searchBtn = $('tzeentchSearchBtn');
  const clearBtn = $('tzeentchClearBtn');
  if (searchBtn) searchBtn.disabled = isBusy;
  if (clearBtn) clearBtn.disabled = isBusy;
}

function setStatus(element, message) {
  if (element) {
    element.textContent = message;
  }
}

function setText(id, value) {
  const element = $(id);
  if (element) {
    element.textContent = value;
  }
}

function formatTimestamp(iso, compact = false) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  if (compact) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function createEmptyState(message) {
  const empty = document.createElement('p');
  empty.className = 'empty-state';
  empty.textContent = message;
  return empty;
}

function renderSourcesFromPayload(payload) {
  // Kept for readability; source chip and source card rendering happen in renderPayload.
  return payload;
}

function abortIfPresent() {
  abortInFlight();
}

export function stopTzeentchDashboard() {
  abortIfPresent();
  state.busy = false;
  state.loaded = false;
  setBusy(false);
}

// Backwards-compatible alias used by main.js.
export function refreshTzeentchDashboard() {
  abortIfPresent();
  void loadTzeentchMarketFeed({ refresh: true });
  return loadOverview({ focus: false });
}

function renderPayloadForDebug() {
  // no-op helper kept intentionally small to make browser snapshot inspection easy.
}


const SVG_NS = 'http://www.w3.org/2000/svg';
const TZEENTCH_MARKET_TABS = [
  { key: 'murmurs', label: 'Murmurs', subtitle: 'Virality and current events' },
  { key: 'crypto', label: 'Crypto', subtitle: 'Top 10 by trading volume' },
  { key: 'polymarket', label: 'Polymarket', subtitle: 'New bets and recent resolutions' },
  { key: 'intel', label: 'Actionable Intel', subtitle: 'Paper buys and sells' },
];

function getTzeentchMarketModel() {
  if (!state.marketModel) {
    state.marketModel = buildTzeentchDashboardModel(createDemoDashboardDataset());
  }
  return state.marketModel;
}

async function loadTzeentchMarketFeed({ refresh = false } = {}) {
  if (state.marketFetchPromise) {
    return state.marketFetchPromise;
  }

  state.marketFetchPromise = (async () => {
    try {
      const response = await fetch(new URL('/api/tzeentch', window.location.origin).toString(), {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Tzeentch feed returned HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (!payload || payload.ok !== true) {
        throw new Error(payload?.error || 'Tzeentch feed returned an empty payload.');
      }

      state.marketError = null;
      state.marketModel = buildTzeentchDashboardModel(payload);
    } catch (error) {
      state.marketError = error?.message || 'Tzeentch feed failed.';
      console.warn('Tzeentch market feed failed; using demo model.', error);
      if (!state.marketModel || refresh) {
        state.marketModel = buildTzeentchDashboardModel(createDemoDashboardDataset());
      }
    } finally {
      state.marketFetchPromise = null;
      renderTzeentchMarketSurface();
    }
  })();

  return state.marketFetchPromise;
}

function renderTzeentchMarketSurface() {
  const container = $('tzeentchApplications');
  if (!container) return;

  const model = getTzeentchMarketModel();
  const tabs = TZEENTCH_MARKET_TABS;
  if (!tabs.some((tab) => tab.key === state.marketTab)) {
    state.marketTab = tabs[0].key;
  }

  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === state.marketTab));
  const shell = document.createElement('section');
  shell.className = 'tzeentch-carousel-shell';

  const header = document.createElement('div');
  header.className = 'tzeentch-carousel-header';

  const headingBlock = document.createElement('div');
  headingBlock.className = 'section-heading';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = '// SIGNAL LANE /';
  headingBlock.appendChild(eyebrow);

  const title = document.createElement('h3');
  title.textContent = 'Murmurs, Crypto, Polymarket, Actionable Intel';
  headingBlock.appendChild(title);

  header.appendChild(headingBlock);

  const meta = document.createElement('p');
  meta.className = 'panel-meta';
  meta.textContent = model.accessNotes?.[0] || 'Public feeds only.';
  header.appendChild(meta);

  const note = document.createElement('p');
  note.className = 'panel-meta';
  note.textContent = 'Swipe left/right to move between sub-tabs.';
  header.appendChild(note);

  if (state.marketError) {
    const errorNote = document.createElement('p');
    errorNote.className = 'panel-meta';
    errorNote.textContent = `Feed fallback: ${state.marketError}`;
    header.appendChild(errorNote);
  }

  shell.appendChild(header);
  shell.appendChild(renderTzeentchMarketTabs(tabs, state.marketTab));

  const viewport = document.createElement('div');
  viewport.className = 'tzeentch-carousel-viewport';

  const track = document.createElement('div');
  track.className = 'tzeentch-carousel-track';
  track.style.transform = `translateX(-${activeIndex * 100}%)`;

  tabs.forEach((tab) => {
    const panel = document.createElement('article');
    panel.className = 'tzeentch-carousel-panel';
    if (tab.key === state.marketTab) {
      panel.classList.add('is-active');
    }
    panel.appendChild(renderTzeentchPanel(tab.key, model));
    track.appendChild(panel);
  });

  viewport.appendChild(track);
  shell.appendChild(viewport);
  container.replaceChildren(shell);
  bindTzeentchCarouselGestures(container);
}

function bindTzeentchCarouselGestures(container) {
  if (state.marketBound) {
    return;
  }

  let startX = 0;
  let startY = 0;
  let active = false;

  container.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    active = true;
  }, { passive: true });

  container.addEventListener('touchend', (event) => {
    if (!active) {
      return;
    }
    active = false;
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }
    moveTzeentchMarketTab(deltaX < 0 ? 1 : -1);
  }, { passive: true });

  container.addEventListener('touchcancel', () => {
    active = false;
  }, { passive: true });

  state.marketBound = true;
}

function setTzeentchMarketTab(key) {
  const tab = TZEENTCH_MARKET_TABS.find((entry) => entry.key === key);
  if (!tab) {
    return;
  }
  state.marketTab = tab.key;
  renderTzeentchMarketSurface();
}

function moveTzeentchMarketTab(delta) {
  const tabs = TZEENTCH_MARKET_TABS;
  const currentIndex = Math.max(0, tabs.findIndex((tab) => tab.key === state.marketTab));
  const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
  const nextTab = tabs[nextIndex];
  if (nextTab) {
    state.marketTab = nextTab.key;
    renderTzeentchMarketSurface();
  }
}

function renderTzeentchMarketTabs(tabs, activeKey) {
  const nav = document.createElement('div');
  nav.className = 'tzeentch-subtabs';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Tzeentch sub-tabs');

  tabs.forEach((tab) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tzeentch-subtab${tab.key === activeKey ? ' is-active' : ''}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab.key === activeKey));
    button.textContent = tab.label;
    if (tab.subtitle) {
      button.title = tab.subtitle;
    }
    button.addEventListener('click', () => setTzeentchMarketTab(tab.key));
    nav.appendChild(button);
  });

  return nav;
}

function renderTzeentchPanel(tabKey, model) {
  switch (tabKey) {
    case 'murmurs':
      return renderMurmursPanel(model);
    case 'crypto':
      return renderCryptoPanel(model);
    case 'polymarket':
      return renderPolymarketPanel(model);
    case 'intel':
      return renderActionablePanel(model);
    default:
      return createEmptyState('Unknown sub-tab.');
  }
}

function renderPanelHeader(eyebrowText, titleText, metaText) {
  const header = document.createElement('div');
  header.className = 'tzeentch-panel-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = eyebrowText;
  header.appendChild(eyebrow);

  const title = document.createElement('h4');
  title.textContent = titleText;
  header.appendChild(title);

  if (metaText) {
    const meta = document.createElement('p');
    meta.className = 'panel-meta';
    meta.textContent = metaText;
    header.appendChild(meta);
  }

  return header;
}

function renderMetricGrid(metrics = []) {
  const grid = document.createElement('div');
  grid.className = 'tzeentch-metric-grid';

  metrics.forEach((metric) => {
    const card = document.createElement('article');
    card.className = 'metric-card metric-card-small';

    const label = document.createElement('span');
    label.className = 'metric-label';
    label.textContent = metric.label || 'Metric';
    card.appendChild(label);

    const value = document.createElement('strong');
    value.textContent = metric.value || '—';
    card.appendChild(value);

    if (metric.detail) {
      const detail = document.createElement('p');
      detail.textContent = metric.detail;
      card.appendChild(detail);
    }

    grid.appendChild(card);
  });

  return grid;
}

function renderChipStrip(items = [], emptyLabel = 'No data yet') {
  const strip = document.createElement('div');
  strip.className = 'chip-strip';

  if (!items.length) {
    const empty = document.createElement('span');
    empty.className = 'source-chip';
    empty.textContent = emptyLabel;
    strip.appendChild(empty);
    return strip;
  }

  items.forEach((item) => {
    const chip = document.createElement('span');
    chip.className = 'source-chip';
    chip.textContent = item;
    strip.appendChild(chip);
  });

  return strip;
}

function renderMurmursPanel(model) {
  const panel = document.createElement('div');
  panel.className = 'tzeentch-panel tzeentch-panel-murmurs';
  panel.appendChild(renderPanelHeader('Murmurs', 'Virality first', model.murmurs.summary));
  panel.appendChild(renderMetricGrid(model.murmurs.metrics || []));

  if (model.murmurs.hero) {
    panel.appendChild(renderMurmurHero(model.murmurs.hero));
  }

  if (model.murmurs.clusters?.length) {
    const clusterWrap = document.createElement('div');
    clusterWrap.className = 'cluster-strip';
    model.murmurs.clusters.forEach((cluster) => {
      const chip = document.createElement('span');
      chip.className = 'source-chip';
      const sources = Array.isArray(cluster.sources) && cluster.sources.length ? cluster.sources.join(' · ') : 'single source';
      chip.textContent = `${cluster.count}× ${cluster.topicKey || 'topic'} · ${sources}`;
      clusterWrap.appendChild(chip);
    });
    panel.appendChild(clusterWrap);
  }

  panel.appendChild(renderMurmurFeed(model.murmurs.items || []));
  return panel;
}

function renderMurmurHero(item) {
  const card = document.createElement('article');
  card.className = 'signal-feed-card murmurs-hero-card';

  const header = document.createElement('div');
  header.className = 'signal-feed-header';

  const title = document.createElement('h4');
  title.textContent = item.title || 'Untitled';
  header.appendChild(title);

  const virality = document.createElement('span');
  virality.className = 'source-chip source-chip-live';
  virality.textContent = `${item.viralityLabel || 'Early'} · ${item.viralityScore ?? 0}`;
  header.appendChild(virality);

  card.appendChild(header);

  if (item.url) {
    const link = document.createElement('a');
    link.className = 'signal-item-title';
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = item.title || 'Untitled';
    card.appendChild(link);
  }

  const summary = document.createElement('p');
  summary.className = 'signal-item-detail';
  summary.textContent = `${item.signalLabel || item.source || 'Feed'} · ${item.ageLabel || 'recent'} · ${item.spreadLabel || 'single-source pulse'}`;
  card.appendChild(summary);

  const row = document.createElement('div');
  row.className = 'tzeentch-mini-meta';
  [
    `Score ${item.score ?? 0}`,
    `Comments ${item.comments ?? 0}`,
    `Cluster ${item.clusterCount ?? 1}`,
  ].forEach((text) => {
    const chip = document.createElement('span');
    chip.className = 'source-chip';
    chip.textContent = text;
    row.appendChild(chip);
  });
  card.appendChild(row);

  return card;
}

function renderMurmurFeed(items = []) {
  const list = document.createElement('div');
  list.className = 'tzeentch-feed-list';

  const feedItems = items.slice(0, 6);
  if (!feedItems.length) {
    list.appendChild(createEmptyState('No murmur items yet.'));
    return list;
  }

  feedItems.forEach((item) => {
    list.appendChild(renderMurmurCard(item));
  });

  return list;
}

function renderMurmurCard(item) {
  const card = document.createElement('article');
  card.className = 'signal-item murmurs-item-card';

  const topRow = document.createElement('div');
  topRow.className = 'signal-feed-header';

  const source = document.createElement('span');
  source.className = 'source-chip';
  source.textContent = item.signalLabel || item.source || 'Feed';
  topRow.appendChild(source);

  const virality = document.createElement('span');
  virality.className = 'source-chip source-chip-live';
  virality.textContent = `${item.viralityLabel || 'Early'} · ${item.viralityScore ?? 0}`;
  topRow.appendChild(virality);

  card.appendChild(topRow);

  if (item.url) {
    const title = document.createElement('a');
    title.className = 'signal-item-title';
    title.href = item.url;
    title.target = '_blank';
    title.rel = 'noreferrer';
    title.textContent = item.title || 'Untitled';
    card.appendChild(title);
  } else {
    const title = document.createElement('div');
    title.className = 'signal-item-title';
    title.textContent = item.title || 'Untitled';
    card.appendChild(title);
  }

  const detail = document.createElement('p');
  detail.className = 'signal-item-detail';
  detail.textContent = `${item.ageLabel || 'recent'} · ${item.spreadLabel || 'single-source pulse'} · ${item.topicKey || 'misc'}`;
  card.appendChild(detail);

  const meta = document.createElement('div');
  meta.className = 'tzeentch-mini-meta';
  [
    `Score ${item.score ?? 0}`,
    `Comments ${item.comments ?? 0}`,
    item.clusterCount > 1 ? `${item.clusterCount} sources` : '1 source',
  ].forEach((text) => {
    const chip = document.createElement('span');
    chip.className = 'source-chip';
    chip.textContent = text;
    meta.appendChild(chip);
  });
  card.appendChild(meta);

  return card;
}

function renderCryptoPanel(model) {
  const panel = document.createElement('div');
  panel.className = 'tzeentch-panel tzeentch-panel-crypto';
  panel.appendChild(renderPanelHeader('Crypto', 'Top 10 by trading volume', model.crypto.summary));

  const views = model.crypto.views || {};
  const view24h = new Map((views['24h']?.assets || []).map((asset) => [asset.id, asset]));
  const view5d = new Map((views['5d']?.assets || []).map((asset) => [asset.id, asset]));

  const grid = document.createElement('div');
  grid.className = 'crypto-asset-grid';

  (model.crypto.assets || []).forEach((asset) => {
    const card = document.createElement('article');
    card.className = 'crypto-asset-card';

    const header = document.createElement('div');
    header.className = 'crypto-asset-header';

    if (asset.image) {
      const icon = document.createElement('img');
      icon.className = 'crypto-asset-icon';
      icon.alt = `${asset.name || asset.symbol || 'Asset'} icon`;
      icon.src = asset.image;
      header.appendChild(icon);
    } else {
      const icon = document.createElement('div');
      icon.className = 'crypto-asset-icon crypto-asset-icon-placeholder';
      icon.textContent = (asset.symbol || asset.name || '?').slice(0, 2).toUpperCase();
      header.appendChild(icon);
    }

    const titleWrap = document.createElement('div');
    titleWrap.className = 'crypto-asset-title-wrap';

    const title = document.createElement('h4');
    title.textContent = asset.name || 'Asset';
    titleWrap.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'panel-meta';
    subtitle.textContent = `${asset.symbol || '—'} · #${asset.marketCapRank ?? '—'} · ${asset.trendLabel || 'flat'}`;
    titleWrap.appendChild(subtitle);

    header.appendChild(titleWrap);

    const ranking = document.createElement('span');
    ranking.className = 'source-chip';
    ranking.textContent = asset.priceLabel || '—';
    header.appendChild(ranking);

    card.appendChild(header);

    const priceRow = document.createElement('div');
    priceRow.className = 'crypto-asset-price-row';

    const price = document.createElement('strong');
    price.textContent = asset.priceLabel || '—';
    priceRow.appendChild(price);

    const priceMeta = document.createElement('span');
    priceMeta.className = `source-chip ${asset.trendScore >= 0 ? 'source-chip-live' : 'source-chip-muted'}`;
    priceMeta.textContent = asset.changeLabel || '—';
    priceRow.appendChild(priceMeta);

    card.appendChild(priceRow);

    const chartGrid = document.createElement('div');
    chartGrid.className = 'crypto-view-grid';
    chartGrid.appendChild(renderCryptoViewCell(view24h.get(asset.id) || asset, '24H'));
    chartGrid.appendChild(renderCryptoViewCell(view5d.get(asset.id) || asset, '5D'));
    card.appendChild(chartGrid);

    const footer = document.createElement('div');
    footer.className = 'crypto-asset-footer';

    [
      asset.volumeLabel || '—',
      asset.marketCapLabel || '—',
      asset.mentions?.length ? `${asset.mentions.length} murmur match${asset.mentions.length === 1 ? '' : 'es'}` : 'No cross-source matches',
    ].forEach((text) => {
      const chip = document.createElement('span');
      chip.className = 'source-chip';
      chip.textContent = text;
      footer.appendChild(chip);
    });

    card.appendChild(footer);
    grid.appendChild(card);
  });

  panel.appendChild(grid);
  return panel;
}

function renderCryptoViewCell(view, label) {
  const cell = document.createElement('article');
  cell.className = 'crypto-view-card';

  const header = document.createElement('div');
  header.className = 'crypto-view-header';

  const title = document.createElement('span');
  title.className = 'source-chip';
  title.textContent = label;
  header.appendChild(title);

  const change = document.createElement('span');
  change.className = `source-chip ${view.change >= 0 ? 'source-chip-live' : 'source-chip-danger'}`;
  change.textContent = view.changeLabel || '—';
  header.appendChild(change);

  cell.appendChild(header);

  const figure = renderSparklineGraphic(view);
  cell.appendChild(figure);

  const range = document.createElement('p');
  range.className = 'signal-item-detail';
  range.textContent = view.priceRangeLabel || 'No chart data';
  cell.appendChild(range);

  return cell;
}

function renderSparklineGraphic(view) {
  const figure = document.createElement('figure');
  figure.className = `sparkline-figure ${view.change >= 0 ? 'sparkline-up' : 'sparkline-down'}`;

  if (!view.sparkline || !view.sparkline.line) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No chart data.';
    figure.appendChild(empty);
    return figure;
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${view.sparkline.width || 100} ${view.sparkline.height || 28}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const fill = document.createElementNS(SVG_NS, 'path');
  fill.setAttribute('d', view.sparkline.fill || '');
  fill.setAttribute('class', 'sparkline-fill');
  svg.appendChild(fill);

  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('d', view.sparkline.line || '');
  line.setAttribute('class', 'sparkline-line');
  svg.appendChild(line);

  figure.appendChild(svg);
  return figure;
}

function renderPolymarketPanel(model) {
  const panel = document.createElement('div');
  panel.className = 'tzeentch-panel tzeentch-panel-polymarket';
  panel.appendChild(renderPanelHeader('Polymarket', 'New bets and recently resolved bets', 'Read-only Gamma API; no account is required for browsing.'));

  panel.appendChild(renderPolymarketSection('New bets', model.polymarket.newMarkets || [], 'No new bets yet.'));
  panel.appendChild(renderPolymarketSection('Recently resolved', model.polymarket.resolvedMarkets || [], 'No recently resolved bets yet.'));
  return panel;
}

function renderPolymarketSection(titleText, markets, emptyLabel) {
  const section = document.createElement('section');
  section.className = 'tzeentch-panel-section';

  const heading = document.createElement('h5');
  heading.textContent = titleText;
  section.appendChild(heading);

  if (!markets.length) {
    section.appendChild(createEmptyState(emptyLabel));
    return section;
  }

  const list = document.createElement('div');
  list.className = 'tzeentch-feed-list';
  markets.slice(0, 6).forEach((market) => {
    list.appendChild(renderPolymarketCard(market));
  });
  section.appendChild(list);
  return section;
}

function renderPolymarketCard(market) {
  const card = document.createElement('article');
  card.className = `signal-item market-card market-card-${market.closed ? 'resolved' : 'open'}`;

  const topRow = document.createElement('div');
  topRow.className = 'signal-feed-header';

  const status = document.createElement('span');
  status.className = `source-chip ${market.closed ? 'source-chip-muted' : 'source-chip-live'}`;
  status.textContent = market.label || (market.closed ? 'Resolved' : 'Open');
  topRow.appendChild(status);

  const time = document.createElement('span');
  time.className = 'source-chip';
  time.textContent = market.timeLabel || 'recent';
  topRow.appendChild(time);

  card.appendChild(topRow);

  if (market.marketUrl) {
    const title = document.createElement('a');
    title.className = 'signal-item-title';
    title.href = market.marketUrl;
    title.target = '_blank';
    title.rel = 'noreferrer';
    title.textContent = market.title || 'Untitled market';
    card.appendChild(title);
  } else {
    const title = document.createElement('div');
    title.className = 'signal-item-title';
    title.textContent = market.title || 'Untitled market';
    card.appendChild(title);
  }

  if (market.description || market.contextDescription) {
    const detail = document.createElement('p');
    detail.className = 'signal-item-detail';
    detail.textContent = market.description || market.contextDescription;
    card.appendChild(detail);
  }

  const meta = document.createElement('div');
  meta.className = 'tzeentch-mini-meta';
  [
    market.priceLabel || '—',
    market.liquidityLabel || '—',
    market.volumeLabel || '—',
    market.endLabel || market.resolutionLabel || '—',
  ].forEach((text) => {
    const chip = document.createElement('span');
    chip.className = 'source-chip';
    chip.textContent = text;
    meta.appendChild(chip);
  });
  card.appendChild(meta);

  return card;
}

function renderActionablePanel(model) {
  const panel = document.createElement('div');
  panel.className = 'tzeentch-panel tzeentch-panel-intel';
  panel.appendChild(renderPanelHeader('Actionable Intel', 'Paper buys and sells', model.actionable.loopNote));

  const summary = document.createElement('p');
  summary.className = 'panel-meta';
  summary.textContent = model.actionable.summary || 'Paper-only loop; learn from the outcomes.';
  panel.appendChild(summary);

  if (!model.actionable.proposals?.length) {
    panel.appendChild(createEmptyState('No actionable proposals yet.'));
    return panel;
  }

  const list = document.createElement('div');
  list.className = 'tzeentch-feed-list';
  model.actionable.proposals.forEach((proposal) => {
    list.appendChild(renderActionableCard(proposal));
  });
  panel.appendChild(list);
  return panel;
}

function renderActionableCard(proposal) {
  const card = document.createElement('article');
  card.className = `signal-item actionable-card actionable-card-${proposal.side || 'buy'}`;

  const topRow = document.createElement('div');
  topRow.className = 'signal-feed-header';

  const action = document.createElement('span');
  action.className = `source-chip ${proposal.side === 'sell' ? 'source-chip-danger' : 'source-chip-live'}`;
  action.textContent = proposal.actionText || proposal.title || 'Action';
  topRow.appendChild(action);

  const confidence = document.createElement('span');
  confidence.className = 'source-chip';
  confidence.textContent = `${proposal.confidence ?? 0}% confidence`;
  topRow.appendChild(confidence);

  card.appendChild(topRow);

  const title = document.createElement('div');
  title.className = 'signal-item-title';
  title.textContent = proposal.title || 'Untitled proposal';
  card.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'signal-item-detail';
  subtitle.textContent = `${proposal.instrumentType || 'paper'} · ${proposal.horizon || 'review horizon'} · ${proposal.paperOnly ? 'paper only' : 'live'}`;
  card.appendChild(subtitle);

  if (proposal.thesis) {
    const thesis = document.createElement('p');
    thesis.className = 'signal-item-detail';
    thesis.textContent = proposal.thesis;
    card.appendChild(thesis);
  }

  if (Array.isArray(proposal.justification) && proposal.justification.length) {
    const list = document.createElement('ul');
    list.className = 'actionable-justification-list';
    proposal.justification.forEach((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      list.appendChild(item);
    });
    card.appendChild(list);
  }

  if (Array.isArray(proposal.evidence) && proposal.evidence.length) {
    card.appendChild(renderChipStrip(proposal.evidence, 'No evidence'));
  }

  if (Array.isArray(proposal.sourceLinks) && proposal.sourceLinks.length) {
    const links = document.createElement('div');
    links.className = 'tzeentch-mini-meta';
    proposal.sourceLinks.forEach((href) => {
      if (!href) return;
      const link = document.createElement('a');
      link.className = 'source-chip';
      link.href = href;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'Source';
      links.appendChild(link);
    });
    card.appendChild(links);
  }

  return card;
}
