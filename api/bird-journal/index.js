'use strict';
const { readFile, stat } = require('node:fs/promises');
const path = require('node:path');
const text = (value, max) => typeof value === 'string' && value.length <= max ? value : '';
const slug = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value || '') && value.length <= 100 ? value : '';
async function readPublishedFile() {
  const file = path.join(__dirname, '../_private/birding/published.json');
  if ((await stat(file)).size > 4 * 1024 * 1024) throw new Error('publication_too_large');
  return JSON.parse(await readFile(file, 'utf8'));
}
function day(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(Date.parse(value))) return '';
  return new Date(value).toISOString().slice(0, 10) === value ? value : '';
}
function publicPost(row) {
  if (row?.published !== true) return null;
  const post = { id: slug(row.id), title: text(row.title, 180), observedOn: day(row.observedOn),
    publishedOn: day(row.publishedOn), place: text(row.place, 120), summary: text(row.summary, 500),
    paragraphs: Array.isArray(row.paragraphs) ? row.paragraphs.slice(0, 100).map((p) => text(p, 4000)).filter(Boolean) : [] };
  return post.id && post.title && post.publishedOn ? post : null;
}
function publicSighting(row) {
  if (row?.published !== true) return null;
  const sighting = { id: slug(row.id), speciesId: slug(row.speciesId), commonName: text(row.commonName, 120),
    scientificName: text(row.scientificName, 160), observedOn: day(row.observedOn), place: text(row.place, 120),
    count: Number.isSafeInteger(row.count) && row.count > 0 ? row.count : null,
    source: ['eBird', 'Merlin', 'Field note'].includes(row.source) ? row.source : 'Field note' };
  return sighting.id && sighting.speciesId && sighting.commonName && sighting.observedOn ? sighting : null;
}
function projectPublicJournal(value) {
  if (value?.version !== 1 || !Array.isArray(value.posts) || !Array.isArray(value.sightings)
    || value.posts.length > 2000 || value.sightings.length > 10000) throw new Error('invalid_publication');
  const updatedAt = typeof value.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(value.updatedAt)
    && Number.isFinite(Date.parse(value.updatedAt)) ? value.updatedAt : null;
  return { version: 1, updatedAt,
    posts: value.posts.map(publicPost).filter(Boolean).sort((a, b) => b.publishedOn.localeCompare(a.publishedOn)),
    sightings: value.sightings.map(publicSighting).filter(Boolean).sort((a, b) => b.observedOn.localeCompare(a.observedOn)) };
}
function createBirdJournalHandler({ readPublication = readPublishedFile } = {}) {
  return async (context, req) => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (!['GET', 'HEAD'].includes(req.method)) { context.res = { status: 405, headers, body: { error: 'method_not_allowed' } }; return; }
    try {
      const publication = projectPublicJournal(await readPublication());
      context.res = { status: 200, headers, body: req.method === 'HEAD' ? undefined : publication };
    }
    catch { context.res = { status: 503, headers, body: req.method === 'HEAD' ? undefined : { error: 'journal_unavailable' } }; }
  };
}
module.exports = createBirdJournalHandler();
module.exports.createBirdJournalHandler = createBirdJournalHandler;
module.exports.projectPublicJournal = projectPublicJournal;
