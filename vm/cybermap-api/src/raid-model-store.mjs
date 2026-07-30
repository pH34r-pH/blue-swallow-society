import { randomUUID } from 'node:crypto';

import { IngestError } from './auth.mjs';
import { hashCanonicalJson } from './contracts.mjs';
import {
  isCatalogEligible,
  selectCatalogReleases,
  validateModelCatalogRequest,
  validateModelFeedback,
  validateModelRelease,
} from './raid-model-contract.mjs';

const TRAINING_EVENT_STATES = new Set(['queued', 'claimed', 'completed', 'failed', 'evaluation_recorded']);

function isTrainingEventState(value) {
  return typeof value === 'string' && TRAINING_EVENT_STATES.has(value);
}

function normalizeTrainingEventReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IngestError('invalid_training_event', 'Training job event receipt is invalid.', { statusCode: 422 });
  }
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 12 || entries.some(([key, item]) => !/^[a-z][a-z0-9_]{1,63}$/.test(key)
      || typeof item !== 'string' || item.length === 0 || item.length > 256)) {
    throw new IngestError('invalid_training_event', 'Training job event receipt is invalid.', { statusCode: 422 });
  }
  return Object.freeze(Object.fromEntries(entries));
}

export class MemoryRaIDModelStore {
  #releases = new Map();
  #feedback = new Map();
  #reviewedExamples;
  #consumedExamples = new Set();
  #claimedPolicies = new Set();
  #trainingJobs = new Map();
  #now;
  #randomUuid;
  #releaseVerifier;
  #snapshotSequence = 0;
  #jobSequence = 0;

  constructor({ releases = [], reviewedExamples = [], now = () => new Date(), randomUuid = randomUUID, releaseVerifier = null } = {}) {
    if (releaseVerifier !== null && typeof releaseVerifier !== 'function') throw new TypeError('releaseVerifier must be a function when supplied.');
    for (const release of releases) {
      const normalized = validateModelRelease(release);
      if (!Buffer.isBuffer(normalized.artifact_bytes)) {
        throw new TypeError('Memory model releases require retrievable artifact bytes.');
      }
      if (this.#releases.has(normalized.release_id)) throw new TypeError('Duplicate model release ID.');
      this.#releases.set(normalized.release_id, normalized);
    }
    this.#reviewedExamples = reviewedExamples.map(normalizeReviewedExample);
    this.#now = now;
    this.#randomUuid = randomUuid;
    this.#releaseVerifier = releaseVerifier;
  }

  async ready() {
    return { ok: true, database: 'ready', migrations: 'ready' };
  }

  async listCatalog({ compatibility }) {
    return selectCatalogReleases(
      [...this.#releases.values()].filter((release) => isReleaseTrusted(this.#releaseVerifier, release)),
      compatibility,
    );
  }

  async listRevocations() {
    return [...this.#releases.values()]
      .filter((release) => release.channel === 'field' && release.revoked_at)
      .map((release) => release.release_id)
      .sort()
      .slice(0, 100);
  }

  async getArtifact({ releaseId, compatibility }) {
    const request = validateModelCatalogRequest(compatibility);
    const release = this.#releases.get(releaseId);
    if (!release || !isReleaseTrusted(this.#releaseVerifier, release) || !isCatalogEligible(release, request)) {
      throw new IngestError('model_release_not_available', 'Model release is not available.', { statusCode: 404 });
    }
    return {
      release: releaseSummary(release),
      artifact: structuredClone(release.artifact),
      bytes: Buffer.from(release.artifact_bytes),
    };
  }

  async recordFeedback({ credential, feedback }) {
    if (!credential?.device_id || !credential?.source_id) {
      throw new IngestError('forbidden', 'Forbidden.', { statusCode: 403 });
    }
    const packet = validateModelFeedback(feedback);
    const release = this.#releases.get(packet.release_id);
    if (!release || !isReleaseTrusted(this.#releaseVerifier, release) || release.state !== 'published' || release.revoked_at) {
      throw new IngestError('model_release_not_available', 'Model release is not available.', { statusCode: 404 });
    }
    if (release.artifact.sha256 !== packet.artifact_sha256) {
      throw new IngestError('model_artifact_mismatch', 'Feedback does not match the immutable model artifact.', { statusCode: 422 });
    }
    const identity = `${credential.source_id}\u0000${credential.device_id}\u0000${packet.feedback_id}`;
    const payloadHash = hashCanonicalJson(packet);
    const existing = this.#feedback.get(identity);
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new IngestError('idempotency_key_reused', 'Feedback event ID was reused with changed content.', { statusCode: 409 });
      }
      return { statusCode: 200, replayed: true, receipt: structuredClone(existing.receipt) };
    }
    const receipt = Object.freeze({
      schema_version: 'bss.raid.model_feedback_receipt.v1',
      feedback_receipt_id: this.#randomUuid(),
      feedback_id: packet.feedback_id,
      release_id: packet.release_id,
      artifact_sha256: packet.artifact_sha256,
      status: 'recorded',
      review_state: 'unreviewed',
      recorded_at: this.#now().toISOString(),
    });
    this.#feedback.set(identity, {
      payloadHash,
      feedback: packet,
      credential: { device_id: credential.device_id, source_id: credential.source_id },
      receipt: structuredClone(receipt),
    });
    return { statusCode: 201, replayed: false, receipt: structuredClone(receipt) };
  }

  async claimTrainingJob({ policy, predecessorReleaseId = null }) {
    const normalizedPolicy = normalizePolicy(policy);
    const policyIdentity = `${normalizedPolicy.policy_id}\u0000${predecessorReleaseId || ''}`;
    if (this.#claimedPolicies.has(policyIdentity)) return null;
    const predecessor = predecessorReleaseId === null ? null : this.#releases.get(predecessorReleaseId);
    if (predecessorReleaseId !== null
        && (!predecessor || predecessor.state !== 'published' || predecessor.revoked_at
          || !isReleaseTrusted(this.#releaseVerifier, predecessor))) {
      throw new IngestError('predecessor_release_unknown', 'Predecessor model release is unknown.', { statusCode: 422 });
    }
    const eligible = this.#reviewedExamples
      .filter((example) => !this.#consumedExamples.has(example.example_id))
      .filter((example) => example.eligible_at <= this.#now().toISOString())
      .sort((left, right) => left.eligible_at.localeCompare(right.eligible_at)
        || left.example_id.localeCompare(right.example_id));
    const hardNegatives = eligible.filter((example) => example.hard_negative).length;
    if (eligible.length < normalizedPolicy.minimum_examples || hardNegatives < normalizedPolicy.minimum_hard_negatives) return null;
    if (new Set(eligible.map((example) => example.taxonomy_revision)).size !== 1) {
      throw new IngestError('training_taxonomy_mismatch', 'Eligible examples span taxonomy revisions.', { statusCode: 422 });
    }

    this.#claimedPolicies.add(policyIdentity);
    for (const example of eligible) this.#consumedExamples.add(example.example_id);
    const snapshot = Object.freeze({
      schema_version: 'bss.raid.dataset_snapshot.v1',
      snapshot_id: `snapshot-${String(++this.#snapshotSequence).padStart(8, '0')}`,
      policy_id: normalizedPolicy.policy_id,
      taxonomy_revision: eligible[0].taxonomy_revision,
      replay_corpus_id: normalizedPolicy.replay_corpus_id,
      example_ids: eligible.map((example) => example.example_id),
      example_receipt_sha256: hashCanonicalJson(eligible.map((example) => ({
        example_id: example.example_id,
        rights_receipt: example.rights_receipt,
        dedupe_key: example.dedupe_key,
      }))),
      created_at: this.#now().toISOString(),
    });
    const job = Object.freeze({
      schema_version: 'bss.raid.training_job.v1',
      job_id: `training-job-${String(++this.#jobSequence).padStart(8, '0')}`,
      snapshot_id: snapshot.snapshot_id,
      policy_id: normalizedPolicy.policy_id,
      predecessor_release_id: predecessorReleaseId,
      state: 'queued',
      created_at: this.#now().toISOString(),
    });
    this.#trainingJobs.set(job.job_id, { job, events: [] });
    return { snapshot: structuredClone(snapshot), job: structuredClone(job) };
  }

  async recordTrainingJobEvent({ jobId, state, receipt }) {
    if (!isTrainingEventState(state) || !jobId) {
      throw new IngestError('invalid_training_event', 'Training job event is invalid.', { statusCode: 422 });
    }
    const entry = this.#trainingJobs.get(jobId);
    if (!entry) {
      throw new IngestError('training_job_not_found', 'Training job is unavailable.', { statusCode: 404 });
    }
    const event = Object.freeze({
      job_id: jobId,
      state,
      recorded_at: this.#now().toISOString(),
      receipt: normalizeTrainingEventReceipt(receipt),
    });
    entry.events.push(event);
    return structuredClone(event);
  }
}

export class PostgresRaIDModelStore {
  #pool;
  #now;
  #randomUuid;
  #releaseVerifier;

  constructor({ pool, now = () => new Date(), randomUuid = randomUUID, releaseVerifier = null } = {}) {
    if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
      throw new TypeError('A pg-compatible pool is required.');
    }
    if (typeof now !== 'function' || typeof randomUuid !== 'function') throw new TypeError('Clock and UUID source must be functions.');
    if (releaseVerifier !== null && typeof releaseVerifier !== 'function') throw new TypeError('releaseVerifier must be a function when supplied.');
    this.#pool = pool;
    this.#now = now;
    this.#randomUuid = randomUuid;
    this.#releaseVerifier = releaseVerifier;
  }

  async ready() {
    try {
      const requiredMigrations = ['0006_raid_model_lifecycle', '0007_raid_model_lifecycle_hardening'];
      const result = await this.#pool.query(
        'SELECT version FROM schema_migrations WHERE version = ANY($1::text[])',
        [requiredMigrations],
      );
      const versions = new Set(result.rows.map((row) => row.version));
      const migrationsReady = requiredMigrations.every((version) => versions.has(version));
      return { ok: migrationsReady, database: 'ready', migrations: migrationsReady ? 'ready' : 'pending' };
    } catch {
      return { ok: false, database: 'unavailable', migrations: 'unknown' };
    }
  }

  async listCatalog({ compatibility }) {
    const request = validateModelCatalogRequest(compatibility);
    const result = await this.#pool.query(
      `SELECT release.release_manifest AS release
       FROM raid_model_releases AS release
       JOIN raid_model_artifacts AS artifact ON artifact.release_id = release.release_id
       LEFT JOIN raid_model_release_revocations AS revocation
         ON revocation.release_id = release.release_id
       WHERE release.state = 'published'
         AND release.channel = 'field'
         AND revocation.release_id IS NULL
         AND octet_length(artifact.artifact_bytes) = release.artifact_size_bytes
         AND encode(digest(artifact.artifact_bytes, 'sha256'), 'hex') = release.artifact_sha256
         AND release.release_manifest #>> '{tensor_contract,runtime_id}' = $1
         AND release.release_manifest #>> '{tensor_contract,decoder_profile}' = ANY($2::text[])
         AND raid_semver_at_or_below(release.release_manifest #>> '{compatibility,min_app_version}', $3)
         AND raid_semver_at_or_above(release.release_manifest #>> '{compatibility,max_app_version}', $3)
         AND raid_semver_at_or_below(release.release_manifest #>> '{compatibility,min_runtime_version}', $4)
         AND raid_semver_at_or_above(release.release_manifest #>> '{compatibility,max_runtime_version}', $4)
       ORDER BY release.published_at DESC, release.release_id DESC`,
      [request.runtime_id, request.decoder_profiles, request.app_version, request.runtime_version],
    );
    return selectCatalogReleases(
      result.rows.map((row) => parseReleaseJson(row.release)).filter((release) => isReleaseTrusted(this.#releaseVerifier, release)),
      request,
    );
  }

  async listRevocations() {
    const result = await this.#pool.query(
      `SELECT revocation.release_id
       FROM raid_model_release_revocations AS revocation
       JOIN raid_model_releases AS release ON release.release_id = revocation.release_id
       WHERE release.channel = 'field'
       ORDER BY revocation.revoked_at DESC, revocation.release_id DESC
       LIMIT 100`,
    );
    return result.rows
      .map((row) => row.release_id)
      .filter((releaseId) => typeof releaseId === 'string' && /^[a-z][a-z0-9-]{2,119}$/.test(releaseId));
  }

  async getArtifact({ releaseId, compatibility }) {
    const request = validateModelCatalogRequest(compatibility);
    const result = await this.#pool.query(
      `SELECT release.release_manifest AS release, artifact.artifact_bytes
       FROM raid_model_releases AS release
       JOIN raid_model_artifacts AS artifact ON artifact.release_id = release.release_id
       LEFT JOIN raid_model_release_revocations AS revocation
         ON revocation.release_id = release.release_id
       WHERE release.release_id = $1
         AND revocation.release_id IS NULL
       LIMIT 1`,
      [releaseId],
    );
    if (result.rows.length !== 1) {
      throw new IngestError('model_release_not_available', 'Model release is not available.', { statusCode: 404 });
    }
    const row = result.rows[0];
    const release = validateModelRelease({
      ...parseReleaseJson(row.release),
      artifact_bytes: Buffer.from(row.artifact_bytes ?? []),
    });
    if (!isReleaseTrusted(this.#releaseVerifier, release) || !isCatalogEligible(release, request)) {
      throw new IngestError('model_release_not_available', 'Model release is not available.', { statusCode: 404 });
    }
    return {
      release: releaseSummary(release),
      artifact: structuredClone(release.artifact),
      bytes: Buffer.from(release.artifact_bytes),
    };
  }

  async claimTrainingJob(request) {
    return claimPostgresTrainingJob({
      pool: this.#pool,
      now: this.#now,
      randomUuid: this.#randomUuid,
      request,
    });
  }

  async recordTrainingJobEvent({ jobId, state, receipt }) {
    if (!jobId || !isTrainingEventState(state)) {
      throw new IngestError('invalid_training_event', 'Training job event is invalid.', { statusCode: 422 });
    }
    const normalizedReceipt = normalizeTrainingEventReceipt(receipt);
    const result = await this.#pool.query(
      `INSERT INTO raid_training_job_events (job_id, event_type, receipt)
       SELECT $1, $2, $3::jsonb
       WHERE EXISTS (SELECT 1 FROM raid_training_jobs WHERE job_id = $1)
       RETURNING event_type AS state, recorded_at`,
      [jobId, state, JSON.stringify(normalizedReceipt)],
    );
    if (result.rows.length !== 1) {
      throw new IngestError('training_job_not_found', 'Training job is unavailable.', { statusCode: 404 });
    }
    return Object.freeze({
      job_id: jobId,
      state: result.rows[0].state,
      recorded_at: new Date(result.rows[0].recorded_at).toISOString(),
      receipt: normalizedReceipt,
    });
  }

  async recordFeedback({ credential, feedback }) {
    if (!credential?.device_id || !credential?.source_id) {
      throw new IngestError('forbidden', 'Forbidden.', { statusCode: 403 });
    }
    const packet = validateModelFeedback(feedback);
    const client = await this.#pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query("SET LOCAL lock_timeout TO '2s'; SET LOCAL statement_timeout TO '3s'; SET LOCAL idle_in_transaction_session_timeout TO '10s'");
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${credential.source_id}\u0000${credential.device_id}\u0000${packet.feedback_id}`],
      );
      const releaseResult = await client.query(
        `SELECT release.release_manifest AS release
         FROM raid_model_releases AS release
         JOIN raid_model_artifacts AS artifact ON artifact.release_id = release.release_id
         LEFT JOIN raid_model_release_revocations AS revocation
           ON revocation.release_id = release.release_id
         WHERE release.release_id = $1
           AND revocation.release_id IS NULL
           AND octet_length(artifact.artifact_bytes) = release.artifact_size_bytes
           AND encode(digest(artifact.artifact_bytes, 'sha256'), 'hex') = release.artifact_sha256
         FOR SHARE`,
        [packet.release_id],
      );
      if (releaseResult.rows.length !== 1) {
        throw new IngestError('model_release_not_available', 'Model release is not available.', { statusCode: 404 });
      }
      const release = validateModelRelease(parseReleaseJson(releaseResult.rows[0].release));
      if (!isReleaseTrusted(this.#releaseVerifier, release) || release.state !== 'published') {
        throw new IngestError('model_release_not_available', 'Model release is not available.', { statusCode: 404 });
      }
      if (release.artifact.sha256 !== packet.artifact_sha256) {
        throw new IngestError('model_artifact_mismatch', 'Feedback does not match the immutable model artifact.', { statusCode: 422 });
      }
      const payloadHash = hashCanonicalJson(packet);
      const existing = await client.query(
        `SELECT payload_hash, id::text AS feedback_receipt_id, recorded_at
         FROM raid_model_feedback
         WHERE source_id = $1 AND device_id = $2 AND feedback_id = $3
         FOR UPDATE`,
        [credential.source_id, credential.device_id, packet.feedback_id],
      );
      if (existing.rows.length === 1) {
        if (existing.rows[0].payload_hash !== payloadHash) {
          throw new IngestError('idempotency_key_reused', 'Feedback event ID was reused with changed content.', { statusCode: 409 });
        }
        await client.query('COMMIT');
        transactionOpen = false;
        return {
          statusCode: 200,
          replayed: true,
          receipt: feedbackReceipt(packet, existing.rows[0]),
        };
      }
      const inserted = await client.query(
        `INSERT INTO raid_model_feedback (
           source_id, device_id, feedback_id, release_id, artifact_sha256, payload_hash, feedback
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING id::text AS feedback_receipt_id, recorded_at`,
        [
          credential.source_id,
          credential.device_id,
          packet.feedback_id,
          packet.release_id,
          packet.artifact_sha256,
          payloadHash,
          JSON.stringify(packet),
        ],
      );
      const receipt = feedbackReceipt(packet, inserted.rows[0]);
      await client.query('COMMIT');
      transactionOpen = false;
      return { statusCode: 201, replayed: false, receipt };
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Retain the original error.
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

async function claimPostgresTrainingJob({ pool, now, randomUuid, request }) {
  const normalizedPolicy = normalizePolicy(request?.policy);
  const predecessorReleaseId = request?.predecessorReleaseId ?? null;
  if (predecessorReleaseId !== null && (typeof predecessorReleaseId !== 'string' || predecessorReleaseId.length === 0)) {
    throw new IngestError('predecessor_release_unknown', 'Predecessor model release is unknown.', { statusCode: 422 });
  }
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout TO '2s'; SET LOCAL statement_timeout TO '5s'; SET LOCAL idle_in_transaction_session_timeout TO '15s'");
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${normalizedPolicy.policy_id}\u0000${predecessorReleaseId ?? ''}`],
    );
    if (predecessorReleaseId !== null) {
      const predecessor = await client.query(
        `SELECT release.release_id
         FROM raid_model_releases AS release
         LEFT JOIN raid_model_release_revocations AS revocation
           ON revocation.release_id = release.release_id
         WHERE release.release_id = $1
           AND release.state = 'published'
           AND revocation.release_id IS NULL
         FOR SHARE`,
        [predecessorReleaseId],
      );
      if (predecessor.rows.length !== 1) {
        throw new IngestError('predecessor_release_unknown', 'Predecessor model release is unknown.', { statusCode: 422 });
      }
    }
    const eligibleResult = await client.query(
      `SELECT example_id, taxonomy_revision, rights_receipt_sha256, dedupe_key, class_id, hard_negative, eligible_at
       FROM raid_reviewed_training_examples AS example
       WHERE example.eligible_at <= clock_timestamp()
         AND NOT EXISTS (
           SELECT 1
           FROM raid_dataset_snapshot_examples AS consumed
           WHERE consumed.example_id = example.example_id
         )
       ORDER BY example.eligible_at ASC, example.example_id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [100_000],
    );
    const examples = eligibleResult.rows.map(normalizePersistedReviewedExample);
    const hardNegatives = examples.filter((example) => example.hard_negative).length;
    if (examples.length < normalizedPolicy.minimum_examples || hardNegatives < normalizedPolicy.minimum_hard_negatives) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return null;
    }
    const taxonomyRevisions = new Set(examples.map((example) => example.taxonomy_revision));
    if (taxonomyRevisions.size !== 1) {
      throw new IngestError('training_taxonomy_mismatch', 'Eligible examples span taxonomy revisions.', { statusCode: 422 });
    }
    const createdAt = now().toISOString();
    const snapshotId = `snapshot-${randomUuid()}`;
    const jobId = `training-job-${randomUuid()}`;
    const exampleIds = examples.map((example) => example.example_id);
    const exampleReceiptSha256 = hashCanonicalJson(examples.map((example) => ({
      example_id: example.example_id,
      rights_receipt: example.rights_receipt,
      dedupe_key: example.dedupe_key,
    })));
    const snapshot = Object.freeze({
      schema_version: 'bss.raid.dataset_snapshot.v1',
      snapshot_id: snapshotId,
      policy_id: normalizedPolicy.policy_id,
      taxonomy_revision: examples[0].taxonomy_revision,
      replay_corpus_id: normalizedPolicy.replay_corpus_id,
      example_ids: exampleIds,
      example_receipt_sha256: exampleReceiptSha256,
      created_at: createdAt,
    });
    const snapshotManifest = {
      ...snapshot,
      example_count: exampleIds.length,
      hard_negative_count: hardNegatives,
      predecessor_release_id: predecessorReleaseId,
    };
    await client.query(
      `INSERT INTO raid_dataset_snapshots (
         snapshot_id, policy_id, taxonomy_revision, replay_corpus_id,
         example_ids, example_receipt_sha256, snapshot_manifest
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)`,
      [
        snapshot.snapshot_id,
        snapshot.policy_id,
        snapshot.taxonomy_revision,
        snapshot.replay_corpus_id,
        JSON.stringify(snapshot.example_ids),
        snapshot.example_receipt_sha256,
        JSON.stringify(snapshotManifest),
      ],
    );
    await client.query(
      `INSERT INTO raid_dataset_snapshot_examples (snapshot_id, example_id)
       SELECT $1, example_id
       FROM jsonb_array_elements_text($2::jsonb) AS example_id`,
      [snapshot.snapshot_id, JSON.stringify(snapshot.example_ids)],
    );
    const job = Object.freeze({
      schema_version: 'bss.raid.training_job.v1',
      job_id: jobId,
      snapshot_id: snapshot.snapshot_id,
      policy_id: normalizedPolicy.policy_id,
      predecessor_release_id: predecessorReleaseId,
      state: 'queued',
      created_at: createdAt,
    });
    await client.query(
      `INSERT INTO raid_training_jobs (job_id, snapshot_id, policy_id, predecessor_release_id, job_manifest)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [job.job_id, job.snapshot_id, job.policy_id, job.predecessor_release_id, JSON.stringify(job)],
    );
    await client.query(
      `INSERT INTO raid_training_job_events (job_id, event_type, receipt)
       VALUES ($1, 'queued', $2::jsonb)`,
      [job.job_id, JSON.stringify({ ...job, event_type: 'queued' })],
    );
    await client.query('COMMIT');
    transactionOpen = false;
    return { snapshot: structuredClone(snapshot), job: structuredClone(job) };
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Retain the original error.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

function parseReleaseJson(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') throw new IngestError('model_release_corrupt', 'Stored model release is corrupt.', { statusCode: 503 });
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new IngestError('model_release_corrupt', 'Stored model release is corrupt.', { statusCode: 503 });
  }
}

function isReleaseTrusted(releaseVerifier, release) {
  if (typeof releaseVerifier !== 'function') return false;
  try {
    return releaseVerifier(release) === true;
  } catch {
    return false;
  }
}

function feedbackReceipt(packet, row) {
  return Object.freeze({
    schema_version: 'bss.raid.model_feedback_receipt.v1',
    feedback_receipt_id: row.feedback_receipt_id,
    feedback_id: packet.feedback_id,
    release_id: packet.release_id,
    artifact_sha256: packet.artifact_sha256,
    status: 'recorded',
    review_state: 'unreviewed',
    recorded_at: new Date(row.recorded_at).toISOString(),
  });
}

function releaseSummary(release) {
  const { artifact_bytes: _artifactBytes, ...summary } = release;
  return structuredClone(summary);
}

function normalizeReviewedExample(value) {
  if (!value || typeof value !== 'object'
      || !/^[a-z][a-z0-9-]{2,119}$/.test(value.example_id || '')
      || !/^[a-z][a-z0-9-]{2,119}$/.test(value.taxonomy_revision || '')
      || !/^[a-f0-9]{64}$/.test(value.rights_receipt || '')
      || typeof value.dedupe_key !== 'string' || value.dedupe_key.length < 1 || value.dedupe_key.length > 200
      || !/^[a-z][a-z0-9_-]{1,63}$/.test(value.class_id || '')
      || typeof value.hard_negative !== 'boolean'
      || !/^\d{4}-\d{2}-\d{2}T/.test(value.eligible_at || '')) {
    throw new TypeError('Reviewed example is invalid.');
  }
  return Object.freeze({
    example_id: value.example_id,
    taxonomy_revision: value.taxonomy_revision,
    rights_receipt: value.rights_receipt,
    dedupe_key: value.dedupe_key,
    class_id: value.class_id,
    hard_negative: value.hard_negative,
    eligible_at: value.eligible_at,
  });
}

function normalizePersistedReviewedExample(row) {
  return normalizeReviewedExample({
    example_id: row?.example_id,
    taxonomy_revision: row?.taxonomy_revision,
    rights_receipt: row?.rights_receipt_sha256,
    dedupe_key: row?.dedupe_key,
    class_id: row?.class_id,
    hard_negative: row?.hard_negative,
    eligible_at: row?.eligible_at instanceof Date ? row.eligible_at.toISOString() : row?.eligible_at,
  });
}

function normalizePolicy(value) {
  if (!value || typeof value !== 'object'
      || !/^[a-z][a-z0-9-]{2,119}$/.test(value.policy_id || '')
      || !Number.isInteger(value.minimum_examples) || value.minimum_examples < 1 || value.minimum_examples > 100_000
      || !Number.isInteger(value.minimum_hard_negatives) || value.minimum_hard_negatives < 0 || value.minimum_hard_negatives > value.minimum_examples
      || !/^[a-z][a-z0-9-]{2,119}$/.test(value.replay_corpus_id || '')) {
    throw new TypeError('Training policy is invalid.');
  }
  return Object.freeze({
    policy_id: value.policy_id,
    minimum_examples: value.minimum_examples,
    minimum_hard_negatives: value.minimum_hard_negatives,
    replay_corpus_id: value.replay_corpus_id,
  });
}
