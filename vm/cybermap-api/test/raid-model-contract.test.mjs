import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { catalogRequest, release } from './raid-model-fixtures.mjs';

import {
  ContractError,
  selectCatalogReleases,
  validateModelCatalogRequest,
  validateModelFeedback,
  validateModelRelease,
  modelReleaseSignaturePayload,
  verifyModelReleaseSignature,
} from '../src/raid-model-contract.mjs';

test('catalog contract rejects non-LiteRT compatibility and query-shaped unknown fields', () => {
  assert.deepEqual(validateModelCatalogRequest(catalogRequest()), catalogRequest());
  assert.throws(
    () => validateModelCatalogRequest(catalogRequest({ runtime_id: 'ncnn' })),
    (error) => error instanceof ContractError && error.code === 'invalid_model_catalog_request',
  );
  assert.throws(
    () => validateModelCatalogRequest(catalogRequest({ unexpected: true })),
    (error) => error instanceof ContractError && error.code === 'invalid_model_catalog_request',
  );
});

test('catalog selection returns at most five newest approved compatible field releases', () => {
  const selected = selectCatalogReleases([
    release({ release_id: 'raid-general-20260729-0001', published_at: '2026-07-29T18:00:00.000Z' }),
    release({ release_id: 'raid-general-20260729-0002', published_at: '2026-07-29T18:01:00.000Z' }),
    release({ release_id: 'raid-general-20260729-0003', published_at: '2026-07-29T18:02:00.000Z' }),
    release({ release_id: 'raid-general-20260729-0004', published_at: '2026-07-29T18:03:00.000Z' }),
    release({ release_id: 'raid-general-20260729-0005', published_at: '2026-07-29T18:04:00.000Z' }),
    release({ release_id: 'raid-general-20260729-0006', published_at: '2026-07-29T18:05:00.000Z' }),
    release({ release_id: 'raid-general-20260729-revoked', revoked_at: '2026-07-29T19:00:00.000Z' }),
    release({ release_id: 'raid-general-20260729-candidate', state: 'trained' }),
    release({ release_id: 'raid-general-20260729-incompatible', compatibility: {
      min_app_version: '2.200.0', max_app_version: '2.201.0', min_runtime_version: '2.0.0', max_runtime_version: '2.2.0',
    } }),
  ], catalogRequest());

  assert.deepEqual(selected.map((entry) => entry.release_id), [
    'raid-general-20260729-0006',
    'raid-general-20260729-0005',
    'raid-general-20260729-0004',
    'raid-general-20260729-0003',
    'raid-general-20260729-0002',
  ]);
  assert.ok(selected.every((entry) => !('artifact_bytes' in entry)));
});

test('model feedback binds the exact release artifact and excludes raw field data', () => {
  const receipt = validateModelFeedback({
    schema_version: 'bss.raid.model_feedback.v1',
    feedback_id: 'feedback-20260729-0001',
    release_id: 'raid-general-20260729-0001',
    artifact_sha256: 'c'.repeat(64),
    verdict: 'bad',
    reason_codes: ['missed_target', 'poor_box'],
    note: 'Missed the bolted surveillance camera twice.',
    app_version: '2.109.0',
    runtime_id: 'litert',
    runtime_version: '2.1.0',
    capture_reference: 'capture-20260729-0001',
    submitted_at: '2026-07-29T18:10:00.000Z',
  });
  assert.equal(receipt.verdict, 'bad');
  assert.throws(
    () => validateModelFeedback({ ...receipt, location: { latitude: 47.6, longitude: -122.3 } }),
    (error) => error instanceof ContractError && error.code === 'invalid_model_feedback',
  );
  assert.throws(
    () => validateModelFeedback({ ...receipt, note: 'x'.repeat(241) }),
    (error) => error instanceof ContractError && error.code === 'invalid_model_feedback',
  );
});

test('release contract requires labels for the exact deployed tensor contract', () => {
  const candidate = release();
  delete candidate.tensor_contract.labels;
  assert.throws(
    () => validateModelRelease(candidate),
    (error) => error instanceof ContractError && error.code === 'invalid_model_release',
  );
});

test('release contract rejects an artifact digest that does not match supplied artifact bytes', () => {
  assert.throws(
    () => validateModelRelease(release({ artifact: { media_type: 'application/vnd.tensorflow.lite', sha256: 'd'.repeat(64), size_bytes: 22 } })),
    (error) => error instanceof ContractError && error.code === 'invalid_model_release',
  );
});

test('release contract rejects a manifest digest that does not bind its unsigned release content', () => {
  const candidate = release();
  candidate.manifest.sha256 = 'f'.repeat(64);
  assert.throws(
    () => validateModelRelease(candidate),
    (error) => error instanceof ContractError && error.code === 'invalid_model_release',
  );
});

test('release signature verification requires the named ECDSA P-256 trust anchor and exact canonical payload', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const candidate = release();
  candidate.manifest.signature.value = crypto.sign(
    'sha256', Buffer.from(modelReleaseSignaturePayload(candidate), 'utf8'), privateKey,
  ).toString('base64');
  const trusted = { [candidate.manifest.signature.key_id]: publicKey.export({ type: 'spki', format: 'pem' }) };

  assert.equal(verifyModelReleaseSignature(candidate, trusted), true);
  assert.equal(verifyModelReleaseSignature(candidate, {}), false);
  candidate.manifest.signature.value = Buffer.alloc(72, 0).toString('base64');
  assert.equal(verifyModelReleaseSignature(candidate, trusted), false);
});
