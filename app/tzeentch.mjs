const STORAGE_KEY = 'blue-swallow-society:tzeentch:recent-queries';
const MAX_RECENT = 6;

const state = {
  bound: false,
  loaded: false,
  busy: false,
  abortController: null,
  recent: loadRecentQueries(),
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

    const payload = await response.json();
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
  const displaySources = sources.length ? sources : ['RDAP / WHOIS', 'DNS', 'crt.sh', 'Wayback Machine', 'GitHub', 'Reddit', 'Wikipedia', 'Hacker News'];

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
  return loadOverview({ focus: false });
}

function renderPayloadForDebug() {
  // no-op helper kept intentionally small to make browser snapshot inspection easy.
}
