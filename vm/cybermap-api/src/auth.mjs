import { createHash, timingSafeEqual } from 'node:crypto';

export class IngestError extends Error {
  constructor(code, message = code, { statusCode = 400, publicCode = code } = {}) {
    super(message);
    this.name = 'IngestError';
    this.code = code;
    this.publicCode = publicCode;
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

const MTLS_REJECTION_REASONS = new Set([
  'binding_absent',
  'binding_ambiguous',
  'credential_disabled',
  'credential_expired',
  'required_scope_missing',
  'source_disabled',
  'provenance_mismatch',
  'policy_mismatch',
]);

/** Returns one fixed server-only mTLS rejection reason, or null for untrusted input. */
export function boundedMtlsRejectionReason(value) {
  return typeof value === 'string' && MTLS_REJECTION_REASONS.has(value) ? value : null;
}

/** Creates a generic forbidden error with a non-enumerable, fixed server-only mTLS reason. */
export function forbiddenWithMtlsRejectionReason(reason) {
  const boundedReason = boundedMtlsRejectionReason(reason);
  if (!boundedReason) throw new TypeError('A fixed mTLS rejection reason is required.');
  const error = forbidden();
  Object.defineProperty(error, 'mtlsRejectionReason', { value: boundedReason });
  return error;
}
