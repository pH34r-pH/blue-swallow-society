'use strict';

const crypto = require('node:crypto');
const { ABSOLUTE_SECONDS, IDLE_SECONDS, unavailable, denied } = require('./viewer-session');
const PARTITION = 'viewer-v1';
function options() { return { abortSignal: AbortSignal.timeout(5000) }; }
function key(sid) { return crypto.createHash('sha256').update(sid).digest('hex'); }
function expired(row, now) {
  return !Number.isFinite(Date.parse(row.expiresAt)) || !Number.isFinite(Date.parse(row.idleExpiresAt))
    || Date.parse(row.expiresAt) <= now || Date.parse(row.idleExpiresAt) <= now;
}
function createViewerSessionStore({ env = process.env, client } = {}) {
  if (!client) {
    const connection = env.BLUE_SWALLOW_VIEWER_SESSION_STORAGE_CONNECTION_STRING;
    const table = env.BLUE_SWALLOW_VIEWER_SESSION_TABLE || 'viewerSessions';
    if (!connection || !/^[A-Za-z][A-Za-z0-9]{2,62}$/.test(table)) throw unavailable();
    const { TableClient } = require('@azure/data-tables');
    client = TableClient.fromConnectionString(connection, table, { retryOptions: { maxRetries: 1 } });
  }
  async function read(claims, now) {
    let row;
    try { row = await client.getEntity(PARTITION, key(claims.sid), options()); }
    catch (error) { throw error.statusCode === 404 ? denied() : unavailable(); }
    if (row.generation !== claims.generation || expired(row, now)) throw denied();
    return row;
  }
  return {
    async create(settings, now = Date.now()) {
      const sid = crypto.randomBytes(32).toString('hex');
      const row = { partitionKey: PARTITION, rowKey: key(sid), generation: settings.generation,
        expiresAt: new Date(now + ABSOLUTE_SECONDS * 1000).toISOString(),
        idleExpiresAt: new Date(now + IDLE_SECONDS * 1000).toISOString() };
      try { await client.createEntity(row, options()); } catch { throw unavailable(); }
      return { ...row, sid };
    },
    async validate(claims, now = Date.now()) { return { ...await read(claims, now), sid: claims.sid }; },
    async renew(claims, now = Date.now()) {
      const row = await read(claims, now);
      if (!row.etag) throw unavailable();
      const renewed = { partitionKey: PARTITION, rowKey: row.rowKey, generation: row.generation,
        expiresAt: row.expiresAt, idleExpiresAt: new Date(Math.min(Date.parse(row.expiresAt), now + IDLE_SECONDS * 1000)).toISOString() };
      try { await client.updateEntity(renewed, 'Replace', { ...options(), etag: row.etag }); }
      catch (error) {
        if (error.statusCode === 412) return { ...await read(claims, now), sid: claims.sid };
        throw error.statusCode === 404 ? denied() : unavailable();
      }
      return { ...renewed, sid: claims.sid };
    },
    async revoke(claims) {
      try { await client.deleteEntity(PARTITION, key(claims.sid), { ...options(), etag: '*' }); }
      catch (error) { if (error.statusCode !== 404) throw unavailable(); }
    },
    async sweep(now = Date.now(), limit = 200) {
      const bounded = { abortSignal: AbortSignal.timeout(10000) };
      const timestamp = new Date(now).toISOString();
      const pages = client.listEntities({ ...bounded, queryOptions: {
        filter: `PartitionKey eq '${PARTITION}' and (expiresAt le '${timestamp}' or idleExpiresAt le '${timestamp}')`,
      } }).byPage({ maxPageSize: Math.min(limit, 200) });
      const first = await pages.next();
      let removed = 0;
      for (const row of (first.value || []).slice(0, Math.min(limit, 200))) {
        if (bounded.abortSignal.aborted) throw unavailable();
        if (!expired(row, now) || !row.etag) continue;
        try { await client.deleteEntity(PARTITION, row.rowKey, { ...bounded, etag: row.etag }); removed++; }
        catch (error) { if (![404, 412].includes(error.statusCode)) throw unavailable(); }
      }
      return removed;
    },
  };
}
module.exports = { createViewerSessionStore };
