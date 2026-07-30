const SHA256_RE = /^[a-f0-9]{64}$/;

/**
 * Bounded bridge between an eligible immutable snapshot and a separately authorized trainer.
 * It never runs a shell, publishes a candidate, or treats a process exit as a release approval.
 */
export async function dispatchEligibleTraining({
  store,
  policy,
  command,
  predecessorReleaseId = null,
  runCommand,
} = {}) {
  if (!store || typeof store.claimTrainingJob !== 'function') {
    throw new TypeError('A model lifecycle store with claimTrainingJob is required.');
  }
  const normalizedCommand = normalizeCommand(command);
  if (typeof runCommand !== 'function') {
    throw new TypeError('A non-shell training executor is required.');
  }

  const job = await store.claimTrainingJob({ policy, predecessorReleaseId });
  if (!job) return Object.freeze({ status: 'not_eligible' });
  try {
    const result = await runCommand(Object.freeze({ command: normalizedCommand, job }));
    const receiptSha256 = result?.receipt_sha256;
    if (!SHA256_RE.test(receiptSha256 || '')) {
      throw new Error('Training executor returned no immutable receipt digest.');
    }
    await recordEvent(store, job.job_id, 'claimed', { executor_receipt_sha256: receiptSha256 });
    return Object.freeze({ status: 'dispatched', job_id: job.job_id });
  } catch (error) {
    await recordEvent(store, job.job_id, 'failed', {
      error_class: error instanceof Error ? error.constructor.name : 'Error',
    });
    throw error;
  }
}

async function recordEvent(store, jobId, state, receipt) {
  if (typeof store.recordTrainingJobEvent !== 'function') {
    throw new TypeError('A model lifecycle store with recordTrainingJobEvent is required.');
  }
  await store.recordTrainingJobEvent({ jobId, state, receipt });
}

function normalizeCommand(command) {
  if (!Array.isArray(command) || command.length === 0 || command.length > 32
      || command.some(value => typeof value !== 'string' || !value.trim() || value.includes('\u0000'))) {
    throw new TypeError('A bounded non-shell training executor command is required.');
  }
  return Object.freeze(command.map(value => value.trim()));
}
