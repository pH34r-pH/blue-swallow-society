import { randomUUID } from 'node:crypto';

import { forbidden, IngestError, tokenDigestMatches } from './auth.mjs';
import { hashCanonicalJson, hashPersistedObservation } from './contracts.mjs';

export class MemoryObservationStore {
  #credentials;
  #batches = new Map();
  #observations = new Map();
  #now;
  #randomUuid;

  constructor({ credentials = [], now = () => new Date(), randomUuid = randomUUID } = {}) {
    this.#credentials = credentials.map((credential) => ({
      device_id: credential.device_id,
      source_id: credential.source_id,
      source_class: credential.source_class,
      token_sha256: credential.token_sha256,
      scopes: [...(credential.scopes ?? [])],
      enabled: credential.enabled === true,
      expires_at: credential.expires_at ?? null,
    }));
    this.#now = now;
    this.#randomUuid = randomUuid;
  }

  async ready() {
    return { ok: true, database: 'ready', migrations: 'ready' };
  }

  async authenticate({ deviceId, token, requiredScope }) {
    const credential = this.#credentials.find((candidate) => candidate.device_id === deviceId);
    const now = this.#now();
    if (!credential || !credential.enabled || !tokenDigestMatches(token, credential.token_sha256)) throw forbidden();
    if (credential.expires_at && new Date(credential.expires_at) <= now) throw forbidden();
    if (!credential.scopes.includes(requiredScope)) throw forbidden();
    return Object.freeze({
      device_id: credential.device_id,
      source_id: credential.source_id,
      source_class: credential.source_class,
      scopes: Object.freeze([...credential.scopes]),
    });
  }

  async applyBatch({ credential, batch }) {
    if (credential.device_id !== batch.device_id) throw forbidden();
    const batchIdentity = `${credential.source_id}\u0000${batch.device_id}\u0000${batch.idempotency_key}`;
    const payloadHash = hashCanonicalJson(batch);
    const existingBatch = this.#batches.get(batchIdentity);
    if (existingBatch) {
      if (existingBatch.payloadHash !== payloadHash) {
        throw new IngestError('idempotency_key_reused', 'Idempotency key was reused with changed content.', { statusCode: 409 });
      }
      return { statusCode: 200, replayed: true, receipt: structuredClone(existingBatch.receipt) };
    }

    const pending = [];
    let duplicateCount = 0;
    for (const observation of batch.observations) {
      const identity = `${credential.source_id}\u0000${observation.external_observation_key}`;
      const contentHash = hashPersistedObservation(batch, observation);
      const existing = this.#observations.get(identity);
      if (existing) {
        if (existing.contentHash !== contentHash) {
          throw new IngestError('observation_key_reused', 'Observation key was reused with changed content.', { statusCode: 409 });
        }
        duplicateCount += 1;
      } else {
        pending.push({ identity, contentHash, observation });
      }
    }

    const serverClock = this.#now().toISOString();
    const receipt = Object.freeze({
      schema_version: 'bss.sync_receipt.v1',
      server_batch_id: this.#randomUuid(),
      idempotency_key: batch.idempotency_key,
      status: 'applied',
      accepted_count: pending.length,
      rejected_count: 0,
      duplicate_count: duplicateCount,
      validation_errors: [],
      server_clock: serverClock,
    });

    for (const entry of pending) {
      this.#observations.set(entry.identity, {
        contentHash: entry.contentHash,
        observation: structuredClone(entry.observation),
        sourceId: credential.source_id,
        sourceClass: credential.source_class,
        batchId: receipt.server_batch_id,
      });
    }
    this.#batches.set(batchIdentity, { payloadHash, receipt: structuredClone(receipt) });
    return { statusCode: 201, replayed: false, receipt: structuredClone(receipt) };
  }

  observationCount() {
    return this.#observations.size;
  }

  batchCount() {
    return this.#batches.size;
  }
}
