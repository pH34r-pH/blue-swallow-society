const SESSION_KEY = 'blue-swallow-society:operator-session';
const status = document.getElementById('briefStatus');
const runsNode = document.getElementById('briefRuns');
const detailNode = document.getElementById('briefDetail');
let selectionNonce = 0;

function operatorSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (!session?.token || !session?.expiresAt || Date.parse(session.expiresAt) <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function operatorHeaders() {
  const session = operatorSession();
  return session ? {
    Authorization: `Bearer ${session.token}`,
    'X-Blue-Swallow-Operator-Token': session.token,
  } : {};
}

function redirectToLogin() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* no-op */ }
  window.location.replace('/');
}

async function api(path = '') {
  const response = await fetch(`/api/morning-brief${path}`, {
    headers: operatorHeaders(),
    credentials: 'same-origin',
  });
  if (response.status === 403) redirectToLogin();
  if (!response.ok) throw new Error(`Archive returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.ok !== true) throw new Error(payload?.error || 'Archive returned an invalid response.');
  return payload;
}

function formatDate(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown timestamp';
}

function shortHash(value) { return typeof value === 'string' ? `${value.slice(0, 12)}…` : 'unavailable'; }

function artifactHref(runId, artifactId) {
  return `/api/morning-brief/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`;
}

function artifactFilename(artifact) {
  if (artifact.media_type === 'image/png') return `${artifact.artifact_id}.png`;
  if (artifact.media_type.includes('json')) return `${artifact.artifact_id}.json`;
  if (artifact.media_type.includes('markdown') || artifact.media_type.includes('text/plain')) return `${artifact.artifact_id}.md`;
  return artifact.artifact_id;
}

async function fetchArtifact(runId, artifact) {
  const response = await fetch(artifactHref(runId, artifact.artifact_id), {
    headers: operatorHeaders(),
    credentials: 'same-origin',
  });
  if (response.status === 403) redirectToLogin();
  if (!response.ok) throw new Error(`${artifact.artifact_id} returned HTTP ${response.status}`);
  const receivedHash = response.headers.get('x-blue-swallow-artifact-sha256');
  if (receivedHash && receivedHash !== artifact.sha256) throw new Error(`${artifact.artifact_id} failed archive hash verification`);
  return response.blob();
}

function appendMetadata(detail, brief) {
  const meta = document.createElement('dl');
  meta.className = 'brief-meta';
  const rows = [
    ['generated', formatDate(brief.generated_at)],
    ['archived', formatDate(brief.archived_at)],
    ['canonical hash', shortHash(brief.canonical_state_hash)],
    ['package hash', shortHash(brief.package_sha256)],
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    meta.append(dt, dd);
  }
  detail.append(meta);
}

async function downloadArtifact(brief, artifact, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Decrypting…';
  try {
    const blob = await fetchArtifact(brief.run_id, artifact);
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = url;
    download.download = artifactFilename(artifact);
    download.click();
    URL.revokeObjectURL(url);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function appendArtifactControls(detail, brief) {
  const retained = document.createElement('section');
  retained.className = 'brief-retained';
  const heading = document.createElement('h3');
  heading.textContent = 'Retained source artifacts';
  const artifacts = document.createElement('div');
  artifacts.className = 'brief-artifacts';
  for (const artifact of brief.artifacts || []) {
    if (artifact.media_type === 'image/png') continue;
    const item = document.createElement('div');
    item.className = 'brief-artifact';
    const label = document.createElement('strong');
    label.textContent = artifact.artifact_id;
    const note = document.createElement('small');
    note.textContent = `${artifact.media_type} · ${shortHash(artifact.sha256)}`;
    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'brief-artifact-download';
    download.textContent = 'Retrieve';
    download.addEventListener('click', () => downloadArtifact(brief, artifact, download).catch(showError));
    item.append(label, note, download);
    artifacts.append(item);
  }
  retained.append(heading, artifacts);
  detail.append(retained);
}

async function appendFieldPages(detail, brief, nonce) {
  const pages = (brief.artifacts || []).filter((artifact) => artifact.media_type === 'image/png' && /^page-\d+$/.test(artifact.artifact_id));
  if (!pages.length) return;
  const gallery = document.createElement('section');
  gallery.className = 'brief-pages';
  const heading = document.createElement('h3');
  heading.textContent = 'Field dossier pages';
  gallery.append(heading);
  detail.append(gallery);
  for (const artifact of pages) {
    const card = document.createElement('figure');
    card.className = 'brief-page';
    const caption = document.createElement('figcaption');
    caption.textContent = `// ${artifact.artifact_id} · ${shortHash(artifact.sha256)}`;
    card.append(caption);
    gallery.append(card);
    try {
      const blob = await fetchArtifact(brief.run_id, artifact);
      if (nonce !== selectionNonce || !detail.isConnected) return;
      const image = document.createElement('img');
      image.alt = `${brief.run_id} ${artifact.artifact_id}`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = URL.createObjectURL(blob);
      image.addEventListener('load', () => URL.revokeObjectURL(image.src), { once: true });
      card.prepend(image);
    } catch (error) {
      if (nonce !== selectionNonce) return;
      const unavailable = document.createElement('p');
      unavailable.className = 'brief-page-error';
      unavailable.textContent = 'Page withheld: artifact could not be verified.';
      card.append(unavailable);
      console.warn('Morning brief page unavailable', error);
    }
  }
}

function renderDetail(brief, nonce) {
  detailNode.replaceChildren();
  const title = document.createElement('h2');
  title.textContent = brief.run_id;
  const summary = document.createElement('p');
  summary.className = 'brief-summary';
  summary.textContent = brief.summary || 'No operator summary retained.';
  detailNode.append(title, summary);
  appendMetadata(detailNode, brief);
  appendArtifactControls(detailNode, brief);
  appendFieldPages(detailNode, brief, nonce);
}

async function selectRun(runId) {
  const nonce = ++selectionNonce;
  status.textContent = `Loading ${runId}…`;
  const { brief } = await api(`/${encodeURIComponent(runId)}`);
  if (nonce !== selectionNonce) return;
  renderDetail(brief, nonce);
  for (const node of runsNode.querySelectorAll('button')) node.setAttribute('aria-current', String(node.dataset.runId === runId));
  status.textContent = `Sealed archive · ${brief.artifact_count} retained artifacts`;
}

function appendRun(run) {
  const button = document.createElement('button');
  button.className = 'brief-run';
  button.type = 'button';
  button.dataset.runId = run.run_id;
  const name = document.createElement('strong');
  const time = document.createElement('time');
  const metadata = document.createElement('small');
  name.textContent = run.run_id;
  time.textContent = formatDate(run.generated_at);
  metadata.textContent = `${run.artifact_count} artifacts · ${shortHash(run.package_sha256)}`;
  button.append(name, time, metadata);
  button.addEventListener('click', () => selectRun(run.run_id).catch(showError));
  runsNode.append(button);
}

async function main() {
  if (!operatorSession()) {
    redirectToLogin();
    return;
  }
  const { runs } = await api();
  runsNode.replaceChildren();
  if (!runs.length) {
    detailNode.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'brief-empty';
    empty.textContent = 'No validated Field Dossier has been archived yet.';
    detailNode.append(empty);
    status.textContent = 'Archive ready; no validated packet retained.';
    return;
  }
  runs.forEach(appendRun);
  await selectRun(runs[0].run_id);
}

function showError(error) {
  console.warn('Morning brief archive unavailable', error);
  status.textContent = 'Archive unavailable; operator session or backend may have expired.';
  detailNode.replaceChildren();
  const unavailable = document.createElement('p');
  unavailable.className = 'brief-empty';
  unavailable.textContent = 'The archive did not return a readable packet.';
  detailNode.append(unavailable);
}

main().catch(showError);
