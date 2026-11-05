'use strict';

const { verifyDevelopmentReader } = require('../_lib/wardriver-development-auth');
const { createDevelopmentStore, validateManifest } = require('../_lib/wardriver-development-store');

const ROUTE = '/api/wardriver-development';
const PRIVATE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  Vary: 'Authorization',
});

function response(status, body, method, headers = {}) {
  return {
    status,
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers },
    body: method === 'HEAD' ? undefined : body,
  };
}

function parseArtifact(value) {
  if (value === undefined || value === '' || value === 'index.html') return { index: true };
  if (value === 'current.json') return { current: true };
  if (typeof value !== 'string' || value.length > 220) return null;
  const match = value.match(/^([1-9][0-9]{0,9})\/([a-f0-9]{40})\/([a-z0-9_.-]{1,100})$/);
  if (!match || Number(match[1]) > 2100000000) return null;
  const [fileName, versionCode, sourceCommit] = [match[3], Number(match[1]), match[2]];
  if (fileName !== 'release.json' && fileName !== `wardriver-vnext-${versionCode}.apk`
    && !/^[a-z][a-z0-9_]{0,63}\.fap$/.test(fileName)) return null;
  return { versionCode, sourceCommit, fileName };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function releaseIndex(release) {
  const base = `${ROUTE}/${release.versionCode}/${release.sourceCommit}`;
  const extensions = release.extensions.map((extension) =>
    `<li><a href="${base}/${extension.fileName}">${escapeHtml(extension.name)} ${escapeHtml(extension.version)} (.fap)</a></li>`).join('\n');
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>Wardriver development updates</title></head><body>'
    + `<h1>Wardriver ${escapeHtml(release.versionName)}</h1>`
    + `<p>Android version code: <span id="version-code">${release.versionCode}</span></p>`
    + `<p><a href="${base}/${release.apk.fileName}">Download Wardriver APK</a></p>`
    + `<ul>${extensions}</ul>`
    + `<p><a href="${base}/release.json">Release receipt</a></p>`
    + '<p>The APK includes the Flipper extension for installation through Wardriver over Bluetooth.</p>'
    + '</body></html>\n';
}

async function deliverAuthorized(requested, method, env, store) {
  const release = validateManifest(await store.getRelease(requested.index || requested.current ? undefined : requested),
    env.BSS_WARDRIVER_DEVELOPMENT_SIGNER_SHA256);
  if (!requested.index && !requested.current && (release.versionCode !== requested.versionCode || release.sourceCommit !== requested.sourceCommit)) {
    throw new Error('release_identity_mismatch');
  }
  if (requested.current) return response(200, release, method);
  if (requested.index) {
    return response(200, releaseIndex(release), method, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
  }
  if (requested.fileName === 'release.json') return response(200, release, method);
  if (![release.apk, ...release.extensions].some((entry) => entry.fileName === requested.fileName)) {
    return response(404, { ok: false, error: 'Unknown development artifact.' }, method);
  }
  const location = await store.createDownloadUrl(release, requested.fileName);
  return response(302, undefined, method, { Location: location });
}

async function handle(context, req, { env = process.env, createStore = createDevelopmentStore } = {}) {
  const method = String(req?.method || 'GET').toUpperCase();
  const auth = verifyDevelopmentReader(req, env);
  if (!auth.ok) {
    context.res = response(auth.status, { ok: false, error: auth.error }, method,
      auth.status === 401 ? { 'WWW-Authenticate': 'Bearer realm="wardriver-development"' } : {});
    return;
  }
  if (!['GET', 'HEAD'].includes(method)) {
    context.res = response(405, { ok: false, error: 'Method not allowed.' }, method, { Allow: 'GET, HEAD' });
    return;
  }
  const requested = parseArtifact(req?.params?.artifact);
  if (!requested) {
    context.res = response(404, { ok: false, error: 'Unknown development artifact.' }, method);
    return;
  }
  try {
    context.res = await deliverAuthorized(requested, method, env, createStore({ env }));
  } catch {
    context.log?.error?.('Wardriver development delivery failed.');
    context.res = response(503, { ok: false, error: 'Development updates are unavailable.' }, method);
  }
}

module.exports = (context, req) => handle(context, req);
module.exports._internals = { handle };
