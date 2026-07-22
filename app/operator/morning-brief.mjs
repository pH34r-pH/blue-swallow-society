const SESSION_KEY = 'blue-swallow-society:operator-session';
const status = document.getElementById('briefStatus');
const runSelect = document.getElementById('briefRunSelect');
const detailNode = document.getElementById('briefDetail');
let selectionNonce = 0;
const activeObjectUrls = new Set();

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

function releasePageUrls() {
  for (const url of activeObjectUrls) URL.revokeObjectURL(url);
  activeObjectUrls.clear();
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
  button.textContent = 'Retrieving…';
  try {
    const blob = await fetchArtifact(brief.run_id, artifact);
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = url;
    download.download = artifactFilename(artifact);
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function appendArtifactControls(detail, brief) {
  const retainedArtifacts = (brief.artifacts || []).filter((artifact) => artifact.media_type !== 'image/png');
  if (!retainedArtifacts.length) return;
  const retained = document.createElement('details');
  retained.className = 'brief-retained';
  const heading = document.createElement('summary');
  heading.textContent = 'Archive materials and provenance';
  const artifacts = document.createElement('div');
  artifacts.className = 'brief-artifacts';
  for (const artifact of retainedArtifacts) {
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

function dossierPages(brief) {
  return (brief.artifacts || [])
    .filter((artifact) => artifact.media_type === 'image/png')
    .sort((left, right) => left.artifact_id.localeCompare(right.artifact_id, undefined, { numeric: true }));
}

function pagePosition(track, direction) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  track.scrollBy({
    left: direction * Math.max(track.clientWidth * 0.88, 1),
    behavior: reducedMotion ? 'auto' : 'smooth',
  });
}

function renderCarousel(detail, brief, nonce) {
  const pages = dossierPages(brief);
  if (!pages.length) return;

  const section = document.createElement('section');
  section.className = 'brief-pages';
  const header = document.createElement('div');
  header.className = 'brief-pages-header';
  const heading = document.createElement('h3');
  heading.textContent = 'Rendered field dossier';
  const count = document.createElement('p');
  count.textContent = `${pages.length} verified image pages`;
  header.append(heading, count);

  const controls = document.createElement('div');
  controls.className = 'brief-carousel-controls';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'brief-carousel-control';
  previous.textContent = '← Previous';
  previous.setAttribute('aria-label', 'Previous dossier page');
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'brief-carousel-control';
  next.textContent = 'Next →';
  next.setAttribute('aria-label', 'Next dossier page');
  controls.append(previous, next);

  const track = document.createElement('div');
  track.className = 'brief-carousel';
  track.tabIndex = 0;
  track.setAttribute('aria-label', `${brief.run_id} rendered dossier pages`);
  previous.addEventListener('click', () => pagePosition(track, -1));
  next.addEventListener('click', () => pagePosition(track, 1));
  track.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      pagePosition(track, -1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      pagePosition(track, 1);
    }
  });

  const loadSlide = async (slide, artifact) => {
    if (slide.dataset.state) return;
    slide.dataset.state = 'loading';
    try {
      const blob = await fetchArtifact(brief.run_id, artifact);
      const url = URL.createObjectURL(blob);
      if (nonce !== selectionNonce || !detail.isConnected) {
        URL.revokeObjectURL(url);
        return;
      }
      activeObjectUrls.add(url);
      const image = document.createElement('img');
      image.alt = `${brief.run_id}, ${artifact.artifact_id}`;
      image.width = 1200;
      image.height = 1500;
      image.decoding = 'async';
      image.src = url;
      slide.prepend(image);
      slide.dataset.state = 'ready';
    } catch (error) {
      if (nonce !== selectionNonce || !detail.isConnected) return;
      const unavailable = document.createElement('p');
      unavailable.className = 'brief-page-error';
      unavailable.textContent = 'Page withheld: artifact could not be verified.';
      slide.append(unavailable);
      slide.dataset.state = 'error';
      console.warn('Morning brief page unavailable', error);
    }
  };

  const slides = [];
  for (const [index, artifact] of pages.entries()) {
    const slide = document.createElement('figure');
    slide.className = 'brief-page';
    slide.dataset.artifactId = artifact.artifact_id;
    const caption = document.createElement('figcaption');
    caption.textContent = `PAGE ${String(index + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')} · ${shortHash(artifact.sha256)}`;
    slide.append(caption);
    track.append(slide);
    slides.push({ slide, artifact });
  }

  section.append(header, controls, track);
  detail.append(section);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const item = slides.find((candidate) => candidate.slide === entry.target);
        if (item) void loadSlide(item.slide, item.artifact);
        observer.unobserve(entry.target);
      }
    }, { root: track, rootMargin: '75% 0px', threshold: 0.01 });
    slides.forEach(({ slide }) => observer.observe(slide));
  } else {
    slides.forEach(({ slide, artifact }) => { void loadSlide(slide, artifact); });
  }
  if (slides[0]) void loadSlide(slides[0].slide, slides[0].artifact);
}

function renderDetail(brief, nonce) {
  detailNode.replaceChildren();
  renderCarousel(detailNode, brief, nonce);

  const context = document.createElement('details');
  context.className = 'brief-context';
  const label = document.createElement('summary');
  label.textContent = 'Archive context';
  const summary = document.createElement('p');
  summary.className = 'brief-summary';
  summary.textContent = brief.summary || 'No operator summary retained.';
  context.append(label, summary);
  detailNode.append(context);
  appendMetadata(detailNode, brief);
  appendArtifactControls(detailNode, brief);
}

async function selectRun(runId) {
  const nonce = ++selectionNonce;
  releasePageUrls();
  detailNode.replaceChildren();
  runSelect.disabled = true;
  status.textContent = `Loading ${runId}…`;
  try {
    const { brief } = await api(`/${encodeURIComponent(runId)}`);
    if (nonce !== selectionNonce) return;
    renderDetail(brief, nonce);
    runSelect.value = runId;
    status.textContent = `Sealed archive · ${brief.artifact_count} retained artifacts`;
  } finally {
    if (nonce === selectionNonce) runSelect.disabled = false;
  }
}

function populateRunSelect(runs) {
  runSelect.replaceChildren();
  for (const run of runs) {
    const option = document.createElement('option');
    option.value = run.run_id;
    option.textContent = `${formatDate(run.generated_at)} · ${run.artifact_count} artifacts`;
    runSelect.append(option);
  }
  runSelect.addEventListener('change', () => selectRun(runSelect.value).catch(showError));
}

async function main() {
  if (!operatorSession()) {
    redirectToLogin();
    return;
  }
  const { runs } = await api();
  if (!runs.length) {
    detailNode.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'brief-empty';
    empty.textContent = 'No validated Field Dossier has been archived yet.';
    detailNode.append(empty);
    runSelect.disabled = true;
    status.textContent = 'Archive ready; no validated packet retained.';
    return;
  }
  populateRunSelect(runs);
  await selectRun(runs[0].run_id);
}

function showError(error) {
  console.warn('Morning brief archive unavailable', error);
  releasePageUrls();
  runSelect.disabled = false;
  status.textContent = 'Archive unavailable; operator session or backend may have expired.';
  detailNode.replaceChildren();
  const unavailable = document.createElement('p');
  unavailable.className = 'brief-empty';
  unavailable.textContent = 'The archive did not return a readable packet.';
  detailNode.append(unavailable);
}

window.addEventListener('pagehide', releasePageUrls, { once: true });
main().catch(showError);
