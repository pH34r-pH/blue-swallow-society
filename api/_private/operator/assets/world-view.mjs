import { WORLD_PRESETS, filterWorld, validateWorldSnapshot, safeWorldLink } from './world-state.mjs';

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}
function choice(label, choices) {
  const control = el('select', undefined, { 'aria-label': label });
  for (const [value, name] of choices) control.append(el('option', name, { value }));
  const wrapper = el('label', label); wrapper.append(control); return [wrapper, control];
}
const time = (value) => value || 'Unknown';
function link(text, url) {
  const safe = safeWorldLink(url); return safe ? el('a', text, { href: safe, target: '_blank', rel: 'noopener noreferrer' }) : el('span', text);
}
export function createWorldView({ root, getHeaders = () => ({}), fetchImpl = fetch, loadMap = () => import('./world-map.mjs') } = {}) {
  if (!root) throw new TypeError('World root required.');
  if (!document.querySelector('[data-world-css]')) {
    const style = el('link', undefined, { rel: 'stylesheet', href: '/api/operator-assets/world.css', 'data-world-css': '' }); document.head.append(style);
  }
  root.classList.add('world-view');
  const title = el('h2', 'World'); const boundary = el('p', 'Public context, separate from personal Travels and entity evidence. Periodically refreshed provider reports; coverage is incomplete.');
  const status = el('p', 'World context has not been loaded.', { role: 'status', 'aria-live': 'polite' });
  const controls = el('div', undefined, { class: 'world-controls' });
  const [presetLabel, preset] = choice('Region', Object.entries(WORLD_PRESETS).map(([id, value]) => [id, value.label]));
  const [semanticLabel, semantic] = choice('Evidence semantics', ['all', 'observed', 'reported', 'predicted', 'historical'].map((id) => [id, id]));
  const [sortLabel, sort] = choice('Sort', [['newest', 'Newest event first'], ['title', 'Title']]);
  const searchLabel = el('label', 'Search reports'); const search = el('input', undefined, { type: 'search', maxlength: '160', 'aria-label': 'Search reports' }); searchLabel.append(search);
  const refresh = el('button', 'Reload context', { type: 'button' });
  const mapButton = el('button', 'Show globe', { type: 'button', 'aria-pressed': 'false' });
  controls.append(presetLabel, semanticLabel, sortLabel, searchLabel, refresh, mapButton);
  const note = el('p', 'Region presets use approximate geographic bounds (PNW: WA, OR, ID; US includes Alaska and Hawaii). Zone-only alerts stay in the list. Map is for broad orientation, with no roads or altitude tracks.');
  const ledger = el('ul', undefined, { class: 'world-ledger', 'aria-label': 'Source health and layer controls' });
  const mapStatus = el('p', 'Globe is off. The complete filtered list is available below.', { role: 'status' });
  const canvas = el('div', undefined, { class: 'world-map', 'aria-label': 'World ground context globe', hidden: '' });
  const results = el('div', undefined, { class: 'world-results' });
  const listSection = el('section', undefined, { 'aria-label': 'Filtered reports' });
  const count = el('p'); const list = el('ol', undefined, { class: 'world-items' });
  const previous = el('button', 'Previous page', { type: 'button' }); const next = el('button', 'Next page', { type: 'button' });
  listSection.append(count, list, previous, next);
  const detail = el('section', 'Select a report for source, times and uncertainty.', { class: 'world-detail', 'aria-label': 'Selected report details', tabindex: '-1' });
  results.append(listSection, detail); root.replaceChildren(title, boundary, status, controls, note, ledger, mapStatus, canvas, results);
  let data = null; let active = false; let destroyed = false; let request = null; let selectedId = null; let page = 0;
  let selectedSources = new Set(); let map = null; let mapGeneration = 0; let wantedMap = false;
  let freshnessTimer = null; let receivedAt = null;
  const events = new AbortController(); const eventOptions = { signal: events.signal };
  function showDetail(item, focus = false) {
    selectedId = item?.id || null;
    detail.replaceChildren();
    if (!item) { detail.textContent = 'Select a report for source, times and uncertainty.'; return; }
    const source = data.sources.find((entry) => entry.id === item.sourceId);
    detail.append(el('h3', item.title), link('Provider source', item.sourceUrl), el('p', item.detail));
    const dl = el('dl');
    for (const [name, value] of [['Source', source?.name || item.sourceId], ['Attribution', item.attribution], ['Semantics', item.semantics],
      ['Freshness', item.freshness], ['Event time', time(item.eventAt)], ['Provider update / publication time', time(item.updatedAt)],
      ['Fetched time', time(item.fetchedAt)], ['Alert expiry', time(item.expiresAt)], ['Coverage', source?.coverage || 'See provider'],
      ['Uncertainty', item.uncertainty], ['Map geometry', item.geometry ? item.geometry.type : 'Unavailable; no location invented']]) dl.append(el('dt', name), el('dd', value));
    detail.append(dl); if (focus) detail.focus();
  }
  function currentData() {
    if (!data) return null;
    const at = Date.now();
    return { ...data, items: data.items.filter((item) => {
      const source = data.sources.find((s) => s.id === item.sourceId);
      return !source?.maxAgeMs || at - Date.parse(item.fetchedAt) <= source.maxAgeMs;
    }).map((item) => {
      const source = data.sources.find((s) => s.id === item.sourceId);
      return { ...item, semantics: item.expiresAt && Date.parse(item.expiresAt) <= at ? 'historical' : item.semantics,
        freshness: at - Date.parse(item.fetchedAt) > (source?.staleMs || Infinity) ? 'stale' : item.freshness };
    }) };
  }
  function render() {
    const snapshot = currentData();
    const filtered = filterWorld(snapshot, { preset: preset.value, sources: [...selectedSources], search: search.value, semantics: semantic.value, sort: sort.value, page });
    page = filtered.page; count.textContent = `${filtered.total} reports · page ${page + 1} of ${filtered.pages}. Up to 50 reports per page.`;
    previous.disabled = page === 0; next.disabled = page + 1 >= filtered.pages;
    list.replaceChildren();
    for (const item of filtered.items) {
      const row = el('li'); const button = el('button', `${item.title} · ${item.semantics} · ${item.freshness} · ${time(item.eventAt)}`, { type: 'button', 'aria-pressed': String(selectedId === item.id) });
      button.addEventListener('click', () => { showDetail(item, true); render(); }); row.append(button); list.append(row);
    }
    if (!filtered.total) list.append(el('li', selectedSources.size ? 'No matching reports. Empty results do not establish absence of events.' : 'Select a source to inspect its reports.'));
    const selected = filtered.all.find((item) => item.id === selectedId);
    if (selectedId) showDetail(selected);
    map?.set(filtered.all, WORLD_PRESETS[preset.value]);
    if (receivedAt && Date.now() - receivedAt >= 60000 && !request) status.textContent = 'Cached context; reload to check for newer source state. Provider freshness is shown per report.';
  }
  function renderLedger() {
    ledger.replaceChildren();
    for (const source of data?.sources || []) {
      const row = el('li'); const label = el('label'); const input = el('input', undefined, { type: 'checkbox', 'aria-label': source.name });
      input.checked = selectedSources.has(source.id); input.disabled = !source.enabled;
      input.addEventListener('change', () => { input.checked ? selectedSources.add(source.id) : selectedSources.delete(source.id); page = 0; render(); });
      label.append(input, el('span', `${source.name} · ${source.state}`)); row.append(label,
        el('p', source.reason || source.coverage), el('p', `Last successful fetch: ${time(source.fetchedAt)}. Last attempt: ${time(source.attemptedAt)}.`),
        el('p', `Next eligible acquisition: ${time(source.nextAttemptAt)}. ${source.rejected || 0} rejected records.`),
        el('p', source.error ? `Source failure: ${source.error}${source.expired ? '; previous data expired' : '; retained data is stale'}.` : source.attribution), link('Source / terms', source.termsUrl || source.url));
      ledger.append(row);
    }
  }
  async function reload() {
    request?.abort(); const controller = new AbortController(); request = controller; refresh.disabled = true;
    status.textContent = 'Loading public context…';
    try {
      const response = await fetchImpl('/api/world/context', { headers: getHeaders(), cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      if (!response.ok) throw new Error('World context unavailable.');
      const nextData = validateWorldSnapshot(await response.json());
      if (destroyed || controller.signal.aborted) return;
      data = nextData; receivedAt = Date.now(); renderLedger();
      status.textContent = `Public context loaded at ${time(data.generatedAt)}. Select a source; this read does not fetch providers.`; render();
    } catch {
      if (!controller.signal.aborted && !destroyed) {
        // A failed read cannot keep last-known records labelled fresh.
        if (data) data = { ...data, items: data.items.map((item) => ({ ...item, freshness: 'stale' })), sources: data.sources.map((source) => source.enabled ? { ...source, state: 'failure', error: 'context_read_failed' } : source) };
        status.textContent = data ? 'Context reload failed; retained reports are stale.' : 'World context is unavailable. No substitute data is shown.';
        renderLedger(); render();
      }
    } finally { if (request === controller) { request = null; refresh.disabled = false; } }
  }
  function stopMap() {
    mapGeneration++; wantedMap = false; map?.destroy(); map = null; canvas.hidden = true;
    mapButton.setAttribute('aria-pressed', 'false'); mapButton.textContent = 'Show globe';
  }
  async function toggleMap() {
    if (wantedMap) { stopMap(); mapStatus.textContent = 'Globe is off. The filtered list remains available.'; return; }
    wantedMap = true; const generation = ++mapGeneration; canvas.hidden = false;
    mapButton.setAttribute('aria-pressed', 'true'); mapButton.textContent = 'Use list only'; mapStatus.textContent = 'Loading local globe…';
    const fail = () => { stopMap(); mapStatus.textContent = 'Globe unavailable. Use the searchable report list.'; };
    try {
      const module = await loadMap();
      if (!wantedMap || destroyed || generation !== mapGeneration) return;
      const nextMap = await module.createWorldMap({ container: canvas, onSelect: (id) => { const item = currentData()?.items.find((item) => item.id === id); if (item) { showDetail(item, true); render(); } }, onFailure: fail });
      if (!wantedMap || destroyed || generation !== mapGeneration) { nextMap.destroy(); return; }
      map = nextMap; mapStatus.textContent = 'Ground context globe. Made with Natural Earth (public domain).'; render();
    } catch { if (generation === mapGeneration) fail(); }
  }
  for (const control of [preset, semantic, sort, search]) control.addEventListener(control === search ? 'input' : 'change', () => { page = 0; render(); }, eventOptions);
  refresh.addEventListener('click', reload, eventOptions); mapButton.addEventListener('click', toggleMap, eventOptions);
  previous.addEventListener('click', () => { page--; render(); }, eventOptions); next.addEventListener('click', () => { page++; render(); }, eventOptions);
  render();
  return Object.freeze({ activate() {
    if (destroyed || active) return; active = true; void reload(); freshnessTimer = setInterval(render, 60000);
  }, deactivate() { active = false; request?.abort(); clearInterval(freshnessTimer); stopMap(); },
  destroy() { destroyed = true; active = false; request?.abort(); events.abort(); clearInterval(freshnessTimer); stopMap(); },
  // Local diagnostics expose only renderer state, never personal data.
  diagnostics: () => ({ projection: map?.projection?.() || null, renderedRows: list.children.length, sourceCount: data?.sources.length || 0 }) });
}
