const RECEIPT_V1_FIELDS = Object.freeze([
  'schema_version',
  'server_batch_id',
  'idempotency_key',
  'status',
  'accepted_count',
  'rejected_count',
  'duplicate_count',
  'validation_errors',
  'server_clock',
]);
const RFC3339_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Validate the complete durable v1 receipt returned for the controlled proof
 * batch. This is deliberately a closed schema: a later receipt version needs
 * an explicit verifier change rather than silently widening proof semantics.
 */
export function assertAppliedReceiptV1(receipt, { idempotencyKey, acceptedCount }) {
  requirePlainObject(receipt, 'Receipt must be a JSON object');
  assertExactFieldSet(receipt);
  require(receipt.schema_version === 'bss.sync_receipt.v1', 'Receipt schema is invalid');
  require(UUID.test(receipt.server_batch_id), 'Receipt server batch ID is invalid');
  require(receipt.idempotency_key === idempotencyKey, 'Receipt idempotency key does not bind the batch');
  require(receipt.status === 'applied', 'Receipt does not prove durable application');
  requireSafeInteger(receipt.accepted_count, acceptedCount, 'Receipt accepted count is invalid');
  requireSafeInteger(receipt.rejected_count, 0, 'Receipt rejected count is invalid');
  requireSafeInteger(receipt.duplicate_count, 0, 'Receipt duplicate count is invalid');
  require(Array.isArray(receipt.validation_errors) && receipt.validation_errors.length === 0,
    'Receipt contains validation errors');
  requireRfc3339Timestamp(receipt.server_clock, 'Receipt server clock is invalid');
}

/** Require that replay preserves every v1 receipt semantic, independent of key order. */
export function assertExactReceiptReplayV1(firstReceipt, replayReceipt) {
  const first = canonicalJson(firstReceipt);
  const replay = canonicalJson(replayReceipt);
  require(first === replay, 'Replay receipt changed durable receipt semantics');
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalizeJson(value));
}

function assertExactFieldSet(receipt) {
  const actual = Object.keys(receipt).sort();
  const expected = [...RECEIPT_V1_FIELDS].sort();
  require(actual.length === expected.length && actual.every((field, index) => field === expected[index]),
    'Receipt has a missing or unsupported durable field');
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeJson(value[key])]));
  }
  return value;
}

function requirePlainObject(value, message) {
  require(isPlainObject(value), message);
}

function requireBoundedString(value, message) {
  require(typeof value === 'string' && value.length > 0 && value.length <= 200, message);
}

function requireSafeInteger(value, expected, message) {
  require(Number.isSafeInteger(value) && value === expected, message);
}

function requireRfc3339Timestamp(value, message) {
  require(typeof value === 'string' && RFC3339_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)), message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function require(value, message) {
  if (!value) throw new Error(message);
}
