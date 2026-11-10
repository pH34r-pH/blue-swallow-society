const workspace = document.getElementById('birdWorkspace'), status = document.getElementById('birdStatus');
const file = document.getElementById('birdFile'), preview = document.getElementById('birdPreview');
const clear = document.getElementById('birdClear'), results = document.getElementById('birdResults');
let session = null, active = null, timer, epoch = 0;
const limit = 10 * 1024 * 1024;
function element(tag, text = '') { const node = document.createElement(tag); node.textContent = text; return node; }
function reset() { epoch++; active?.abort(); active = null; file.value = ''; results.replaceChildren(); preview.disabled = false; }
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
function display(value) {
  const { summary } = value;
  results.replaceChildren(element('h2', 'Draft preview'), element('p', `${summary.candidates} candidates · ${summary.ambiguous} ambiguous · ${summary.rejected} rejected. Nothing was saved or published.`));
  const plan = displayComparison(value);
  const actions = new Map((plan?.items || []).map((item) => [item.row, item.action]));
  const list = element('ol');
  for (const item of value.candidates.slice(0, 100)) {
    const count = item.countKind === 'exact' ? String(item.count) : item.countKind === 'presence' ? 'Present' : 'Count unknown';
    const location = item.privateFields.Location ? ` · Private location: ${item.privateFields.Location}` : '';
    const action = actions.has(item.row) ? ` · ${actions.get(item.row)}` : item.identity === 'ambiguous' ? ' · ambiguous identity' : '';
    list.append(element('li', `${item.observedOn} · ${item.commonName} (${item.scientificName}) · ${count}${action}${location}`));
  }
  results.append(list);
  if (summary.candidates > 100) results.append(element('p', 'Only the first 100 candidates are displayed.'));
  if (summary.rejected) results.append(element('p', `Rejected row numbers: ${value.rejected.slice(0, 100).map((row) => row.row).join(', ')}${summary.rejected > 100 ? ' …' : ''}`));
}
async function runPreview() {
  const selected = file.files[0];
  if (!selected || selected.size < 1 || selected.size > limit) { status.textContent = 'Choose a CSV file no larger than 10 MiB.'; return; }
  reset(); const current = epoch; active = new AbortController(); preview.disabled = true; status.textContent = 'Checking your export…';
  try {
    const bytes = new Uint8Array(await selected.arrayBuffer());
    if (epoch !== current) return;
    const response = await fetch('/api/bird-import-preview', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Blue-Swallow-Operator-Token': session.token },
      body: JSON.stringify({ csvBase64: encoded(bytes) }), signal: active.signal });
    if ([401, 403].includes(response.status)) { leave(); return; }
    if (!response.ok) throw new Error('preview_unavailable');
    const value = await response.json();
    if (epoch !== current) return;
    display(value); status.textContent = 'Preview ready. Review the results; no records have been imported.';
  } catch { if (epoch === current) status.textContent = 'The export could not be previewed. Check the file format and try again.'; }
  finally { if (epoch === current) { preview.disabled = false; active = null; } }
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
clear.addEventListener('click', () => { reset(); status.textContent = 'Preview cleared.'; });
window.addEventListener('pagehide', () => { clearTimeout(timer); reset(); session = null; workspace.hidden = true; });
window.addEventListener('pageshow', (event) => { if (event.persisted) leave(); });
void start();
