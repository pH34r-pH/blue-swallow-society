const workspace = document.getElementById('birdWorkspace'), status = document.getElementById('birdStatus');
const file = document.getElementById('birdFile'), preview = document.getElementById('birdPreview');
const clear = document.getElementById('birdClear'), results = document.getElementById('birdResults');
let session = null, active = null, timer, epoch = 0, review = null, saving = false;
const limit = 10 * 1024 * 1024;
function element(tag, text = '') { const node = document.createElement(tag); node.textContent = text; return node; }
function reset() { epoch++; active?.abort(); active = null; saving = false; review = null; file.value = ''; file.disabled = false; results.replaceChildren(); preview.disabled = false; }
function leave() { reset(); session = null; workspace.hidden = true; location.replace('/owner?auth=expired&returnTo=%2Fowner%2Fbirds'); }
function encoded(bytes) {
  let data = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) data += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(data);
}
function displayComparison(value) {
  const plan = value.comparison?.plan;
  if (value.comparison?.status === 'available' && plan) {
    const count = plan.counts;
    results.append(element('p', `Compared with draft revision ${value.comparison.revision}: ${count.add} new · ${count.change} changed · ${count.unchanged} unchanged · ${count.ambiguous} ambiguous. ${plan.missingExisting} existing records were not in this export; none will be deleted.`));
    results.append(element('p', 'Identities are provisional. Review every proposed change before importing.'));
  } else results.append(element('p', 'Comparison is unavailable until private history storage is configured.'));
  return plan;
}
function reviewFields(item, change) {
  if (change) return change.fields.map((field) => `${field.name}: ${field.before ?? 'Not recorded'} → ${field.after ?? 'Not recorded'}`);
  const values = [['Checklist', item.submissionId], ['Common name', item.commonName], ['Scientific name', item.scientificName],
    ['Date', item.observedOn], ['Count', item.countKind === 'exact' ? item.count : item.countKind], ...Object.entries(item.privateFields)];
  return values.map(([key, value]) => `${key}: ${value}`);
}
function drawPage() {
  const state = review; const start = state.page * 100; state.list.replaceChildren();
  for (const item of state.value.candidates.slice(start, start + 100)) {
    const action = state.actions.get(item.row), li = element('li');
    const count = item.countKind === 'exact' ? String(item.count) : item.countKind === 'presence' ? 'Present' : 'Count unknown';
    const location = item.privateFields.Location ? ` · Private location: ${item.privateFields.Location}` : '';
    const title = `${item.observedOn} · ${item.commonName} (${item.scientificName}) · ${count} · ${action || item.identity}${location}`;
    if (['add', 'change'].includes(action)) {
      const label = element('label'); const check = document.createElement('input'); check.type = 'checkbox';
      check.checked = state.selected.has(item.row); check.setAttribute('aria-label', `Select row ${item.row} for draft import`);
      check.addEventListener('change', () => { if (check.checked) state.selected.add(item.row); else state.selected.delete(item.row); updateSelection(); });
      label.append(check, document.createTextNode(title)); li.append(label);
    } else li.append(element('span', title));
    const disclosure = element('details'), summary = element('summary', `Review fields for row ${item.row}`), fields = element('ul');
    for (const text of reviewFields(item, state.changes.get(item.row))) fields.append(element('li', text));
    disclosure.append(summary, fields); li.append(disclosure); state.list.append(li);
  }
  state.pageLabel.textContent = `Page ${state.page + 1} of ${Math.max(1, Math.ceil(state.value.candidates.length / 100))}`;
  state.previous.disabled = state.page === 0; state.next.disabled = start + 100 >= state.value.candidates.length;
}
function updateSelection() {
  if (!review?.save) return;
  const count = review.selected.size;
  review.selection.textContent = `${count} selected. Up to 1,000 records can be saved at a time.`;
  review.save.disabled = count === 0 || count > 1000 || Boolean(active);
}
async function saveDrafts() {
  if (!review || !review.selected.size || review.selected.size > 1000 || active) return;
  const current = epoch, state = review; active = new AbortController(); saving = true; file.disabled = true; preview.disabled = true; updateSelection();
  state.previous.disabled = true; state.next.disabled = true;
  state.list.querySelectorAll('input').forEach((input) => { input.disabled = true; });
  status.textContent = 'Saving selected private drafts…';
  try {
    const response = await fetch('/api/bird-import-commit', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Blue-Swallow-Operator-Token': session.token },
      body: JSON.stringify({ csvBase64: state.csvBase64, revision: state.value.comparison.revision,
        digest: state.value.comparison.digest, selectedRows: [...state.selected] }), signal: AbortSignal.any([active.signal, AbortSignal.timeout(30000)]) });
    if ([401, 403].includes(response.status)) { leave(); return; }
    if (!response.ok) throw new Error(response.status === 409 ? 'stale' : 'unavailable');
    const result = await response.json(); if (epoch !== current) return;
    reset(); status.textContent = `${result.imported} private drafts saved. Nothing was published.`;
  } catch (error) {
    if (epoch !== current) return;
    reset(); status.textContent = error.message === 'stale' ? 'The history changed. Preview the export again before saving.'
      : 'The save could not be confirmed. Preview the export again before retrying.';
  }
}
function display(value, csvBase64) {
  const { summary } = value;
  results.replaceChildren(element('h2', 'Draft preview'), element('p', `${summary.candidates} candidates · ${summary.ambiguous} ambiguous · ${summary.rejected} rejected. Nothing was saved or published.`));
  const plan = displayComparison(value);
  review = { value, csvBase64, page: 0, selected: new Set(), actions: new Map((plan?.items || []).map((item) => [item.row, item.action])),
    changes: new Map((value.comparison?.changes || []).map((item) => [item.row, item])), list: element('ol'), pageLabel: element('span'),
    previous: element('button', 'Previous page'), next: element('button', 'Next page'), selection: element('p') };
  review.previous.type = review.next.type = 'button';
  review.previous.addEventListener('click', () => { review.page--; drawPage(); });
  review.next.addEventListener('click', () => { review.page++; drawPage(); });
  results.append(review.list, review.previous, review.pageLabel, review.next);
  if (plan) {
    review.save = element('button', 'Save selected as private drafts'); review.save.type = 'button';
    review.save.addEventListener('click', () => void saveDrafts()); results.append(review.selection, review.save); updateSelection();
  }
  drawPage();
  if (summary.rejected) results.append(element('p', `Rejected row numbers: ${value.rejected.slice(0, 100).map((row) => row.row).join(', ')}${summary.rejected > 100 ? ' …' : ''}`));
}
async function runPreview() {
  const selected = file.files[0];
  if (!selected || selected.size < 1 || selected.size > limit) { status.textContent = 'Choose a CSV file no larger than 10 MiB.'; return; }
  reset(); const current = epoch; active = new AbortController(); file.disabled = true; preview.disabled = true; status.textContent = 'Checking your export…';
  try {
    const bytes = new Uint8Array(await selected.arrayBuffer());
    if (epoch !== current) return;
    const csvBase64 = encoded(bytes);
    const response = await fetch('/api/bird-import-preview', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Blue-Swallow-Operator-Token': session.token },
      body: JSON.stringify({ csvBase64 }), signal: AbortSignal.any([active.signal, AbortSignal.timeout(30000)]) });
    if ([401, 403].includes(response.status)) { leave(); return; }
    if (!response.ok) throw new Error('preview_unavailable');
    const value = await response.json();
    if (epoch !== current) return;
    active = null; display(value, csvBase64); status.textContent = 'Preview ready. Review the results; no records have been imported.';
  } catch { if (epoch === current) status.textContent = 'The export could not be previewed. Check the file format and try again.'; }
  finally { if (epoch === current) { preview.disabled = false; file.disabled = false; active = null; } }
}
async function start() {
  const boot = epoch;
  try {
    const response = await fetch('/api/owner-auth/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (boot !== epoch) return;
    if (!response.ok) { leave(); return; }
    const value = (await response.json()).operatorSession;
    if (boot !== epoch) return;
    if (!value || typeof value.token !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) { leave(); return; }
    session = value; workspace.hidden = false; status.textContent = 'Owner session active. Select a CSV export to preview.';
    timer = setTimeout(leave, Math.max(0, Date.parse(value.expiresAt) - Date.now()));
  } catch { if (boot === epoch) status.textContent = 'Owner sign-in is unavailable. Return to owner tools and try again.'; }
}
preview.addEventListener('click', () => void runPreview());
file.addEventListener('change', () => {
  const uncertain = saving; epoch++; active?.abort(); active = null; saving = false; review = null; results.replaceChildren(); preview.disabled = false;
  status.textContent = uncertain ? 'The previous save may have completed. Preview again before retrying.' : 'File selected. Preview it before saving.';
});
clear.addEventListener('click', () => { const uncertain = saving; reset(); status.textContent = uncertain
  ? 'The save was interrupted and may have completed. Preview again before retrying.' : 'Preview cleared.'; });
window.addEventListener('pagehide', () => { clearTimeout(timer); reset(); session = null; workspace.hidden = true; });
window.addEventListener('pageshow', (event) => { if (event.persisted) leave(); });
void start();
