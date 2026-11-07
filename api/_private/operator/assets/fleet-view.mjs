import { healthState, issueDisposition, recentIssues, relativeTime } from './fleet-state.mjs';
import { operatorRequestHeaders } from './operator-session.mjs';
import { TYPE_LABELS, HEALTH_LABELS, EDGE_LABELS, el, svg, action, icon, externalLink, detailRow, pager } from './fleet-elements.mjs';

export function createFleetView(options) { return new FleetView(options); }

class FleetView {
  constructor({ root, getHeaders = operatorRequestHeaders, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
    this.root = root; this.getHeaders = getHeaders; this.fetchImpl = fetchImpl; this.now = now;
    this.data = null; this.selectedId = null; this.days = 7; this.layer = 'all';
    this.page = 0; this.issuePage = 0; this.textView = false; this.active = false;
    this.generation = 0; this.events = new AbortController(); this.width = 0;
    this.prefix = 'fleet-' + Math.random().toString(36).slice(2, 8);
    this.mount();
  }

  mount() {
    this.root.classList.add('fleet-view');
    const heading = el('div', null, 'fleet-heading');
    const title = el('div');
    title.append(el('p', 'YOUR SYSTEMS', 'fleet-eyebrow'), el('h2', 'Fleet'));
    this.status = el('p', 'Ready to connect', 'fleet-status');
    this.status.setAttribute('role', 'status');
    const right = el('div', null, 'fleet-heading-status');
    right.append(this.status, action('↻', 'refresh', 'fleet-icon-button'));
    right.lastChild.setAttribute('aria-label', 'Refresh Fleet snapshot');
    heading.append(title, right);
    this.summary = el('div', null, 'fleet-summary');
    this.controls = this.createControls();
    this.notice = el('p', null, 'fleet-notice'); this.notice.hidden = true;
    this.breadcrumb = el('div', null, 'fleet-breadcrumb');
    this.canvas = el('div', null, 'fleet-canvas');
    this.canvas.setAttribute('aria-label', 'Fleet relationship map');
    this.mapFooter = el('div', null, 'fleet-map-footer');
    this.list = el('div', null, 'fleet-text-view'); this.list.hidden = true;
    this.legend = this.createLegend();
    this.dialog = el('dialog', null, 'fleet-sheet');
    this.dialog.setAttribute('aria-labelledby', this.prefix + '-detail-title');
    this.root.append(heading, this.summary, this.controls, this.notice, this.breadcrumb, this.canvas, this.mapFooter, this.list, this.legend, this.dialog);
    this.bind();
    this.render();
  }

  createControls() {
    const controls = el('div', null, 'fleet-controls');
    const windows = el('div', null, 'fleet-segments');
    windows.setAttribute('aria-label', 'Recent work window');
    for (const [label, days] of [['24h', 1], ['7d', 7], ['30d', 30], ['All', 'all']]) {
      const item = action(label, 'window'); item.dataset.days = days;
      item.setAttribute('aria-label', 'Work updated in ' + (days === 'all' ? 'all time' : label));
      windows.append(item);
    }
    const label = el('label', null, 'fleet-edge-filter');
    const name = el('span', 'Connections', 'fleet-sr-only');
    this.edgeFilter = el('select'); this.edgeFilter.setAttribute('aria-label', 'Connection type');
    for (const [value, text] of [['all', 'All connections'], ['build', 'Build'], ['deploy', 'Deploy'], ['ingest', 'Ingest']]) {
      const option = el('option', text); option.value = value; this.edgeFilter.append(option);
    }
    label.append(name, this.edgeFilter);
    controls.append(windows, label);
    return controls;
  }

  createLegend() {
    const footer = el('div', null, 'fleet-legend');
    const lines = el('div', null, 'fleet-edge-legend');
    for (const [kind, label] of Object.entries(EDGE_LABELS)) {
      const entry = el('span', null, 'fleet-legend-item');
      entry.append(el('i', null, 'fleet-line-key fleet-line-' + kind), el('span', label));
      lines.append(entry);
    }
    footer.append(lines, action('Text view', 'text', 'fleet-text-button'), action('Data & freshness', 'sources', 'fleet-text-button'));
    return footer;
  }

  bind() {
    const signal = this.events.signal;
    this.root.addEventListener('click', (event) => {
      const node = event.target.closest('[data-node-id]');
      const issue = event.target.closest('[data-issue-id]');
      const target = event.target.closest('[data-action]');
      if (node) this.selectNode(node.dataset.nodeId);
      else if (issue) this.openSheet('issue', issue.dataset.issueId);
      else if (target) this.handleAction(target);
    }, { signal });
    this.edgeFilter.addEventListener('change', () => {
      this.layer = this.edgeFilter.value; this.page = 0; this.render();
    }, { signal });
    this.dialog.addEventListener('close', () => {
      const focus = this.returnFocus; this.returnFocus = null; this.sheetRecord = null;
      if (this.active) this.restoreFocus(focus);
    }, { signal });
    this.dialog.addEventListener('click', (event) => {
      if (event.target !== this.dialog) return;
      const box = this.dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) this.dialog.close();
    }, { signal });
    document.addEventListener('visibilitychange', () => {
      if (!this.active) return;
      if (document.hidden) this.request?.abort();
      else void this.load();
    }, { signal });
    this.observer = new ResizeObserver(() => {
      if (Math.abs(this.canvas.clientWidth - this.width) > 8 && this.active) this.renderMap();
    });
    this.observer.observe(this.canvas);
  }

  handleAction(target) {
    const name = target.dataset.action;
    if (name === 'refresh') { void this.load(); return; }
    if (name === 'close') { this.dialog.close(); return; }
    if (name === 'sources') { this.openSheet('sources'); return; }
    if (name === 'home') { this.selectedId = null; this.page = 0; this.issuePage = 0; }
    if (name === 'window') { this.days = target.dataset.days === 'all' ? 'all' : Number(target.dataset.days); this.issuePage = 0; }
    if (name === 'page') this.page = Number(target.dataset.page);
    if (name === 'issue-page') this.issuePage = Number(target.dataset.page);
    if (name === 'text') this.textView = !this.textView;
    if (name === 'node-details') { this.openSheet('node', this.selectedId); return; }
    this.render();
  }

  async load() {
    if (!this.active || document.hidden) return;
    let headers;
    try { headers = this.getHeaders({ Accept: 'application/json' }); }
    catch { this.lockSession(); return; }
    this.request?.abort(); const request = new AbortController(); this.request = request;
    const generation = ++this.generation;
    this.status.textContent = this.data ? 'Refreshing…' : 'Connecting…';
    const timeout = setTimeout(() => request.abort(), 8000);
    try {
      const response = await this.fetchImpl('/api/operator-fleet', {
        method: 'GET', headers,
        credentials: 'same-origin', cache: 'no-store', signal: request.signal,
      });
      await this.acceptResponse(response, generation);
    } catch {
      if (generation !== this.generation || !this.active || document.hidden) return;
      this.error = this.data ? 'Refresh unavailable. Showing the last snapshot with its original observation times.' : 'Fleet data is not connected yet.';
    } finally {
      clearTimeout(timeout);
      if (generation === this.generation && this.active) this.render();
    }
  }

  async acceptResponse(response, generation) {
    if (generation !== this.generation || !this.active) return;
    if ([401, 403].includes(response.status)) { this.lockSession(); return; }
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    if (generation !== this.generation || !this.active) return;
    if (data.schemaVersion !== 'bss.fleet.v1' || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || !Array.isArray(data.issues)) throw new Error('Invalid snapshot');
    this.data = data; this.error = null; this.authFailed = false;
    if (!data.nodes.some((node) => node.id === this.selectedId)) this.selectedId = null;
  }

  lockSession() {
    this.request?.abort(); this.generation++; clearInterval(this.timer); clearInterval(this.freshnessTimer);
    this.data = null; this.selectedId = null; this.sheetRecord = null;
    this.returnFocus = null; this.dialog.close(); this.dialog.replaceChildren(); this.list.replaceChildren();
    this.error = 'Sign in again to view your private systems.'; this.authFailed = true;
    this.render();
  }

  captureFocus() {
    const element = document.activeElement;
    if (!this.root.contains(element)) return null;
    let selector = null;
    if (element.dataset.nodeId) selector = '[data-node-id="' + CSS.escape(element.dataset.nodeId) + '"]';
    else if (element.dataset.issueId) selector = '[data-issue-id="' + CSS.escape(element.dataset.issueId) + '"]';
    else if (element.dataset.action) {
      selector = '[data-action="' + CSS.escape(element.dataset.action) + '"]';
      if (element.hasAttribute('aria-label')) selector += '[aria-label="' + CSS.escape(element.getAttribute('aria-label')) + '"]';
    } else if (element.tagName === 'A') selector = 'a[href="' + CSS.escape(element.getAttribute('href')) + '"]';
    const surface = this.dialog.contains(element) ? 'dialog' : this.list.contains(element) ? 'list' : this.canvas.contains(element) ? 'canvas' : 'root';
    return { element, selector, surface, fallbackNodeId: this.selectedId };
  }

  restoreFocus(focus) {
    if (!focus || (this.dialog.open && focus.surface !== 'dialog')) return;
    const focusable = (element) => element?.isConnected && !element.disabled && !element.closest('[hidden]') && element.getClientRects().length;
    const surface = this[focus.surface] || this.root;
    const candidates = [focus.element, ...(focus.selector ? surface.querySelectorAll(focus.selector) : [])];
    const current = candidates.find(focusable);
    if (current) { current.focus({ preventScroll: true }); return; }
    const visible = this.textView ? this.list : this.canvas;
    const fallback = focus.fallbackNodeId && visible.querySelector('[data-node-id="' + CSS.escape(focus.fallbackNodeId) + '"]');
    const target = focusable(fallback) ? fallback : focus.surface === 'dialog' ? this.dialog.querySelector('[data-action="close"]') : visible.querySelector('button:not(:disabled)') || this.legend.querySelector('[data-action="text"]');
    if (focusable(target)) target.focus({ preventScroll: true });
  }

  render() {
    const focus = this.captureFocus();
    this.status.textContent = this.data ? 'Snapshot · ' + relativeTime(this.data.generatedAt, this.now()) + ' ago' : this.authFailed ? 'Session unavailable' : 'Not connected';
    this.notice.textContent = this.error || ''; this.notice.hidden = !this.error;
    for (const item of this.controls.querySelectorAll('[data-days]')) item.setAttribute('aria-pressed', String(String(this.days) === item.dataset.days));
    this.legend.querySelector('[data-action="text"]').textContent = this.textView ? 'Map view' : 'Text view';
    this.legend.querySelector('[data-action="text"]').setAttribute('aria-pressed', String(this.textView));
    this.summary.replaceChildren();
    for (const kind of ['hardware', 'azure', 'repo']) {
      const item = el('span', null, 'fleet-summary-item');
      item.append(icon(kind), el('strong', this.data ? this.data.nodes.filter((node) => node.kind === kind).length : '—'), el('span', kind === 'repo' ? 'repos' : kind === 'hardware' ? 'owned' : 'Azure'));
      this.summary.append(item);
    }
    this.breadcrumb.replaceChildren();
    const selected = this.data?.nodes.find((node) => node.id === this.selectedId);
    if (selected) {
      this.breadcrumb.append(action('← All systems', 'home', 'fleet-text-button'), el('strong', selected.label), action('Details', 'node-details', 'fleet-text-button'));
    } else this.breadcrumb.append(el('span', 'Tap a repository to unfold its work.', 'fleet-hint'));
    this.canvas.hidden = this.textView; this.mapFooter.hidden = this.textView; this.list.hidden = !this.textView;
    this.renderMap();
    if (this.textView) this.renderText();
    if (this.dialog.open && this.sheetRecord) {
      const scrollTop = this.dialog.scrollTop;
      this.renderSheet(this.sheetRecord.kind, this.sheetRecord.id);
      this.dialog.scrollTop = scrollTop;
    }
    this.restoreFocus(focus);
  }

  overviewScene(width) {
    const nodes = []; const groups = [];
    const phone = width < 720;
    const kinds = ['hardware', 'repo', 'azure'];
    const limits = phone ? { hardware: 2, repo: 6, azure: 3 } : { hardware: 3, repo: 6, azure: 3 };
    const pages = Math.max(1, ...kinds.map((kind) => Math.ceil(this.data.nodes.filter((node) => node.kind === kind).length / limits[kind])));
    this.page = Math.min(this.page, pages - 1);
    let offset = 0;
    for (let k = 0; k < kinds.length; k++) {
      const kind = kinds[k]; const all = this.data.nodes.filter((node) => node.kind === kind);
      const subset = all.slice(this.page * limits[kind], (this.page + 1) * limits[kind]);
      if (!subset.length) continue;
      const columns = phone ? (kind === 'repo' ? Math.min(3, subset.length) : subset.length) : (kind === 'repo' ? 2 : 1);
      const rows = Math.ceil(subset.length / columns);
      groups.push({ text: TYPE_LABELS[kind], x: phone ? 16 : width * [0.12, 0.5, 0.88][k], y: phone ? offset + 13 : 20, center: !phone });
      subset.forEach((node, index) => {
        const column = index % columns; const row = Math.floor(index / columns);
        const x = phone ? width * ((column + 0.5) / columns) : kind === 'repo' ? width * (column ? 0.61 : 0.39) : width * (kind === 'hardware' ? 0.12 : 0.88);
        const y = phone ? offset + 68 + row * 100 : 100 + row * 132;
        nodes.push({ ...node, x, y });
      });
      if (phone) offset += 32 + rows * 100;
    }
    return { nodes, groups, edges: this.visibleEdges(nodes), height: phone ? Math.max(220, offset + 8) : 460, pages, page: this.page, total: this.data.nodes.length };
  }

  focusedScene(width, selected) {
    const relevant = this.data.edges.filter((edge) => (edge.source === selected.id || edge.target === selected.id) && (this.layer === 'all' || edge.kind === this.layer));
    const neighborIds = [...new Set(relevant.map((edge) => edge.source === selected.id ? edge.target : edge.source))].sort();
    const pages = Math.max(1, Math.ceil(neighborIds.length / 4)); this.page = Math.min(this.page, pages - 1);
    const shown = neighborIds.slice(this.page * 4, this.page * 4 + 4);
    const slots = [[0.24, 80], [0.76, 80], [0.16, 218], [0.84, 218]];
    const nodes = [{ ...selected, x: width * 0.5, y: 218, selected: true }];
    shown.forEach((id, index) => {
      const node = this.data.nodes.find((item) => item.id === id);
      if (node) nodes.push({ ...node, x: width * slots[index][0], y: slots[index][1] });
    });
    const issues = recentIssues(this.data, { repoId: selected.id, days: this.days, now: this.now() });
    const issuePages = Math.max(1, Math.ceil(issues.length / 3)); this.issuePage = Math.min(this.issuePage, issuePages - 1);
    const visible = issues.slice(this.issuePage * 3, this.issuePage * 3 + 3);
    visible.forEach((issue, index) => nodes.push({ ...issue, graphId: 'issue:' + issue.id, kind: 'issue', label: '#' + issue.number, x: width * ((index + 0.5) / Math.max(visible.length, 1)), y: 398 }));
    const edges = this.visibleEdges(nodes);
    for (const issue of visible) edges.push({ id: 'work-' + issue.id, source: selected.id, target: 'issue:' + issue.id, kind: 'work' });
    return { nodes, edges, groups: [{ text: neighborIds.length + ' connected systems', x: 16, y: 13 }, { text: 'RECENT WORK · ' + issues.length + ' updated', x: 16, y: 327 }], height: 480, pages, page: this.page, issuePages, totalIssues: issues.length, total: neighborIds.length + 1 };
  }

  visibleEdges(nodes) {
    const ids = new Set(nodes.filter((node) => node.kind !== 'issue').map((node) => node.id));
    return this.data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && (this.layer === 'all' || edge.kind === this.layer));
  }

  renderMap() {
    const focus = this.captureFocus();
    this.canvas.replaceChildren(); this.mapFooter.replaceChildren();
    if (!this.data?.nodes.length) { this.renderEmpty(); return; }
    this.width = this.canvas.clientWidth || this.root.clientWidth || 360;
    const selected = this.data.nodes.find((node) => node.id === this.selectedId);
    const scene = selected ? this.focusedScene(this.width, selected) : this.overviewScene(this.width);
    this.canvas.style.height = scene.height + 'px';
    this.canvas.dataset.mode = selected ? 'focused' : 'overview';
    const paths = this.edgeLayer(scene, this.width);
    this.canvas.append(paths);
    for (const group of scene.groups) {
      const label = el('span', group.text, 'fleet-map-label');
      label.style.left = group.x + 'px'; label.style.top = group.y + 'px';
      if (group.center) label.style.transform = 'translateX(-50%)';
      this.canvas.append(label);
    }
    for (const node of scene.nodes) this.canvas.append(this.nodeButton(node));
    if (selected && !scene.totalIssues) {
      const empty = el('p', 'No issues updated in this window.', 'fleet-no-work');
      this.canvas.append(empty);
    }
    this.renderPager(scene, selected);
    this.restoreFocus(focus);
  }

  edgeLayer(scene, width) {
    const layer = svg('svg', { viewBox: '0 0 ' + width + ' ' + scene.height, 'aria-hidden': 'true', class: 'fleet-edges' });
    const defs = svg('defs');
    for (const kind of ['build', 'deploy', 'ingest', 'work']) {
      const marker = svg('marker', { id: this.prefix + '-' + kind, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 5, markerHeight: 5, orient: 'auto' });
      marker.append(svg('path', { d: 'M0 0 8 4 0 8Z', class: 'fleet-arrow-' + kind })); defs.append(marker);
    }
    layer.append(defs);
    for (const edge of scene.edges) {
      const from = scene.nodes.find((node) => node.kind !== 'issue' && node.id === edge.source);
      const to = scene.nodes.find((node) => edge.kind === 'work' ? node.kind === 'issue' && node.graphId === edge.target : node.kind !== 'issue' && node.id === edge.target);
      if (!from || !to) continue;
      const dx = to.x - from.x; const dy = to.y - from.y; const distance = Math.hypot(dx, dy) || 1;
      const start = { x: from.x + dx / distance * 30, y: from.y - 13 + dy / distance * 30 };
      const end = { x: to.x - dx / distance * 34, y: to.y - 13 - dy / distance * 34 };
      const bend = Math.abs(dx) > 70 ? dx * 0.45 : 28;
      const d = 'M' + start.x + ',' + start.y + ' C' + (start.x + bend) + ',' + start.y + ' ' + (end.x - bend) + ',' + end.y + ' ' + end.x + ',' + end.y;
      layer.append(svg('path', { d, class: 'fleet-edge fleet-edge-' + edge.kind + (edge.inferred ? ' fleet-edge-inferred' : ''), 'marker-end': 'url(#' + this.prefix + '-' + edge.kind + ')' }));
      if (this.selectedId && edge.kind !== 'work' && Math.abs(dy) > 50) {
        const label = svg('text', { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 5, 'text-anchor': 'middle', class: 'fleet-edge-label fleet-edge-label-' + edge.kind });
        label.textContent = EDGE_LABELS[edge.kind]?.toLowerCase() || ''; layer.append(label);
      }
    }
    return layer;
  }

  nodeButton(node) {
    const issue = node.kind === 'issue';
    const health = issue ? issueDisposition(node) : node.kind === 'repo' ? 'repo' : healthState(node, this.now());
    const button = el('button', null, 'fleet-node fleet-node-' + node.kind + ' fleet-health-' + health + (node.selected ? ' fleet-node-selected' : ''));
    button.type = 'button'; button.style.left = node.x + 'px'; button.style.top = node.y + 'px';
    if (issue) button.dataset.issueId = node.id; else button.dataset.nodeId = node.id;
    button.setAttribute('aria-label', issue ? node.label + ' · ' + node.title + ' · ' + health : node.label + (node.kind === 'repo' ? ', inspect repository and recent issues' : ', ' + HEALTH_LABELS[health] + ', inspect resource'));
    const glyph = el('span', null, 'fleet-node-glyph');
    const ring = svg('svg', { viewBox: '0 0 64 64', class: 'fleet-node-ring', 'aria-hidden': 'true' });
    ring.append(svg('circle', { cx: 32, cy: 32, r: 29, fill: 'none', 'stroke-width': 2 }));
    glyph.append(ring, icon(issue ? health : node.kind)); button.append(glyph);
    button.append(el('span', node.label, 'fleet-node-name'));
    if (issue) {
      button.append(el('span', node.title, 'fleet-issue-caption'));
      button.append(el('span', (health === 'completed' ? 'done' : health) + ' · ' + relativeTime(node.updatedAt, this.now()), 'fleet-node-meta'));
    }
    else if (node.kind !== 'repo') button.append(el('span', HEALTH_LABELS[health], 'fleet-node-meta'));
    else {
      const count = recentIssues(this.data, { repoId: node.id, days: this.days, now: this.now() }).length;
      button.append(el('span', count ? count + ' changed' : 'Repository', 'fleet-node-meta'));
      if (count) glyph.append(el('span', count, 'fleet-activity-badge'));
    }
    return button;
  }

  renderPager(scene, selected) {
    if (scene.pages > 1) this.mapFooter.append(pager(selected ? 'Connections' : 'Map', scene.page, scene.pages, 'page'));
    if (selected && scene.issuePages > 1) this.mapFooter.append(pager('Issues', this.issuePage, scene.issuePages, 'issue-page'));
    const visible = scene.nodes.filter((node) => node.kind !== 'issue').length;
    if (!selected) this.mapFooter.append(el('p', visible + ' of ' + scene.total + ' systems · arrows follow the relationship direction', 'fleet-hint'));
    else this.mapFooter.append(el('p', 'Tap an issue to inspect · tap a neighbor to follow its connections', 'fleet-hint'));
  }

  renderEmpty() {
    this.canvas.style.height = '360px';
    const empty = el('div', null, 'fleet-empty');
    const symbols = el('div', null, 'fleet-empty-symbols');
    symbols.append(icon('hardware'), el('span', '—'), icon('repo'), el('span', '—'), icon('azure'));
    empty.append(symbols, el('h3', this.authFailed ? 'Your private systems are locked' : this.data ? 'No systems in this snapshot' : 'Your systems will appear here'));
    empty.append(el('p', this.authFailed ? 'Restore your Society session to continue.' : this.data ? 'The connected source has no inventory to display.' : 'Connect the private Fleet data source to see resources, relationships, and recent work.'));
    if (this.authFailed) {
      const link = el('a', 'Sign in to Society', 'fleet-button'); link.href = '/?returnTo=%2Foperator%2Ffleet'; empty.append(link);
    } else empty.append(action('Try again', 'refresh'));
    this.canvas.append(empty);
  }

  selectNode(id) {
    const node = this.data?.nodes.find((item) => item.id === id);
    if (!node) return;
    if (node.kind !== 'repo') { this.openSheet('node', id); return; }
    this.selectedId = id; this.page = 0; this.issuePage = 0;
    this.render();
    const surface = this.textView ? this.list : this.canvas;
    surface.querySelector('[data-node-id="' + CSS.escape(id) + '"]')?.focus({ preventScroll: true });
  }

  openSheet(kind, id) {
    this.returnFocus = this.captureFocus();
    this.sheetRecord = { kind, id };
    this.renderSheet(kind, id);
    if (!this.dialog.open) this.dialog.showModal();
  }

  renderSheet(kind, id) {
    this.dialog.replaceChildren();
    const close = action('×', 'close', 'fleet-icon-button'); close.setAttribute('aria-label', 'Close details');
    const header = el('div', null, 'fleet-sheet-header');
    const title = el('h3'); title.id = this.prefix + '-detail-title';
    header.append(title, close); this.dialog.append(el('div', null, 'fleet-sheet-handle'), header);
    if (kind === 'issue') this.issueDetails(id, title);
    else if (kind === 'node') this.nodeDetails(id, title);
    else this.sourceDetails(title);
  }

  issueDetails(id, heading) {
    const issue = this.data?.issues.find((item) => item.id === id);
    if (!issue) { heading.textContent = 'Issue unavailable'; return; }
    const repo = this.data.nodes.find((node) => node.id === issue.repoId);
    heading.textContent = (repo?.label || 'Repository') + ' · #' + issue.number;
    const disposition = issueDisposition(issue);
    this.dialog.append(el('span', disposition === 'completed' ? 'Completed' : disposition === 'closed' ? 'Closed · not marked completed' : 'Open', 'fleet-status-chip fleet-chip-' + disposition));
    this.dialog.append(el('h4', issue.title, 'fleet-issue-title'));
    const facts = el('dl');
    facts.append(detailRow('Updated', new Date(issue.updatedAt).toLocaleString()), detailRow('Activity', relativeTime(issue.updatedAt, this.now()) + ' ago'));
    this.dialog.append(facts);
    const link = externalLink('Open issue on GitHub ↗', issue.url);
    if (link) this.dialog.append(link);
  }

  nodeDetails(id, heading) {
    const node = this.data?.nodes.find((item) => item.id === id);
    if (!node) { heading.textContent = 'System unavailable'; return; }
    heading.textContent = node.label;
    if (node.subtitle) this.dialog.append(el('p', node.subtitle));
    if (node.kind !== 'repo') {
      const health = healthState(node, this.now());
      this.dialog.append(el('span', HEALTH_LABELS[health], 'fleet-status-chip fleet-chip-' + health));
      this.renderMetrics(node, health);
      const facts = el('dl');
      facts.append(detailRow('Observed', node.health?.observedAt ? new Date(node.health.observedAt).toLocaleString() : 'No observation'), detailRow('Fresh until', node.health?.freshUntil ? new Date(node.health.freshUntil).toLocaleString() : 'Unknown'));
      this.dialog.append(facts);
    }
    this.dialog.append(el('h4', 'Connections'));
    const connections = this.data.edges.filter((edge) => edge.source === id || edge.target === id);
    if (!connections.length) this.dialog.append(el('p', 'No declared connections in this snapshot.'));
    for (const edge of connections) {
      const source = this.data.nodes.find((item) => item.id === edge.source);
      const target = this.data.nodes.find((item) => item.id === edge.target);
      const row = el('div', null, 'fleet-connection');
      row.append(el('span', EDGE_LABELS[edge.kind], 'fleet-connection-type fleet-type-' + edge.kind), el('p', source.label + ' → ' + target.label));
      if (edge.label) row.append(el('small', edge.label));
      if (edge.inferred) row.append(el('small', 'Proposed / inferred · not runtime proof'));
      const evidence = externalLink('Source ↗', edge.evidenceUrl);
      if (evidence) row.append(evidence); this.dialog.append(row);
    }
  }

  renderMetrics(node, health) {
    if (health === 'unknown') {
      this.dialog.append(el('p', 'Current metrics unknown. No valid observation is available.'));
      return;
    }
    const metrics = el('div', null, 'fleet-metrics');
    for (const metric of node.health?.metrics || []) {
      const item = el('div', null, 'fleet-metric');
      item.append(el('span', metric.label), el('strong', metric.value + (metric.unit ? ' ' + metric.unit : '')));
      if (Number.isFinite(metric.max) && metric.max > 0) {
        const meter = el('meter'); meter.min = 0; meter.max = metric.max; meter.value = Math.max(0, Math.min(metric.max, metric.value)); meter.setAttribute('aria-label', metric.label);
        item.append(meter);
      }
      metrics.append(item);
    }
    if (metrics.children.length) {
      this.dialog.append(metrics);
      if (health === 'stale') this.dialog.append(el('p', 'These are the last observed values; current utilization is unknown.', 'fleet-notice'));
    } else this.dialog.append(el('p', 'No health metrics reported.'));
  }

  sourceDetails(heading) {
    heading.textContent = 'Data & freshness';
    this.dialog.append(el('p', 'Snapshots preserve the time each source observed a value. Refreshing this screen does not make an old measurement current.'));
    if (!this.data) { this.dialog.append(el('p', 'No private snapshot has been received.')); return; }
    const facts = el('dl');
    facts.append(detailRow('Snapshot produced', new Date(this.data.generatedAt).toLocaleString()));
    this.dialog.append(facts);
    for (const source of this.data.sources || []) {
      const row = el('div', null, 'fleet-source');
      row.append(el('strong', source.label), el('span', source.state), el('small', source.observedAt ? new Date(source.observedAt).toLocaleString() : 'Never observed'));
      this.dialog.append(row);
    }
    this.dialog.append(el('p', 'Dashed health rings mean stale, stopped, or unknown. Issue activity reflects updated time; a completed issue does not prove a deployment.', 'fleet-hint'));
  }

  renderText() {
    this.list.replaceChildren();
    if (!this.data?.nodes.length) {
      this.list.append(el('p', this.error || (this.data ? 'No systems in this snapshot.' : 'No Fleet snapshot available.')));
      if (this.authFailed) {
        const link = el('a', 'Sign in to Society', 'fleet-button'); link.href = '/?returnTo=%2Foperator%2Ffleet'; this.list.append(link);
      }
      return;
    }
    this.list.append(el('h3', 'Systems and relationships'));
    for (const node of this.data.nodes) {
      const section = el('section', null, 'fleet-text-system');
      const button = el('button', node.label, 'fleet-button'); button.type = 'button'; button.dataset.nodeId = node.id;
      section.append(button, el('span', node.kind === 'repo' ? 'Repository' : HEALTH_LABELS[healthState(node, this.now())]));
      for (const edge of this.data.edges.filter((item) => item.source === node.id && (this.layer === 'all' || this.layer === item.kind))) {
        const target = this.data.nodes.find((item) => item.id === edge.target);
        const connection = el('p', EDGE_LABELS[edge.kind] + ' → ' + target.label + (edge.label ? ': ' + edge.label : '') + (edge.inferred ? ' · Proposed / inferred, not runtime proof' : ''));
        const evidence = externalLink('Source ↗', edge.evidenceUrl);
        if (evidence) connection.append(document.createTextNode(' '), evidence);
        section.append(connection);
      }
      for (const issue of recentIssues(this.data, { repoId: node.id, days: this.days, now: this.now() })) {
        const item = el('button', '#' + issue.number + ' · ' + issue.title + ' · ' + issueDisposition(issue), 'fleet-text-issue');
        item.type = 'button'; item.dataset.issueId = issue.id; section.append(item);
      }
      this.list.append(section);
    }
  }

  activate() {
    if (this.active) return;
    this.active = true;
    this.timer = setInterval(() => { if (!document.hidden) void this.load(); }, 60000);
    this.freshnessTimer = setInterval(() => {
      if (document.hidden) return;
      try { this.getHeaders(); } catch { this.lockSession(); return; }
      this.render();
    }, 15000);
    this.render(); void this.load();
  }
  deactivate() {
    this.active = false; this.generation++; this.request?.abort();
    clearInterval(this.timer); clearInterval(this.freshnessTimer); this.sheetRecord = null; this.returnFocus = null; this.dialog.close();
  }
  destroy() {
    this.deactivate(); this.events.abort(); this.observer.disconnect();
    this.data = null; this.selectedId = null;
    this.canvas.replaceChildren(); this.list.replaceChildren(); this.dialog.replaceChildren();
    this.summary.replaceChildren(); this.breadcrumb.replaceChildren(); this.root.replaceChildren();
  }
}
