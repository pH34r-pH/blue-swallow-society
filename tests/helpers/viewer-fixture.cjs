const crypto = require('node:crypto');
const { createViewerSessionStore } = require('../../api/_lib/viewer-session-store');
const viewer = require('../../api/_lib/viewer-session');

class SessionTable {
  rows = new Map();
  revision = 0;
  beforeUpdate = null;
  beforeDelete = null;
  fail = false;
  async getEntity(_partition, id) {
    if (this.fail) throw { statusCode: 503 };
    if (!this.rows.has(id)) throw { statusCode: 404 };
    return { ...this.rows.get(id) };
  }
  async createEntity(row) {
    if (this.fail) throw { statusCode: 503 };
    if (this.rows.has(row.rowKey)) throw { statusCode: 409 };
    this.rows.set(row.rowKey, { ...row, etag: String(++this.revision) });
  }
  async updateEntity(row, _mode, { etag }) {
    await this.beforeUpdate?.(row);
    const old = await this.getEntity(row.partitionKey, row.rowKey);
    if (old.etag !== etag) throw { statusCode: 412 };
    this.rows.set(row.rowKey, { ...row, etag: String(++this.revision) });
  }
  async deleteEntity(partition, id, { etag }) {
    await this.beforeDelete?.(id);
    const old = await this.getEntity(partition, id);
    if (etag !== '*' && old.etag !== etag) throw { statusCode: 412 };
    this.rows.delete(id);
  }
  listEntities() {
    const rows = [...this.rows.values()];
    return { byPage: () => ({ async next() { return { value: rows, done: false }; } }) };
  }
}

async function fixture() {
  const password = crypto.randomBytes(24).toString('base64url');
  const env = { BLUE_SWALLOW_AUTH_MODE: 'password', BLUE_SWALLOW_PUBLIC_ORIGIN: 'https://companion.example.test',
    BLUE_SWALLOW_VIEWER_PASSWORD_SCRYPT: await viewer.encodePassword(password),
    BLUE_SWALLOW_VIEWER_SESSION_KEY: crypto.randomBytes(32).toString('base64url'),
    BLUE_SWALLOW_VIEWER_SESSION_EPOCH: 'fixture-1', BSS_WARDRIVER_SYNC_GROUP_ID: 'synthetic-group' };
  const settings = viewer.config(env);
  const table = new SessionTable();
  const store = createViewerSessionStore({ client: table });
  return { password, env, settings, table, store };
}
module.exports = { fixture, SessionTable };
