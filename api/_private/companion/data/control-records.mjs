import { ensure, oneOf, integer, signed, nonnegative, optionalNonnegative, UUID7, SOURCE, bootId } from './protocol.mjs';
const KINDS = ['WIFI', 'BLE', 'CELL', 'GNSS', 'IMU', 'VISUAL', 'POSE', 'EXTERNAL', 'UNKNOWN'];
const HEALTH = ['STOPPED', 'STARTING', 'HEALTHY', 'DEGRADED', 'PERMISSION_DENIED', 'UNAVAILABLE', 'ERROR'];
function validateSource(source) {
  ensure(SOURCE.test(source.sourceId)); oneOf(source.kind, KINDS); oneOf(source.health, HEALTH);
  optionalNonnegative(source, ['requestedIntervalMs', 'appliedIntervalMs', 'lastArrivalAgeMs', 'latestAcquisitionAgeMs', 'registrationAgeMs']);
  nonnegative(source, ['accepted', 'committed', 'liveOnly', 'dropped', 'callbacksReceived', 'rateLimited', 'malformedCallbacks',
    'deliveredRecordsInWindow', 'registrationGeneration']);
  ensure(integer(source.rateLimited) <= integer(source.callbacksReceived));
  ensure(integer(source.malformedCallbacks) <= integer(source.callbacksReceived) - integer(source.rateLimited));
  ensure(integer(source.deliveryWindowMs) <= 60000n);
  oneOf(source.availability, ['', 'AVAILABLE', 'PERMISSION_DENIED', 'DISABLED', 'UNSUPPORTED', 'UNKNOWN']);
  if (Object.hasOwn(source, 'deliveredRecordsPerSecond')) ensure(Number.isFinite(source.deliveredRecordsPerSecond) && source.deliveredRecordsPerSecond >= 0);
  if (source.wifiScan) validateWifiAccounting(source);
}
function validateWifiAccounting(source) {
  ensure(source.kind === 'WIFI');
  nonnegative(source.wifiScan, ['accepted', 'rejected', 'errors', 'updated', 'notUpdated']);
  optionalNonnegative(source.wifiScan, ['callbackOverflow', 'callbackInvalid', 'callbackDiscarded', 'scheduledIntervalMs']);
}
function validateMotion(policy) {
  oneOf(policy.motionRecordingState, ['', 'DISABLED', 'RECORDING', 'BYTE_LIMIT', 'TIME_LIMIT', 'PRESSURE', 'CLOCK_RESET']);
  nonnegative(policy, ['motionAdmittedBytes', 'motionAdmittedRecords', 'motionLimitBytes', 'motionLimitMs']);
  if (policy.motionRecordingState) {
    ensure(integer(policy.motionLimitBytes) >= 1n && integer(policy.motionLimitBytes) <= 64n * 1024n * 1024n);
    ensure(integer(policy.motionLimitMs) >= 1n && integer(policy.motionLimitMs) <= 3600000n);
  }
}
function validatePolicy(policy) {
  ensure(policy && (!policy.captureVersion || /^[A-Za-z0-9_.+-]{1,64}$/.test(policy.captureVersion)));
  ensure(!policy.captureSource || policy.captureSource === 'unknown' || /^[0-9a-f]{40}$/.test(policy.captureSource));
  ensure(/^[a-z0-9_.-]{1,64}$/.test(policy.policyVersion));
  oneOf(policy.preferredMode, ['PASSIVE', 'SURVEY']);
  oneOf(policy.settingsStatus, ['READY', 'UNKNOWN_MODE', 'UNSUPPORTED_SCHEMA', 'UNAVAILABLE', 'INVALID_BUDGET']);
  oneOf(policy.budgetTier, ['NORMAL', 'REDUCED', 'MINIMUM']);
  oneOf(policy.budgetReason, ['normal', 'thermal', 'battery', 'thermal_and_battery', 'headroom', 'backlog', 'multiple_pressure']);
  validateMotion(policy);
  if (Object.hasOwn(policy, 'thermalHeadroom')) ensure(Number.isFinite(policy.thermalHeadroom) && policy.thermalHeadroom >= 0);
  ensure(policy.thermalStatus >= 0 && policy.thermalStatus <= 6 && policy.batteryPercent >= 0 && policy.batteryPercent <= 100);
  ensure(policy.sources.length <= 64 && new Set(policy.sources.map((source) => source.sourceId)).size === policy.sources.length);
  policy.sources.forEach(validateSource);
}
function validateTransition(event) {
  const change = event.healthTransition; ensure(change && event.outcome === 'health_changed');
  ensure(SOURCE.test(change.sourceId)); oneOf(change.kind, KINDS);
  ensure(integer(change.registrationGeneration) > 0n && change.previousHealth === 'HEALTHY');
  const causes = { STOPPED: ['stream_completed'], PERMISSION_DENIED: ['permission_denied'],
    UNAVAILABLE: ['source_unavailable', 'artifact_unavailable'], ERROR: ['source_failed'] };
  ensure(Object.hasOwn(causes, change.health)); oneOf(change.cause, causes[change.health]);
  ensure(integer(change.observedElapsedNs) <= integer(event.elapsedNs));
  ensure(integer(change.controlSequence) > 0n && integer(change.controlSequence) < integer(event.sequence));
  oneOf(change.controlStage, ['START', 'REQUESTED', 'APPLIED']);
  ensure(event.policy.sources.some((source) => source.sourceId === change.sourceId && source.kind === change.kind
    && integer(source.registrationGeneration) >= integer(change.registrationGeneration)));
}
function validateStage(event) {
  const outcomes = { 1: ['intent'], 2: ['intent'], 3: ['applied'],
    4: ['user_stop', 'start_failed', 'storage_failure', 'explicit_stop_interrupted'], 5: ['health_changed'], 6: ['checkpoint'] };
  oneOf(event.outcome, outcomes[event.stage]);
  ensure(Boolean(event.healthTransition) === (event.stage === 5));
  if (event.stage === 5) validateTransition(event);
  if (event.stage === 6) {
    ensure(event.checkpointControlStage === 'APPLIED');
    ensure(integer(event.checkpointControlSequence) > 0n && integer(event.checkpointControlSequence) < integer(event.sequence));
  } else ensure(integer(event.checkpointControlSequence) === 0n && event.checkpointControlStage === '');
}
export function validateControl(event, sessionId) {
  ensure(event.schemaVersion === 1 && UUID7.test(event.id) && event.sessionId === sessionId);
  ensure(integer(event.sequence) > 0n); oneOf(event.stage, [1, 2, 3, 4, 5, 6]);
  oneOf(event.mode, ['PASSIVE', 'SURVEY', 'INVESTIGATE']); bootId(event.bootEpoch); integer(event.elapsedNs); signed(event.wallMs);
  validatePolicy(event.policy); validateStage(event); return event;
}
