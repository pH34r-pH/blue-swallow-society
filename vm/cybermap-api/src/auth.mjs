import { createHash, timingSafeEqual } from 'node:crypto';

export class IngestError extends Error {
  constructor(code, message = code, { statusCode = 400 } = {}) {
    super(message);
    this.name = 'IngestError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function hashToken(token) {
  return createHash('sha256').update(String(token ?? ''), 'utf8').digest('hex');
}

export function tokenDigestMatches(candidateToken, expectedHexDigest) {
  if (typeof expectedHexDigest !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedHexDigest)) return false;
  const candidate = Buffer.from(hashToken(candidateToken), 'hex');
  const expected = Buffer.from(expectedHexDigest, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function forbidden() {
  return new IngestError('forbidden', 'Forbidden.', { statusCode: 403 });
}
