import crypto from 'node:crypto';
import { modelReleaseManifestDigest } from '../src/raid-model-contract.mjs';

export function catalogRequest(overrides = {}) {
  return {
    schema_version: 'bss.raid.model_catalog_request.v1',
    app_version: '2.109.0',
    runtime_id: 'litert',
    runtime_version: '2.1.0',
    decoder_profiles: ['ssd_postprocess_v1'],
    ...overrides,
  };
}

export function release(overrides = {}) {
  const artifact = Buffer.from('raid-model-artifact-v1', 'utf8');
  const sha256 = crypto.createHash('sha256').update(artifact).digest('hex');
  const candidate = {
    schema_version: 'bss.raid.model_release.v1',
    release_id: 'raid-general-20260729-0001',
    model_id: 'raid-general',
    channel: 'field',
    state: 'published',
    published_at: '2026-07-29T18:00:00.000Z',
    approved_at: '2026-07-29T17:59:00.000Z',
    manifest: {
      schema_version: 'bss.raid.model_manifest.v1',
      sha256: 'a'.repeat(64),
      signature: {
        algorithm: 'ecdsa-p256-sha256',
        key_id: 'raid-release-2026-q3',
        value: 'MEQCIGZpZWxkLXNpZ25hdHVyZS1ub3QtYS1rZXk=',
      },
    },
    artifact: {
      media_type: 'application/vnd.tensorflow.lite',
      sha256,
      size_bytes: artifact.length,
    },
    tensor_contract: {
      runtime_id: 'litert',
      input: { data_type: 'float32', shape: [1, 320, 320, 3] },
      outputs: ['boxes', 'classes', 'scores', 'count'],
      decoder_profile: 'ssd_postprocess_v1',
      labels: ['person', 'camera'],
    },
    compatibility: {
      min_app_version: '2.109.0',
      max_app_version: '2.110.0',
      min_runtime_version: '2.0.0',
      max_runtime_version: '2.2.0',
    },
    provenance: {
      dataset_snapshot_id: 'snapshot-20260729-0001',
      training_run_id: 'train-20260729-0001',
      evaluation_receipt_sha256: 'b'.repeat(64),
    },
    artifact_bytes: artifact,
    ...overrides,
  };
  candidate.manifest = {
    ...candidate.manifest,
    sha256: modelReleaseManifestDigest(candidate),
  };
  return candidate;
}
