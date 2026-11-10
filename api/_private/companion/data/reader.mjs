import { verifyRoster } from './roster.mjs';
import { decodeHead, decodeCommit, decodeDelta, commitSlot } from './dataset-wire.mjs';
import { createAdmissionStore } from './admission.mjs';
import { EMPTY_TIP, sameTip } from './admission-state.mjs';
import { ensure } from './protocol.mjs';
const SAFE_ERRORS = new Set(['invalid_dataset', 'invalid_roster', 'journal_conflict', 'head_conflict', 'identity_conflict',
  'dataset_capacity', 'roster_changed', 'dataset_unavailable', 'session_expired', 'cutoff_conflict']);
const fail = (code) => { throw new Error(code); };
function errorCode(error) { return SAFE_ERRORS.has(error?.message) ? error.message : 'dataset_unavailable'; }
function orderedTip(prior, target) {
  if (target.sequence < prior.sequence || (target.sequence === prior.sequence && !sameTip(prior, target))) fail('head_conflict');
}
function limits(value = {}) {
  const result = { objects: 24, bytes: 8 * 1024 * 1024, perPeer: 4, milliseconds: 20000, ...value };
  for (const [name, min, max] of [['objects', 3, 128], ['bytes', 2 * 1024 * 1024, 32 * 1024 * 1024], ['perPeer', 1, 16], ['milliseconds', 100, 30000]]) {
    ensure(Number.isSafeInteger(result[name]) && result[name] >= min && result[name] <= max);
  }
  return result;
}
export class DatasetReader {
  constructor({ loadRoster, loadObject, onChange = () => {}, store = createAdmissionStore(), budget } = {}) {
    this.loadRoster = loadRoster; this.loadObject = loadObject; this.onChange = onChange; this.store = store; this.budget = limits(budget);
    this.pin = null; this.observed = new Map(); this.peers = new Map(); this.epoch = 0; this.nextPeer = 0;
    this.active = null; this.controller = null; this.phase = 'idle'; this.failure = null; this.more = false; this.checkedAt = null;
  }
  status() {
    const peers = [...this.peers.values()];
    return { ...this.store.summary(), phase: this.phase, failure: this.failure, more: this.more, checkedAt: this.checkedAt,
      observationChainComplete: this.phase === 'ready' && peers.every((peer) => ['up_to_date', 'empty'].includes(peer.status)),
      scope: 'radio-location-v1', unsupported: ['independent-evidence-streams', 'derived-map-estimates'], peers: peers.map((peer) => ({ ...peer })) };
  }
  notify() { this.onChange(this.status()); }
  refresh() {
    if (this.active) return this.active;
    const controller = new AbortController(); this.controller = controller;
    const context = { epoch: this.epoch, signal: controller.signal, objects: 0, bytes: 0, started: performance.now() };
    const timeout = setTimeout(() => controller.abort('budget'), this.budget.milliseconds);
    const work = this.run(context).finally(() => { clearTimeout(timeout); if (this.active === work) { this.active = null; this.controller = null; } });
    this.active = work; return work;
  }
  cancel() { this.controller?.abort('cancelled'); }
  clear() {
    this.epoch++; this.controller?.abort('cleared'); this.controller = null; this.active = null;
    this.store.clear(); this.observed.clear(); this.peers.clear(); this.pin = null;
    this.phase = 'idle'; this.failure = null; this.more = false; this.checkedAt = null; this.nextPeer = 0; this.notify();
  }
  check(context) {
    if (context.epoch !== this.epoch) fail('cleared');
    if (context.signal.aborted) fail(context.signal.reason === 'budget' ? 'budget' : 'cancelled');
    if (performance.now() - context.started >= this.budget.milliseconds) fail('budget');
  }
  async read(context, roster, publisher, object, maxBytes, missing = false) {
    this.check(context);
    if (context.objects >= this.budget.objects || context.bytes + maxBytes > this.budget.bytes) fail('budget');
    context.objects++;
    const bytes = await this.loadObject({ version: 1, revision: roster.revision, rosterSha256: roster.rosterSha256,
      deviceId: publisher, object }, context.signal, maxBytes);
    this.check(context);
    if (bytes === null && missing) return null;
    ensure(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= maxBytes); context.bytes += bytes.length; return bytes;
  }
  async roster(context) {
    const envelope = await this.loadRoster(context.signal); this.check(context);
    const pin = this.pin || { groupId: envelope.groupId, rosterPublicKeySpki: envelope.rosterPublicKeySpki };
    const roster = await verifyRoster(envelope, pin, this.store.roster()); this.check(context);
    this.pin = pin; this.store.applyRoster(roster); this.checkedAt = new Date().toISOString();
    this.peers = new Map([...roster.members.values()].map((member) => [member.deviceId, {
      deviceId: member.deviceId, displayName: member.displayName, active: member.active, status: 'pending',
      acceptedThrough: this.store.cutoff(member.deviceId)?.sequence.toString() ?? null,
      cursor: this.store.cursor(member.deviceId).sequence.toString(), target: null, failure: null }]));
    this.notify(); return roster;
  }
  async target(context, roster, member) {
    const cutoff = this.store.cutoff(member.deviceId);
    if (cutoff?.state === 'conflict') fail('cutoff_conflict');
    if (cutoff) return { sequence: cutoff.sequence, commitHash: cutoff.commitHash };
    const bytes = await this.read(context, roster, member.deviceId, 'head', 16384, true);
    const target = bytes ? await decodeHead({ groupId: roster.groupId, deviceId: member.deviceId }, member.key, bytes) : EMPTY_TIP;
    this.check(context); orderedTip(this.observed.get(member.deviceId) || EMPTY_TIP, target);
    orderedTip(this.store.cursor(member.deviceId), target); this.observed.set(member.deviceId, target); return target;
  }
  async next(context, roster, member, cursor, target) {
    const scope = { groupId: roster.groupId, deviceId: member.deviceId };
    const slot = await commitSlot(scope, cursor.sequence + 1n); this.check(context);
    const bytes = await this.read(context, roster, member.deviceId, slot, 16384);
    const commit = await decodeCommit(scope, member.key, bytes); this.check(context);
    if (commit.sequence !== cursor.sequence + 1n || commit.previousCommitSha256 !== cursor.commitHash) fail('head_conflict');
    if (commit.sequence === target.sequence && commit.commitHash !== target.commitHash) fail('head_conflict');
    const deltaBytes = await this.read(context, roster, member.deviceId, commit.deltaSha256, commit.deltaSize);
    const delta = await decodeDelta(commit, deltaBytes); this.check(context);
    const result = this.store.admit(roster, cursor, commit, delta);
    if (result === 'conflict') fail('identity_conflict'); if (result === 'stale') fail('roster_changed');
    return this.store.cursor(member.deviceId);
  }
  async pull(context, roster, member) {
    const state = this.peers.get(member.deviceId); const target = await this.target(context, roster, member);
    state.target = target.sequence.toString(); let cursor = this.store.cursor(member.deviceId); let count = 0;
    while (cursor.sequence < target.sequence && count < this.budget.perPeer) {
      cursor = await this.next(context, roster, member, cursor, target); count++;
      state.cursor = cursor.sequence.toString(); state.status = 'processing'; this.notify();
    }
    state.status = cursor.sequence < target.sequence ? 'more' : (target.sequence === 0n ? 'empty' : 'up_to_date');
    if (state.status === 'more') this.more = true;
  }
  async pullMembers(context, roster) {
    const members = [...roster.members.values()]; const start = this.nextPeer % members.length;
    for (let index = 0; index < members.length; index++) {
      const member = members[(start + index) % members.length]; this.nextPeer = (start + index + 1) % members.length;
      const before = this.store.cursor(member.deviceId);
      try { await this.pull(context, roster, member); }
      catch (error) {
        if (context.epoch === this.epoch && (error.message === 'budget' || context.signal.reason === 'budget')) {
          // Resume a peer that used the remainder just reaching its next delta;
          // rotate after actual progress so a large stream cannot monopolize passes.
          if (sameTip(before, this.store.cursor(member.deviceId))) this.nextPeer = (start + index) % members.length;
          fail('budget');
        }
        this.check(context);
        if (['budget', 'roster_changed', 'session_expired'].includes(error.message)) throw error;
        Object.assign(this.peers.get(member.deviceId), { status: 'error', failure: errorCode(error) });
      }
      this.notify();
    }
  }
  async run(context) {
    this.phase = 'refreshing'; this.failure = null; this.more = false; this.notify();
    try {
      const roster = await this.roster(context); await this.pullMembers(context, roster); this.check(context);
      this.phase = this.more || [...this.peers.values()].some((peer) => peer.status === 'error') ? 'partial' : 'ready';
    } catch (error) {
      if (context.epoch !== this.epoch) return this.status();
      const code = context.signal.aborted ? (context.signal.reason === 'budget' ? 'budget' : 'cancelled') : error.message;
      this.phase = 'partial'; this.more = code === 'budget'; this.failure = ['budget', 'cancelled'].includes(code) ? code : errorCode(error);
      if (['invalid_roster', 'roster_changed'].includes(code)) this.store.suspend();
      if (code === 'session_expired') { this.store.clear(); this.observed.clear(); this.peers.clear(); this.pin = null; this.phase = 'locked'; }
    }
    this.notify(); return this.status();
  }
}
