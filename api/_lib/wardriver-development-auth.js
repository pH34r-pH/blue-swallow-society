'use strict';

const crypto = require('node:crypto');

const MAX_READERS = 16;
const DIGEST = /^[a-f0-9]{64}$/;

function configuredDigests(env) {
  const digests = [];
  const owner = env.BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_SHA256;
  if (owner !== undefined && owner !== '') {
    if (typeof owner !== 'string' || !DIGEST.test(owner)) throw new Error('invalid_reader_configuration');
    digests.push(owner);
  }
  const readers = env.BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_HASHES;
  if (readers !== undefined && readers !== '') {
    if (typeof readers !== 'string' || readers.length > 4096) throw new Error('invalid_reader_configuration');
    const value = JSON.parse(readers);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_reader_configuration');
    const entries = Object.entries(value);
    if (entries.length > MAX_READERS) throw new Error('invalid_reader_configuration');
    for (const [id, digest] of entries) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || typeof digest !== 'string' || !DIGEST.test(digest)) {
        throw new Error('invalid_reader_configuration');
      }
      digests.push(digest);
    }
  }
  if (digests.length === 0 || digests.length > MAX_READERS) throw new Error('invalid_reader_configuration');
  return digests.map((digest) => Buffer.from(digest, 'hex'));
}

function authorizationHeader(req) {
  const headers = req?.headers;
  if (typeof headers?.get === 'function') return headers.get('authorization');
  const entries = Object.entries(headers || {}).filter(([name]) => name.toLowerCase() === 'authorization');
  return entries.length === 1 && typeof entries[0][1] === 'string' ? entries[0][1] : '';
}

function verifyDevelopmentReader(req, env = process.env) {
  let digests;
  try {
    digests = configuredDigests(env);
  } catch {
    return { ok: false, status: 503, error: 'Development updates are unavailable.' };
  }
  const token = String(authorizationHeader(req) || '').match(/^Bearer ([A-Za-z0-9_-]{43,128})$/i)?.[1];
  if (!token) return { ok: false, status: 401, error: 'Development update reader required.' };
  const actual = crypto.createHash('sha256').update(token, 'utf8').digest();
  let matched = 0;
  for (const expected of digests) matched |= Number(crypto.timingSafeEqual(actual, expected));
  return matched ? { ok: true } : { ok: false, status: 401, error: 'Development update reader required.' };
}

module.exports = { verifyDevelopmentReader };
