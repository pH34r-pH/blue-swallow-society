import crypto from 'node:crypto';

export class ContractError extends Error {
  constructor(code, message = code, { statusCode = 422, path = null } = {}) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
    this.statusCode = statusCode;
    this.path = path;
  }
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const RELEASE_ID_RE = /^[a-z][a-z0-9-]{2,119}$/;
const MODEL_ID_RE = /^[a-z][a-z0-9-]{2,79}$/;
const IDENTIFIER_RE = /^[a-z][a-z0-9-]{2,119}$/;
const FEEDBACK_REASONS = new Set([
  'generally_good', 'missed_target', 'wrong_label', 'false_positive', 'poor_box',
  'unstable_detection', 'slow_inference', 'load_failure', 'other',
]);
const VERDICTS = new Set(['good', 'bad', 'uncertain']);
const REQUIRED_RELEASE_KEYS = new Set([
  'schema_version', 'release_id', 'model_id', 'channel', 'state', 'published_at', 'approved_at',
  'manifest', 'artifact', 'tensor_contract', 'compatibility', 'provenance', 'artifact_bytes', 'revoked_at',
]);
const REQUIRED_FEEDBACK_KEYS = new Set([
  'schema_version', 'feedback_id', 'release_id', 'artifact_sha256', 'verdict', 'reason_codes', 'note',
  'app_version', 'runtime_id', 'runtime_version', 'capture_reference', 'submitted_at',
]);

export function validateModelCatalogRequest(value) {
  const invalid = () => { throw invalidCatalogRequest(); };
  if (!isPlainObject(value) || !hasOnlyKeys(value, new Set([
    'schema_version', 'app_version', 'runtime_id', 'runtime_version', 'decoder_profiles',
  ]))) invalid();
  if (value.schema_version !== 'bss.raid.model_catalog_request.v1'
      || !isVersion(value.app_version)
      || value.runtime_id !== 'litert'
      || !isVersion(value.runtime_version)
      || !Array.isArray(value.decoder_profiles)
      || value.decoder_profiles.length < 1
      || value.decoder_profiles.length > 8
      || new Set(value.decoder_profiles).size !== value.decoder_profiles.length
      || !value.decoder_profiles.every((profile) => typeof profile === 'string' && /^[a-z][a-z0-9_]{2,63}$/.test(profile))) invalid();
  return {
    schema_version: value.schema_version,
    app_version: value.app_version,
    runtime_id: value.runtime_id,
    runtime_version: value.runtime_version,
    decoder_profiles: [...value.decoder_profiles],
  };
}

const MAX_ARTIFACT_MANIFEST_HEADER_BYTES = 8 * 1024;

export function validateModelRelease(value) {
  const invalid = () => { throw invalidModelRelease(); };
  if (!isPlainObject(value) || !hasOnlyKeys(value, REQUIRED_RELEASE_KEYS)) invalid();
  if (value.schema_version !== 'bss.raid.model_release.v1'
      || !RELEASE_ID_RE.test(value.release_id || '')
      || !MODEL_ID_RE.test(value.model_id || '')
      || value.channel !== 'field'
      || !['trained', 'evaluation_passed', 'awaiting_approval', 'approved', 'published'].includes(value.state)
      || !isRfc3339(value.approved_at)
      || !isRfc3339(value.published_at)
      || (value.revoked_at !== undefined && value.revoked_at !== null && !isRfc3339(value.revoked_at))
      || !isPlainObject(value.manifest)
      || value.manifest.schema_version !== 'bss.raid.model_manifest.v1'
      || !isSha256(value.manifest.sha256)
      || !isPlainObject(value.manifest.signature)
      || value.manifest.signature.algorithm !== 'ecdsa-p256-sha256'
      || !IDENTIFIER_RE.test(value.manifest.signature.key_id || '')
      || !isBase64(value.manifest.signature.value)
      || !isPlainObject(value.artifact)
      || value.artifact.media_type !== 'application/vnd.tensorflow.lite'
      || !isSha256(value.artifact.sha256)
      || !isPositiveInteger(value.artifact.size_bytes, 128 * 1024 * 1024)
      || !isPlainObject(value.tensor_contract)
      || value.tensor_contract.runtime_id !== 'litert'
      || !isTensorInput(value.tensor_contract.input)
      || !Array.isArray(value.tensor_contract.outputs)
      || value.tensor_contract.outputs.length === 0
      || value.tensor_contract.outputs.length > 8
      || !value.tensor_contract.outputs.every((output) => typeof output === 'string' && /^[a-z][a-z0-9_]{1,63}$/.test(output))
      || !/^[a-z][a-z0-9_]{2,63}$/.test(value.tensor_contract.decoder_profile || '')
      || !Array.isArray(value.tensor_contract.labels)
      || value.tensor_contract.labels.length === 0
      || value.tensor_contract.labels.length > 1000
      || !value.tensor_contract.labels.every((label) => typeof label === 'string' && label.trim().length > 0 && label.length <= 160)
      || !isPlainObject(value.compatibility)
      || !isVersion(value.compatibility.min_app_version)
      || !isVersion(value.compatibility.max_app_version)
      || !isVersion(value.compatibility.min_runtime_version)
      || !isVersion(value.compatibility.max_runtime_version)
      || compareVersions(value.compatibility.min_app_version, value.compatibility.max_app_version) > 0
      || compareVersions(value.compatibility.min_runtime_version, value.compatibility.max_runtime_version) > 0
      || !isPlainObject(value.provenance)
      || !IDENTIFIER_RE.test(value.provenance.dataset_snapshot_id || '')
      || !IDENTIFIER_RE.test(value.provenance.training_run_id || '')
      || !isSha256(value.provenance.evaluation_receipt_sha256)) invalid();

  const hasArtifactBytes = Buffer.isBuffer(value.artifact_bytes) || value.artifact_bytes instanceof Uint8Array;
  if (value.artifact_bytes !== undefined && !hasArtifactBytes) invalid();
  const bytes = hasArtifactBytes ? Buffer.from(value.artifact_bytes) : null;
  if (bytes && (bytes.length !== value.artifact.size_bytes || sha256(bytes) !== value.artifact.sha256)) invalid();
  if (value.manifest.sha256 !== modelReleaseManifestDigest(value)) invalid();
  const { artifact_bytes: _headerArtifactBytes, ...artifactHeaderRelease } = value;
  if (Buffer.byteLength(canonicalJson(artifactHeaderRelease), 'utf8') > MAX_ARTIFACT_MANIFEST_HEADER_BYTES) invalid();
  return {
    schema_version: value.schema_version,
    release_id: value.release_id,
    model_id: value.model_id,
    channel: value.channel,
    state: value.state,
    published_at: value.published_at,
    approved_at: value.approved_at,
    ...(value.revoked_at ? { revoked_at: value.revoked_at } : {}),
    manifest: {
      schema_version: value.manifest.schema_version,
      sha256: value.manifest.sha256,
      signature: {
        algorithm: value.manifest.signature.algorithm,
        key_id: value.manifest.signature.key_id,
        value: value.manifest.signature.value,
      },
    },
    artifact: {
      media_type: value.artifact.media_type,
      sha256: value.artifact.sha256,
      size_bytes: value.artifact.size_bytes,
    },
    tensor_contract: {
      runtime_id: value.tensor_contract.runtime_id,
      input: { data_type: value.tensor_contract.input.data_type, shape: [...value.tensor_contract.input.shape] },
      outputs: [...value.tensor_contract.outputs],
      decoder_profile: value.tensor_contract.decoder_profile,
      labels: [...value.tensor_contract.labels],
    },
    compatibility: { ...value.compatibility },
    provenance: { ...value.provenance },
    ...(bytes ? { artifact_bytes: bytes } : {}),
  };
}

export function selectCatalogReleases(releases, compatibility) {
  const request = validateModelCatalogRequest(compatibility);
  if (!Array.isArray(releases)) throw new TypeError('releases must be an array');
  return releases
    .map((release) => validateModelRelease(release))
    .filter((release) => isCatalogEligible(release, request))
    .sort((left, right) => String(right.published_at).localeCompare(String(left.published_at))
      || String(right.release_id).localeCompare(String(left.release_id)))
    .slice(0, 5)
    .map(toCatalogEntry);
}

export function isCatalogEligible(release, compatibility) {
  const request = validateModelCatalogRequest(compatibility);
  const candidate = validateModelRelease(release);
  return candidate.state === 'published'
    && !candidate.revoked_at
    && candidate.channel === 'field'
    && candidate.tensor_contract.runtime_id === request.runtime_id
    && request.decoder_profiles.includes(candidate.tensor_contract.decoder_profile)
    && versionInRange(request.app_version, candidate.compatibility.min_app_version, candidate.compatibility.max_app_version)
    && versionInRange(request.runtime_version, candidate.compatibility.min_runtime_version, candidate.compatibility.max_runtime_version);
}

export function toCatalogEntry(release) {
  const candidate = validateModelRelease(release);
  const { artifact_bytes: _artifactBytes, ...entry } = candidate;
  return structuredClone(entry);
}

/** Canonical, bounded full release JSON transported with its artifact as base64url. */
export function artifactManifestHeaderValue(release) {
  return Buffer.from(canonicalJson(toCatalogEntry(release)), 'utf8').toString('base64url');
}

export function validateModelFeedback(value) {
  const invalid = () => { throw new ContractError('invalid_model_feedback', 'Model feedback is invalid.', { statusCode: 422 }); };
  if (!isPlainObject(value) || !hasOnlyKeys(value, REQUIRED_FEEDBACK_KEYS)) invalid();
  if (value.schema_version !== 'bss.raid.model_feedback.v1'
      || !IDENTIFIER_RE.test(value.feedback_id || '')
      || !RELEASE_ID_RE.test(value.release_id || '')
      || !isSha256(value.artifact_sha256)
      || !VERDICTS.has(value.verdict)
      || !Array.isArray(value.reason_codes)
      || value.reason_codes.length < 1
      || value.reason_codes.length > 4
      || new Set(value.reason_codes).size !== value.reason_codes.length
      || !value.reason_codes.every((reason) => FEEDBACK_REASONS.has(reason))
      || typeof value.note !== 'string'
      || value.note.length > 240
      || !isVersion(value.app_version)
      || value.runtime_id !== 'litert'
      || !isVersion(value.runtime_version)
      || (value.capture_reference !== null && !IDENTIFIER_RE.test(value.capture_reference || ''))
      || !isRfc3339(value.submitted_at)) invalid();
  return {
    schema_version: value.schema_version,
    feedback_id: value.feedback_id,
    release_id: value.release_id,
    artifact_sha256: value.artifact_sha256,
    verdict: value.verdict,
    reason_codes: [...value.reason_codes],
    note: value.note,
    app_version: value.app_version,
    runtime_id: value.runtime_id,
    runtime_version: value.runtime_version,
    capture_reference: value.capture_reference,
    submitted_at: value.submitted_at,
  };
}

export function compareVersions(left, right) {
  if (!isVersion(left) || !isVersion(right)) throw new TypeError('Semantic versions must use major.minor.patch.');
  const [leftMajor, leftMinor, leftPatch] = left.split('.').map(Number);
  const [rightMajor, rightMinor, rightPatch] = right.split('.').map(Number);
  return leftMajor - rightMajor || leftMinor - rightMinor || leftPatch - rightPatch;
}

export function modelReleaseManifestDigest(release) {
  return sha256(canonicalJson(modelReleaseManifestDigestPayload(release)));
}

export function modelReleaseSignaturePayload(release) {
  return canonicalJson(modelReleaseSignaturePayloadObject(release));
}

export function verifyModelReleaseSignature(release, trustedPublicKeys) {
  const candidate = validateModelRelease(release);
  const pem = trustedPublicKeys instanceof Map
    ? trustedPublicKeys.get(candidate.manifest.signature.key_id)
    : trustedPublicKeys?.[candidate.manifest.signature.key_id];
  if (typeof pem !== 'string' || pem.length === 0) return false;
  try {
    const publicKey = crypto.createPublicKey(pem);
    if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return false;
    return crypto.verify(
      'sha256',
      Buffer.from(modelReleaseSignaturePayload(candidate), 'utf8'),
      publicKey,
      Buffer.from(candidate.manifest.signature.value, 'base64'),
    );
  } catch {
    return false;
  }
}

function invalidCatalogRequest() {
  return new ContractError('invalid_model_catalog_request', 'Model catalog request is invalid.', { statusCode: 422 });
}

function invalidModelRelease() {
  return new ContractError('invalid_model_release', 'Model release is invalid.', { statusCode: 422 });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isVersion(value) {
  return typeof value === 'string' && VERSION_RE.test(value);
}

function isRfc3339(value) {
  return typeof value === 'string' && RFC3339_RE.test(value) && Number.isFinite(Date.parse(value));
}

function isSha256(value) {
  return typeof value === 'string' && SHA256_RE.test(value);
}

function isBase64(value) {
  if (typeof value !== 'string' || value.length < 16 || value.length > 4096 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    return Buffer.from(value, 'base64').length > 0;
  } catch {
    return false;
  }
}

function isPositiveInteger(value, maximum) {
  return Number.isInteger(value) && value > 0 && value <= maximum;
}

function isTensorInput(value) {
  return isPlainObject(value)
    && value.data_type === 'float32'
    && Array.isArray(value.shape)
    && value.shape.length === 4
    && value.shape[0] === 1
    && value.shape.slice(1).every((dimension) => Number.isInteger(dimension) && dimension > 0 && dimension <= 4096);
}

function versionInRange(value, minimum, maximum) {
  return compareVersions(value, minimum) >= 0 && compareVersions(value, maximum) <= 0;
}

function modelReleaseManifestDigestPayload(release) {
  const { artifact_bytes: _artifactBytes, manifest, ...rest } = release;
  const { signature: _signature, sha256: _manifestSha256, ...unsignedManifest } = manifest || {};
  return { ...rest, manifest: unsignedManifest };
}

function modelReleaseSignaturePayloadObject(release) {
  const { artifact_bytes: _artifactBytes, manifest, ...rest } = release;
  const { signature: _signature, ...unsignedManifest } = manifest || {};
  return { ...rest, manifest: unsignedManifest };
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new TypeError('Canonical release values must be JSON values.');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
