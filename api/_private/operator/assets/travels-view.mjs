import { createHistoryController, historyRequest, historyUrl, pageStatus, FILTERS } from './travels-state.mjs';
import { createTravelsMap } from './travels-map.mjs';
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function measurement(value, unit = '') { return Number.isFinite(value) ? `${value}${unit}` : 'Unknown'; }
function detail(row) {
  if (!row) return [element('p', 'Select an observation. A saved selection outside these filters is unavailable.')];
  const location = row.captureLocation || {};
  const fields = { 'Observation ID': row.id, 'Captured (UTC)': row.observedAt, 'Ingested (UTC)': row.ingestedAt,
    'Installation': row.deviceId || 'Unknown', 'Stored session': row.sessionId || 'Ungrouped — no stored session',
    'Radio': row.kind, 'Capture latitude': measurement(location.latitude), 'Capture longitude': measurement(location.longitude),
    'Capture accuracy': measurement(location.accuracyMeters, ' m'), 'Emitter location': 'Unknown — not inferred from capture GPS',
    'Signal': measurement(row.signalDbm, ' dBm'), 'Frequency': measurement(row.frequencyMhz, ' MHz'),
    'Channel': measurement(row.channel), 'Confidence': measurement(row.confidence) };
  const list = element('dl');
  for (const [label, value] of Object.entries(fields)) { list.append(element('dt', label), element('dd', value)); }
  return [list];
}
export function createTravelsView(options) { return new TravelsView(options); }
class TravelsView {
  constructor({ root, getHeaders }) {
    this.root = root; this.getHeaders = getHeaders;
    this.form = root.querySelector('form'); this.status = root.querySelector('[data-history-status]');
    this.list = root.querySelector('[data-history-list]'); this.inspector = root.querySelector('[data-history-detail]');
    this.next = root.querySelector('[data-history-next]'); this.canvas = root.querySelector('[data-history-map]');
    this.mapButton = root.querySelector('[data-history-map-toggle]');
    this.query = historyRequest(location.href); this.active = false; this.mapGeneration = 0;
    this.events = new AbortController();
    this.controller = createHistoryController({ fetchPage: (body, signal) => this.fetchPage(body, signal), render: (state, now) => this.render(state, now) });
    this.bind();
  }
  async fetchPage(body, signal) {
    const response = await fetch('/api/cybermap/history', { method: 'POST', headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
    if (!response.ok) throw new Error('History unavailable');
    return response.json();
  }
  render(state, now = Date.now()) {
    this.status.textContent = pageStatus(state, now);
    this.root.dataset.historyState = state.phase === 'ready' && now - Date.parse(state.data.retrievedAt) >= 60000 ? 'stale' : state.phase;
    this.next.disabled = !state.data?.nextCursor || state.phase !== 'ready';
    if (this.renderedData === state.data) return;
    this.renderedData = state.data;
    this.list.replaceChildren();
    for (const row of state.data?.observations || []) {
      const item = element('li');
      const button = element('button', `${row.observedAt} · ${row.kind} · ${row.id.slice(0, 8)}`);
      button.type = 'button'; button.dataset.observationId = row.id;
      button.setAttribute('aria-pressed', String(state.data.selected?.id === row.id));
      button.addEventListener('click', () => this.select(row.id));
      item.append(button); this.list.append(item);
    }
    this.inspector.replaceChildren(...detail(state.data?.selected));
    this.root.querySelector('[data-history-groups]').textContent = groups(state.data?.observations || []);
    this.map?.set(state.data?.observations || [], state.data?.selected?.id);
  }
  select(id) {
    this.query = { ...this.query, selectedId: id };
    history.pushState(null, '', historyUrl(location.href, this.query));
    this.controller.select(id); this.inspector.focus({ preventScroll: true });
  }
  syncForm() {
    for (const key of FILTERS) this.form.elements[key].value = ['from', 'to'].includes(key) ? this.query[key].slice(0, 16) : this.query[key] || '';
  }
  load({ push = false } = {}) {
    if (!this.active) return;
    history[push ? 'pushState' : 'replaceState'](null, '', historyUrl(location.href, this.query));
    this.syncForm(); void this.controller.load(this.query);
  }
  bind() {
    const options = { signal: this.events.signal };
    this.form.addEventListener('submit', (event) => { event.preventDefault(); this.submit(); }, options);
    this.next.addEventListener('click', () => {
      this.query = { ...this.query, cursor: this.controller.getState().data?.nextCursor }; this.load({ push: true });
    }, options);
    this.root.querySelector('[data-history-refresh]').addEventListener('click', () => { this.query = { ...this.query, cursor: null }; this.load(); }, options);
    window.addEventListener('popstate', () => { this.query = historyRequest(location.href); this.load(); }, options);
    this.mapButton.addEventListener('click', () => void this.toggleMap(), options);
  }
  submit() {
    this.query = { ...this.query, cursor: null, selectedId: null };
    for (const key of FILTERS) this.query[key] = ['from', 'to'].includes(key) ? `${this.form.elements[key].value}:00Z` : this.form.elements[key].value || null;
    this.load({ push: true });
  }
  async toggleMap() {
    if (this.map) { this.hideMap(); return; }
    const generation = ++this.mapGeneration;
    this.mapButton.disabled = true; this.canvas.hidden = false;
    try {
      const instance = await createTravelsMap(this.canvas, (id) => this.select(id));
      if (!this.active || generation !== this.mapGeneration) { instance.destroy(); return; }
      this.map = instance; this.map.set(this.controller.getState().data?.observations || [], this.query.selectedId);
      this.mapButton.textContent = 'Hide capture map'; this.mapButton.setAttribute('aria-expanded', 'true');
    } catch { this.canvas.hidden = true; this.root.querySelector('[data-history-map-status]').textContent = 'Map unavailable. The observation list and detail remain available.'; }
    finally { this.mapButton.disabled = false; }
  }
  hideMap() {
    this.mapGeneration++; this.map?.destroy(); this.map = null; this.canvas.hidden = true;
    this.mapButton.textContent = 'Show capture map'; this.mapButton.setAttribute('aria-expanded', 'false');
  }
  activate() {
    if (this.active) return;
    this.active = true; this.query = historyRequest(location.href); this.load(); this.timer = setInterval(() => this.controller.tick(), 1000);
  }
  deactivate() { this.active = false; clearInterval(this.timer); this.controller.destroy(); this.hideMap(); }
  destroy() { this.deactivate(); this.events.abort(); }
}
function groups(rows) {
  const sessions = new Set(rows.map((row) => row.sessionId).filter(Boolean));
  const ungrouped = rows.filter((row) => !row.sessionId).length;
  return `${sessions.size} stored session groups on this page; ${ungrouped} ungrouped observations. These are page contents, not complete trips. Filter by a stored session ID to explore its evidence.`;
}
