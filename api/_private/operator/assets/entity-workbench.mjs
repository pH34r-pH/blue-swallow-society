/** Isolated private UI. The shell injects an owner-authorized same-origin request adapter. */
export function mountEntityWorkbench(root, { request, editing } = {}) {
  if (!root || typeof request !== 'function') throw new TypeError('Root and authorized request adapter required');
  const workbench = new EntityWorkbench(root, request, editing);
  workbench.refresh();
  if (editing) workbench.checkEditing();
  return { reload: () => workbench.refresh(), destroy: () => workbench.destroy() };
}
function element(root, tag, text = '') {
  const el = root.ownerDocument.createElement(tag); el.textContent = text; return el;
}
function button(root, text, run) {
  const el = element(root, 'button', text); el.type = 'button'; el.addEventListener('click', run); return el;
}
function field(form, label, type = 'text') {
  const wrap = element(form, 'label', label), input = element(form, 'input');
  wrap.style.display = 'block'; input.style.maxWidth = '100%'; input.style.boxSizing = 'border-box';
  input.type = type; input.setAttribute('aria-label', label); wrap.append(input); form.append(wrap); return input;
}
function select(form, label, choices) {
  const wrap = element(form, 'label', label), input = element(form, 'select'); input.setAttribute('aria-label', label);
  for (const [value, text] of choices) { const option = element(form, 'option', text); option.value = value; input.append(option); }
  wrap.append(input); form.append(wrap); return input;
}
function createView(root, workbench) {
  const v = {};
  root.style.overflowWrap = 'anywhere';
  for (const [name, tag] of [['filters', 'form'], ['status', 'p'], ['list', 'ul'], ['details', 'section'], ['editor', 'form'], ['preview', 'section']]) v[name] = element(root, tag);
  v.status.setAttribute('role', 'status'); v.status.setAttribute('aria-live', 'polite');
  root.replaceChildren(element(root, 'h2', 'Anonymous entities'), element(root, 'p', 'Clusters are uncertain associations, not people. Operator corrections remain separate from machine hypotheses.'), ...Object.values(v));
  v.search = field(v.filters, 'Label or signature');
  v.modality = select(v.filters, 'Modality', [['', 'All modalities'], ['wifi_ap', 'Wi-Fi'], ['ble_device', 'Bluetooth'], ['cell_signal', 'Cellular']]);
  v.review = select(v.filters, 'Review state', [['', 'All states'], ['unreviewed', 'Unreviewed'], ['reviewed', 'Reviewed'], ['needs_review', 'Needs review'], ['retired', 'Retired']]);
  v.sort = select(v.filters, 'Sort', [['updated_at', 'Last changed'], ['last_seen_at', 'Last observed'], ['first_seen_at', 'First observed'], ['label', 'Operator label'], ['confidence', 'Machine confidence']]);
  v.direction = select(v.filters, 'Direction', [['desc', 'Descending'], ['asc', 'Ascending']]);
  v.deviceFilter = field(v.filters, 'Device ID filter');
  v.confidence = field(v.filters, 'Minimum confidence', 'number'); v.confidence.min = '0'; v.confidence.max = '1'; v.confidence.step = '0.01';
  v.since = field(v.filters, 'Observed after (UTC)', 'datetime-local'); v.until = field(v.filters, 'Observed before (UTC)', 'datetime-local');
  const searchButton = element(root, 'button', 'Search'); searchButton.type = 'submit'; v.filters.append(searchButton);
  v.previous = button(root, 'Previous page', () => { workbench.offset = Math.max(0, workbench.offset - 25); workbench.refresh(); });
  v.next = button(root, 'Next page', () => { workbench.offset += 25; workbench.refresh(); }); v.filters.append(v.previous, v.next);
  v.filters.addEventListener('submit', (event) => { event.preventDefault(); workbench.offset = 0; workbench.refresh(); });
  v.action = select(v.editor, 'Correction', [['label', 'Rename / label'], ['create', 'Create cluster'], ['membership', 'Add / remove devices'], ['reject', 'Reject association'], ['split', 'Split cluster'], ['merge', 'Merge cluster'], ['undo', 'Undo assertion']]);
  for (const [name, text] of [['label', 'Operator label'], ['labels', 'Tags (comma separated)'], ['deviceIds', 'Device IDs (comma separated)'], ['removeIds', 'Remove device IDs (comma separated)'], ['sourceId', 'Merge source entity ID'], ['assertionId', 'Assertion ID to undo'], ['reason', 'Reason'], ['evidenceIds', 'Evidence observation IDs (comma separated)']]) v[name] = field(v.editor, text);
  v.reason.required = true; v.reason.maxLength = 1000;
  v.previewButton = element(root, 'button', 'Preview correction'); v.previewButton.type = 'submit'; v.editor.append(v.previewButton);
  v.confirm = button(root, 'Confirm correction', () => workbench.confirmCorrection()); v.confirm.disabled = true;
  v.previewText = element(root, 'pre'); v.previewText.style.whiteSpace = 'pre-wrap'; v.preview.append(v.previewText, v.confirm);
  v.editor.addEventListener('input', () => workbench.invalidate()); v.editor.addEventListener('change', () => workbench.invalidate());
  v.editor.addEventListener('submit', (event) => { event.preventDefault(); workbench.previewCorrection(); });
  return v;
}
class EntityWorkbench {
  constructor(root, request, editing) {
    this.root = root; this.request = request; this.selected = null; this.pending = null; this.offset = 0;
    this.generation = 0; this.detailGeneration = 0; this.previewGeneration = 0; this.destroyed = false;
    this.v = createView(root, this);
    this.editing = editing; this.canEdit = !editing;
    if (editing) this.installEditing();
  }
  installEditing() {
    this.editStatus = element(this.root, 'p', 'Read-only access. Checking editing availability…');
    this.editStatus.setAttribute('role', 'status');
    this.enableButton = button(this.root, 'Enable editing', async () => {
      this.enableButton.disabled = true;
      this.editStatus.textContent = 'Opening Microsoft authorization…';
      try { await this.editing.enable(); }
      catch { if (!this.destroyed) { this.enableButton.disabled = false; this.editStatus.textContent = 'Editing could not be enabled. You still have read-only access.'; } }
    });
    this.root.insertBefore(this.editStatus, this.v.filters);
    this.root.insertBefore(this.enableButton, this.v.filters);
    this.setEditing(false);
  }
  setEditing(enabled) {
    this.canEdit = enabled;
    for (const control of this.v.editor.querySelectorAll('input,select,button')) control.disabled = !enabled;
    this.invalidate();
  }
  async checkEditing() {
    try {
      const status = await this.editing.status();
      if (this.destroyed) return;
      this.setEditing(status.editing === true);
      this.enableButton.disabled = status.editing || !status.configured;
      this.editStatus.textContent = status.editing ? 'Editing enabled for this session.' : 'Read-only access. Enable editing to request permission for corrections.';
      if (!status.configured) this.editStatus.textContent = 'Read-only access. Editing authorization is unavailable.';
    } catch { if (!this.destroyed) { this.setEditing(false); this.editStatus.textContent = 'Read-only access. Editing authorization is unavailable.'; } }
  }
  destroy() { this.destroyed = true; ++this.generation; this.root.replaceChildren(); }
  invalidate() { ++this.previewGeneration; this.pending = null; this.v.confirm.disabled = true; this.v.previewText.textContent = ''; }
  fail(error) {
    if (this.editing && [401, 403].includes(error?.status)) { this.setEditing(false); this.enableButton.disabled = false; this.editStatus.textContent = 'Read-only access. Editing authorization expired or was denied.'; }
    if (error?.code === 'api_scope_denied') { this.v.status.textContent = 'This session has read access only. Corrections are unavailable.'; return; }
    this.v.status.textContent = ['stale_revision', 'undo_conflict'].includes(error?.code)
      ? 'This entity changed. Reload it and review a new preview before confirming.' : 'Entity request failed. Reload to try again.';
  }
  query() {
    const v = this.v, input = { limit: 25, offset: this.offset, sort: v.sort.value, direction: v.direction.value };
    for (const [key, value] of [['search', v.search.value.trim()], ['modality', v.modality.value], ['review_state', v.review.value], ['device_id', v.deviceFilter.value.trim()]]) if (value) input[key] = value;
    if (v.confidence.value !== '') input.min_confidence = Number(v.confidence.value);
    for (const key of ['since', 'until']) if (v[key].value) input[key] = new Date(`${v[key].value}Z`).toISOString();
    return input;
  }
  async refresh() {
    const token = ++this.generation, v = this.v;
    v.status.textContent = 'Loading entities…';
    try {
      const result = await this.request('list', this.query());
      if (this.destroyed || token !== this.generation) return;
      v.list.replaceChildren();
      for (const entity of result.items) {
        const li = element(this.root, 'li'); li.append(button(this.root, entity.operator.label ?? entity.stable_key ?? entity.entity_id, () => this.load(entity.entity_id))); v.list.append(li);
      }
      v.previous.disabled = this.offset === 0; v.next.disabled = result.next_offset === null;
      v.status.textContent = result.items.length ? `${result.items.length} entities shown.` : 'No entities match these filters.';
    } catch (error) { if (token === this.generation && !this.destroyed) this.fail(error); }
  }
  async load(id) {
    this.invalidate(); const token = ++this.detailGeneration;
    try {
      const entity = await this.request('detail', { entity_id: id });
      if (this.destroyed || token !== this.detailGeneration) return;
      this.selected = entity; this.renderDetail(entity); this.v.status.textContent = 'Entity loaded.';
    } catch (error) { this.fail(error); }
  }
  renderDetail(entity) {
    const details = this.v.details, node = (tag, text) => element(this.root, tag, text);
    details.replaceChildren(node('h3', entity.operator.label ?? 'Anonymous cluster'),
      node('p', `Canonical ID: ${entity.entity_id} · Revision ${entity.revision}`),
      node('p', `Operator assertion: ${entity.operator.review_state}; tags: ${entity.operator.labels.join(', ') || 'none'}`),
      node('p', `Machine hypothesis: ${entity.machine?.version ?? 'none'}; confidence: ${entity.machine?.confidence ?? 'unknown'}`));
    if (entity.operator.merged_into) details.append(button(this.root, 'Open merged entity', () => this.load(entity.operator.merged_into)));
    details.append(node('h4', 'Current device membership'));
    const members = node('ul'); for (const id of entity.device_ids) members.append(node('li', id)); details.append(members);
    details.append(node('h4', 'Measured evidence'));
    this.renderPage(entity, 'evidence', 'evidence_offset', (item) => `${item.id} · ${item.kind} · ${item.observed_at} · ${item.relationship}`);
    details.append(node('h4', 'Correction history'));
    this.renderPage(entity, 'history', 'history_offset', (item) => `${item.id} · ${item.action} · ${item.reason} · ${item.created_at}`);
    details.append(node('h4', 'Machine versions'));
    this.renderPage(entity, 'hypotheses', 'hypothesis_offset', (item) => `${item.version} · ${item.algorithm} · confidence ${item.confidence ?? 'unknown'}`);
    this.v.label.value = entity.operator.label ?? ''; this.v.labels.value = entity.operator.labels.join(', ');
  }
  renderPage(entity, name, offsetName, describe) {
    const container = element(this.root, 'ul'), more = button(this.root, `More ${name}`, async () => {
      more.disabled = true;
      try {
        const page = await this.request('detail', { entity_id: entity.entity_id, [offsetName]: entity[name].next_offset });
        if (this.destroyed || this.selected?.entity_id !== entity.entity_id) return;
        if (page.revision !== this.selected.revision) { this.invalidate(); this.v.status.textContent = 'Entity changed. Reload before continuing.'; return; }
        entity[name] = page[name]; append();
      } catch (error) { this.fail(error); more.disabled = false; }
    });
    const append = () => {
      for (const item of entity[name].items) container.append(element(this.root, 'li', describe(item)));
      more.disabled = entity[name].next_offset === null;
    };
    append(); this.v.details.append(container, more);
  }
  async buildCommand() {
    const v = this.v, operation = v.action.value;
    if (operation !== 'create' && !this.selected) throw new Error('Select an entity');
    const id = operation === 'create' ? crypto.randomUUID() : this.selected.entity_id;
    const command = { action: operation, entity_id: id, expected_revisions: { [id]: operation === 'create' ? 0 : this.selected.revision },
      idempotency_key: crypto.randomUUID(), reason: v.reason.value.trim(), evidence_ids: splitIds(v.evidenceIds.value) };
    addActionFields(command, v);
    if (operation === 'merge') {
      const source = await this.request('detail', { entity_id: command.source_entity_id }); command.expected_revisions[source.entity_id] = source.revision;
    }
    if (operation === 'undo') {
      const event = this.selected.history.items.find((item) => item.id === command.assertion_id);
      if (!event) throw new Error('Load assertion history first');
      for (const affected of event.affected_ids) if (affected !== id) command.expected_revisions[affected] = (await this.request('detail', { entity_id: affected })).revision;
    }
    return command;
  }
  async previewCorrection() {
    if (!this.canEdit) return;
    this.invalidate(); this.v.previewButton.disabled = true; const token = this.previewGeneration;
    try {
      const command = await this.buildCommand(), result = await this.request('preview', command);
      if (this.destroyed || token !== this.previewGeneration) return;
      this.pending = command; this.v.previewText.textContent = `${command.action}: ${command.reason}\n${result.entities.map(describePreview).join('\n')}`;
      this.v.confirm.disabled = false; this.v.status.textContent = 'Review the preview, then confirm.';
    } catch (error) { this.fail(error); } finally { this.v.previewButton.disabled = !this.canEdit; }
  }
  async confirmCorrection() {
    if (!this.canEdit) return;
    if (!this.pending) return;
    this.v.confirm.disabled = true; const command = this.pending;
    try {
      await this.request('mutate', command); this.invalidate(); await this.load(command.entity_id); await this.refresh(); this.v.status.textContent = 'Correction recorded.';
    } catch (error) {
      // Keep exact command/key after uncertain transport failure for safe replay.
      if (['stale_revision', 'undo_conflict'].includes(error?.code)) this.invalidate(); else this.v.confirm.disabled = false;
      this.fail(error);
    }
  }
}
const splitIds = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);
function addActionFields(command, v) {
  const operation = command.action;
  if (operation === 'label') Object.assign(command, { label: v.label.value.trim() || null, labels: splitIds(v.labels.value) });
  if (['create', 'reject', 'split'].includes(operation)) command.device_ids = splitIds(v.deviceIds.value);
  if (operation === 'create') command.label = v.label.value.trim() || null;
  if (operation === 'membership') Object.assign(command, { add: splitIds(v.deviceIds.value), remove: splitIds(v.removeIds.value) });
  if (operation === 'split') { command.new_entity_id = crypto.randomUUID(); command.expected_revisions[command.new_entity_id] = 0; }
  if (operation === 'merge') command.source_entity_id = v.sourceId.value.trim();
  if (operation === 'undo') command.assertion_id = v.assertionId.value.trim();
}
function describePreview(entity) {
  return `${entity.entity_id}: ${entity.operator.active ? 'active' : 'retired'}; label ${entity.operator.label ?? 'none'}; tags ${entity.operator.labels.join(', ')}\nDevices: ${entity.device_ids.join(', ') || 'none'}\nRejected: ${entity.operator.rejected_device_ids.join(', ') || 'none'}\nMerged into: ${entity.operator.merged_into ?? 'none'}`;
}
