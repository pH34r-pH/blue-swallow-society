'use strict';
const { createHash, createHmac } = require('node:crypto');
const { validateSnapshot } = require('./bird-snapshot-store');
const { projectPublicJournal } = require('../bird-journal');
const hash = (value) => createHash('sha256').update(value).digest('hex');
function fail() { throw new Error('invalid_bird_publication'); }
function sightingId(key, secret) { return `sighting-${createHmac('sha256', secret).update(`bird-public-v1:${key}`).digest('hex')}`; }
function publishedRecord(row, place, secret) {
  if (row.countKind === 'unknown') fail();
  return { published: true, id: sightingId(row.provisionalKey, secret), speciesId: `taxon-${hash(row.scientificName.toLowerCase()).slice(0, 32)}`,
    commonName: row.commonName, scientificName: row.scientificName, observedOn: row.observedOn,
    count: row.countKind === 'exact' ? row.count : null, source: 'eBird', place };
}
function cleanExisting(value) {
  const projected = projectPublicJournal(value);
  if (projected.posts.length !== value.posts.length || projected.sightings.length !== value.sightings.length) fail();
  const posts = projected.posts.map((row) => ({ ...row, published: true }));
  const sightings = projected.sightings.map((row) => ({ ...row, published: true }));
  if (new Set(sightings.map((row) => row.id)).size !== sightings.length) fail();
  return { posts, sightings };
}
function validPublish(item) {
  return item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 2
    && typeof item.key === 'string' && /^[a-f0-9]{64}$/.test(item.key)
    && typeof item.place === 'string' && item.place.length <= 120 && item.place.trim() === item.place
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(item.place);
}
function validateActions(actions) {
  if (!actions || !Array.isArray(actions.publish) || !Array.isArray(actions.unpublish)
    || actions.publish.length + actions.unpublish.length < 1 || actions.publish.length + actions.unpublish.length > 1000) fail();
  const keys = new Set();
  for (const item of actions.publish) {
    if (!validPublish(item) || keys.has(item.key)) fail();
    keys.add(item.key);
  }
  for (const key of actions.unpublish) {
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key) || keys.has(key)) fail();
    keys.add(key);
  }
}
function planBirdPublication(snapshot, current, actions, { secret, now = new Date() } = {}) {
  validateSnapshot(snapshot); validateActions(actions);
  if (!(secret instanceof Uint8Array) || secret.length < 32 || secret.length > 128
    || !(now instanceof Date) || !Number.isFinite(now.getTime())) fail();
  const clean = cleanExisting(current), drafts = new Map(snapshot.records.map((row) => [row.provisionalKey, row]));
  const sightings = new Map(clean.sightings.map((row) => [row.id, row]));
  for (const item of actions.publish) {
    const row = drafts.get(item.key); if (!row) fail();
    sightings.set(sightingId(item.key, secret), publishedRecord(row, item.place, secret));
  }
  for (const key of actions.unpublish) if (!sightings.delete(sightingId(key, secret))) fail();
  if (sightings.size > 10000) fail();
  return { version: 1, draftRevision: snapshot.revision, requiresReview: true, writes: false,
    publication: { version: 1, updatedAt: now.toISOString(), posts: clean.posts, sightings: [...sightings.values()] },
    summary: { publish: actions.publish.length, unpublish: actions.unpublish.length } };
}
module.exports = { planBirdPublication };
