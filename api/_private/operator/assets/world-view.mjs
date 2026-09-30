import { WORLD_PRESETS, filterWorld, validateWorldSnapshot, safeWorldLink, sourceFreshness } from './world-state.mjs';

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
export function createWorldView(options) { return new WorldView(options); }
function buildLayout(root) {
  if (!document.querySelector('[data-world-css]') && !document.getElementById('bss-world-styles')) {
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
  const note = el('p', 'Region presets use approximate geographic bounds (PNW: WA, OR, ID; US includes Alaska and Hawaii). Zone-only alerts stay in the list. Map is for broad orientation, with no roads or altitude tracks. Globe budget: up to 1,000 geometries / 20,000 vertices; the list retains all matching reports.');
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
  return { status, preset, semantic, sort, search, refresh, mapButton, ledger, mapStatus, canvas, count, list, previous, next, detail };
 }
class WorldView {
  constructor({ root, getHeaders = () => ({}), fetchImpl = fetch, loadMap = () => import('./world-map.mjs') } = {}) {
    if (!root) throw new TypeError('World root required.');
    this.ledgerLabels = new Map(); this.nodes = buildLayout(root); this.getHeaders = getHeaders; this.fetchImpl = (url, options) => fetchImpl(url, options); this.loadMap = loadMap;
    this.data = null; this.active = false; this.destroyed = false; this.request = null; this.selectedId = null; this.page = 0;
    this.selectedSources = new Set(); this.map = null; this.mapGeneration = 0; this.wantedMap = false;
    this.freshnessTimer = null; this.receivedAt = null; this.events = new AbortController();
    this.bind(); this.render();
  }
  bind() {
    const { preset, semantic, sort, search, refresh, mapButton, previous, next } = this.nodes;
    const options = { signal: this.events.signal };
    for (const control of [preset, semantic, sort, search]) control.addEventListener(control === search ? 'input' : 'change', () => { this.page = 0; this.render(); }, options);
    refresh.addEventListener('click', () => this.reload(), options); mapButton.addEventListener('click', () => this.toggleMap(), options);
    previous.addEventListener('click', () => { this.page--; this.render(); }, options); next.addEventListener('click', () => { this.page++; this.render(); }, options);
  }
  showDetail(item, focus = false) {
    this.selectedId = item?.id || null;
    this.nodes.detail.replaceChildren();
    if (!item) { this.nodes.detail.textContent = 'Select a report for source, times and uncertainty.'; return; }
    const source = this.data.sources.find((entry) => entry.id === item.sourceId);
    this.nodes.detail.append(el('h3', item.title), link('Provider source', item.sourceUrl), el('p', item.detail));
    const dl = el('dl');
    for (const [name, value] of [['Source', source?.name || item.sourceId], ['Attribution', item.attribution], ['Semantics', item.semantics],
      ['Freshness', item.freshness], ['Event time', time(item.eventAt)], ['Provider update / publication time', time(item.updatedAt)],
      ['Fetched time', time(item.fetchedAt)], ['Alert expiry', time(item.expiresAt)], ['Coverage', source?.coverage || 'See provider'],
      ['Uncertainty', item.uncertainty], ['Map geometry', item.geometry ? item.geometry.type : 'Unavailable; no location invented']]) dl.append(el('dt', name), el('dd', value));
    this.nodes.detail.append(dl); if (focus) this.nodes.detail.focus();
  }
  currentData() {
    if (!this.data) return null;
    const at = Date.now();
    return { ...this.data, items: this.data.items.filter((item) => {
      const source = this.data.sources.find((s) => s.id === item.sourceId);
      return !source?.maxAgeMs || at - Date.parse(item.fetchedAt) <= source.maxAgeMs;
    }).map((item) => {
      const source = this.data.sources.find((s) => s.id === item.sourceId);
      return { ...item, semantics: item.expiresAt && Date.parse(item.expiresAt) <= at ? 'historical' : item.semantics,
        freshness: at - Date.parse(item.fetchedAt) > (source?.staleMs || Infinity) ? 'stale' : item.freshness };
    }) };
  }
  render() {
    const snapshot = this.currentData();
    for (const source of this.data?.sources || []) {
      const label = this.ledgerLabels.get(source.id);
      if (label) label.textContent = `${source.name} · ${sourceFreshness(source)}`;
    }
    const filtered = filterWorld(snapshot, { preset: this.nodes.preset.value, sources: [...this.selectedSources], search: this.nodes.search.value, semantics: this.nodes.semantic.value, sort: this.nodes.sort.value, page: this.page });
    this.page = filtered.page; this.nodes.count.textContent = `${filtered.total} reports · page ${this.page + 1} of ${filtered.pages}. Up to 50 reports per page.`;
    this.nodes.previous.disabled = this.page === 0; this.nodes.next.disabled = this.page + 1 >= filtered.pages;
    this.nodes.list.replaceChildren();
    for (const item of filtered.items) {
      const row = el('li'); const button = el('button', `${item.title} · ${item.semantics} · ${item.freshness} · ${time(item.eventAt)}`, { type: 'button', 'aria-pressed': String(this.selectedId === item.id) });
      button.addEventListener('click', () => { this.showDetail(item, true); this.render(); }); row.append(button); this.nodes.list.append(row);
    }
    if (!filtered.total) this.nodes.list.append(el('li', this.selectedSources.size ? 'No matching reports. Empty results do not establish absence of events.' : 'Select a source to inspect its reports.'));
    const selected = filtered.all.find((item) => item.id === this.selectedId);
    if (this.selectedId) this.showDetail(selected);
    const mapped = this.map?.set(filtered.all, WORLD_PRESETS[this.nodes.preset.value]);
    if (mapped) this.nodes.mapStatus.textContent = `Ground context globe. Made with Natural Earth (public domain). ${mapped.geometries} geometries / ${mapped.vertices} vertices shown; the list remains complete.`;
    if (this.receivedAt && Date.now() - this.receivedAt >= 60000 && !this.request) this.nodes.status.textContent = 'Cached context; reload to check for newer source state. Provider freshness is shown per report.';
  }
  renderLedger() {
    this.nodes.ledger.replaceChildren(); this.ledgerLabels.clear();
    for (const source of this.data?.sources || []) {
      const row = el('li'); const label = el('label'); const input = el('input', undefined, { type: 'checkbox', 'aria-label': source.name });
      input.checked = this.selectedSources.has(source.id); input.disabled = !source.enabled;
      input.addEventListener('change', () => { input.checked ? this.selectedSources.add(source.id) : this.selectedSources.delete(source.id); this.page = 0; this.render(); });
      const health = el('span', `${source.name} · ${source.state}`); this.ledgerLabels.set(source.id, health);
      label.append(input, health); row.append(label,
        el('p', source.reason || source.coverage), el('p', `Last successful fetch: ${time(source.fetchedAt)}. Last attempt: ${time(source.attemptedAt)}.`),
        el('p', `Provider feed update time: ${time(source.providerUpdatedAt)}. Next eligible acquisition: ${time(source.nextAttemptAt)}. ${source.rejected || 0} rejected records.`),
        el('p', source.error ? `Source failure: ${source.error}${source.expired ? '; previous data expired' : '; retained data is stale'}.` : source.attribution), link('Source / terms', source.termsUrl || source.url));
      this.nodes.ledger.append(row);
    }
  }
  async reload() {
    this.request?.abort(); const controller = new AbortController(); this.request = controller; this.nodes.refresh.disabled = true;
    this.nodes.status.textContent = 'Loading public context…';
    try {
      const response = await this.fetchImpl('/api/world/context', { headers: this.getHeaders(), cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      if (!response.ok) throw new Error('World context unavailable.');
      const nextData = validateWorldSnapshot(await response.json());
      if (this.destroyed || controller.signal.aborted) return;
      this.data = nextData; this.receivedAt = Date.now(); this.renderLedger();
      this.nodes.status.textContent = `Public context loaded at ${time(this.data.generatedAt)}. Select a source; this read does not fetch providers.`; this.render();
    } catch {
      if (!controller.signal.aborted && !this.destroyed) {
        // A failed read cannot keep last-known records labelled fresh.
        if (this.data) this.data = { ...this.data, items: this.data.items.map((item) => ({ ...item, freshness: 'stale' })), sources: this.data.sources.map((source) => source.enabled ? { ...source, state: 'failure', error: 'context_read_failed' } : source) };
        this.nodes.status.textContent = this.data ? 'Context reload failed; retained reports are stale.' : 'World context is unavailable. No substitute data is shown.';
        this.renderLedger(); this.render();
      }
    } finally { if (this.request === controller) { this.request = null; this.nodes.refresh.disabled = false; } }
  }
  stopMap() {
    this.mapGeneration++; this.wantedMap = false; this.map?.destroy(); this.map = null; this.nodes.canvas.hidden = true;
    this.nodes.mapButton.setAttribute('aria-pressed', 'false'); this.nodes.mapButton.textContent = 'Show globe';
  }
  async toggleMap() {
    if (this.wantedMap) { this.stopMap(); this.nodes.mapStatus.textContent = 'Globe is off. The filtered list remains available.'; return; }
    this.wantedMap = true; const generation = ++this.mapGeneration; this.nodes.canvas.hidden = false;
    this.nodes.mapButton.setAttribute('aria-pressed', 'true'); this.nodes.mapButton.textContent = 'Use list only'; this.nodes.mapStatus.textContent = 'Loading local globe…';
    const fail = () => { this.stopMap(); this.nodes.mapStatus.textContent = 'Globe unavailable. Use the searchable report list.'; };
    try {
      const module = await this.loadMap();
      if (!this.wantedMap || this.destroyed || generation !== this.mapGeneration) return;
      const nextMap = await module.createWorldMap({ container: this.nodes.canvas, onSelect: (id) => { const item = this.currentData()?.items.find((item) => item.id === id); if (item) { this.showDetail(item, true); this.render(); } }, onFailure: fail });
      if (!this.wantedMap || this.destroyed || generation !== this.mapGeneration) { nextMap.destroy(); return; }
      this.map = nextMap; this.nodes.mapStatus.textContent = 'Ground context globe. Made with Natural Earth (public domain).'; this.render();
    } catch { if (generation === this.mapGeneration) fail(); }
  }
  activate() {
    if (this.destroyed || this.active) return; this.active = true; void this.reload(); this.freshnessTimer = setInterval(() => this.render(), 60000);
  }
  deactivate() { this.active = false; this.request?.abort(); clearInterval(this.freshnessTimer); this.stopMap(); }
  destroy() { this.destroyed = true; this.active = false; this.request?.abort(); this.events.abort(); clearInterval(this.freshnessTimer); this.stopMap(); }
  diagnostics() { return { projection: this.map?.projection?.() || null, renderedRows: this.nodes.list.children.length, sourceCount: this.data?.sources.length || 0 }; }
}
