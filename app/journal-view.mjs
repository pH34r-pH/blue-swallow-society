function node(tag, text = '', className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}
function link(text, href, className = 'text-link') {
  const element = node('a', text, className); element.href = href; return element;
}
function empty(root, title, description) {
  const box = node('div', '', 'empty-journal');
  const icon = node('span', '⌁', 'empty-icon'); icon.setAttribute('aria-hidden', 'true');
  const copy = node('div'); copy.append(node('h3', title), node('p', description));
  box.append(icon, copy); root.append(box);
}
function date(value) {
  return value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)) : '';
}
function renderPosts(root, posts) {
  const grid = node('div', '', 'entry-grid');
  for (const post of posts) {
    const card = node('article', '', 'entry-card');
    card.append(node('div', [date(post.observedOn || post.publishedOn), post.place].filter(Boolean).join(' · '), 'entry-meta'),
      node('h3', post.title), node('p', post.summary), link('Read field note ↗', '/journal/' + post.id));
    grid.append(card);
  }
  root.append(grid);
}
function renderPost(root, post) {
  if (!post) { empty(root, 'Entry not found', 'This field note is not currently published.'); return; }
  const article = node('article', '', 'journal-post');
  article.append(link('← Back to archive', '/archive'), node('h2', post.title));
  article.append(node('p', 'Observed ' + date(post.observedOn) + ' · Published ' + date(post.publishedOn), 'entry-meta'));
  if (post.place) article.append(node('p', post.place, 'entry-meta'));
  for (const paragraph of post.paragraphs) article.append(node('p', paragraph));
  root.append(article);
  document.title = post.title + ' — Blue Swallow Society';
}
function renderSightings(root, sightings) {
  const list = node('ul', '', 'sighting-list');
  for (const sighting of sightings.slice(0, 50)) {
    const item = node('li');
    item.append(node('span', [date(sighting.observedOn), sighting.place, sighting.source].filter(Boolean).join(' · ')),
      node('span', sighting.count === null ? 'Present' : String(sighting.count)));
    list.append(item);
  }
  root.append(list);
  if (sightings.length > 50) root.append(node('p', 'Showing the latest 50 published observations.', 'muted'));
}
function renderSpecies(root, sightings, selected) {
  const groups = Map.groupBy(sightings, (sighting) => sighting.speciesId);
  if (selected) {
    const entries = groups.get(selected);
    if (!entries) { empty(root, 'Species not found', 'There are no published observations for this species.'); return; }
    root.append(link('← Species index', '/species'), node('h2', entries[0].commonName), node('p', entries[0].scientificName, 'muted'));
    renderSightings(root, entries);
    return;
  }
  if (!groups.size) { empty(root, 'A life list, one encounter at a time.', 'Published sightings will appear here. No personal history has been published yet.'); return; }
  root.append(node('p', groups.size + ' species in the published history. This is not a complete account life list.', 'muted'));
  const list = node('div', '', 'species-list');
  for (const [id, entries] of [...groups].sort((a, b) => a[1][0].commonName.localeCompare(b[1][0].commonName))) {
    const item = link('', '/species/' + id, '');
    item.append(node('strong', entries[0].commonName), node('span', entries[0].scientificName),
      node('span', entries.length + ' published observations'));
    list.append(item);
  }
  root.append(list);
}
function renderArchive(root, posts) {
  const params = new URLSearchParams(location.search);
  const form = node('form', '', 'public-toolbar'); form.action = '/archive';
  for (const [name, label, type] of [['q', 'Search field notes', 'search'], ['date', 'Observation date', 'date']]) {
    const field = node('label', label); const input = node('input');
    input.name = name; input.type = type; input.value = params.get(name) || '';
    field.append(input); form.append(field);
  }
  const button = node('button', 'Filter', 'quiet-button'); form.append(button); root.append(form);
  const query = (params.get('q') || '').toLowerCase();
  const matches = posts.filter((post) => (!params.get('date') || post.observedOn === params.get('date'))
    && [post.title, post.summary, post.place].join(' ').toLowerCase().includes(query));
  if (!matches.length) { empty(root, posts.length ? 'No matching entries' : 'The notebook is open.', posts.length ? 'Try a different date or search.' : 'Field notes will appear here when they are ready to share.'); return; }
  const pages = Math.ceil(matches.length / 9);
  const page = Math.min(pages, Math.max(1, Number.parseInt(params.get('page'), 10) || 1));
  renderPosts(root, matches.slice((page - 1) * 9, page * 9));
  const pager = node('nav', '', 'pager'); pager.setAttribute('aria-label', 'Archive pages');
  for (const [label, next] of [['← Previous', page - 1], ['Next →', page + 1]]) {
    if (next < 1 || next > pages) continue;
    const nextParams = new URLSearchParams(params); nextParams.set('page', next);
    pager.append(link(label, '/archive?' + nextParams));
  }
  pager.append(node('span', 'Page ' + page + ' of ' + pages)); root.append(pager);
}
function renderAbout(root) {
  const article = node('article', '', 'journal-post');
  article.append(node('h2', 'For the love of looking closer.'),
    node('p', 'Blue Swallow Society is a personal birdwatching journal: a place for field notes and selected sightings, from familiar paths to unexpected encounters.'),
    node('p', 'A sighting records what was observed, not a promise of what will be there tomorrow. Observation dates and publication dates are shown separately. Presence-only records are marked “Present”, rather than counted as a single bird.'),
    node('p', 'Only selected, approved entries are public. Locations may be generalized to protect wildlife and personal privacy. The published species index describes this journal’s coverage, not a complete eBird or Merlin life list.'),
    node('p', 'The swallow study on the home page is an original illustration. It is not a photograph or a record of an observed bird.'));
  root.append(article);
}
export async function renderJournal() {
  const parts = location.pathname.split('/').filter(Boolean);
  const view = ['archive', 'species', 'about', 'journal'].includes(parts[0]) ? parts[0] : 'journal';
  document.body.dataset.publicView = view;
  const titles = { journal: 'Recent field notes', archive: 'The field-note archive', species: 'Birds along the way', about: 'About the journal' };
  document.getElementById('notesTitle').textContent = titles[view];
  document.querySelector('[data-public-nav="' + view + '"]')?.setAttribute('aria-current', 'page');
  const root = document.getElementById('journalView'); root.replaceChildren();
  if (view === 'about') { renderAbout(root); return; }
  try {
    const response = await fetch('/api/bird-journal', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('unavailable');
    const data = await response.json();
    if (view === 'archive') renderArchive(root, data.posts);
    else if (view === 'species') renderSpecies(root, data.sightings, parts[1]);
    else if (parts[1]) renderPost(root, data.posts.find((post) => post.id === parts[1]));
    else if (data.posts.length) renderPosts(root, data.posts.slice(0, 3));
    else empty(root, 'The notebook is open.', 'There are no published field notes yet. A little patience, a pair of binoculars, and a good reason to head outside.');
  } catch { empty(root, 'The journal is taking a moment.', 'Published entries are temporarily unavailable. Please visit again soon.'); }
}
