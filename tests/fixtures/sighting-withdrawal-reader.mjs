import { DatasetReader } from '../../api/_private/companion/data/reader.mjs';
import { commitSlot, decodeCommit, decodeDelta } from '../../api/_private/companion/data/dataset-wire.mjs';
import { publisherKey } from '../../api/_private/companion/data/signatures.mjs';
import { sha256 } from '../../api/_private/companion/data/protocol.mjs';

export async function inspectWithdrawal({ fixture, roster, cutoff }) {
  const bytes = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  const objects = new Map();
  let currentRoster = roster;
  const reader = new DatasetReader({
    loadRoster: async () => currentRoster,
    loadObject: async ({ deviceId, object }) => deviceId === fixture.deviceId ? objects.get(object) ?? null : null,
  });
  const key = await publisherKey(fixture.publicKeySpki, fixture.deviceId);
  let retained;
  let withdrawn = false;
  let commits = 0;
  async function inspect(packet) {
    if (packet) {
      const head = bytes(packet.head);
      const commitBytes = bytes(packet.commit);
      const deltaBytes = bytes(packet.delta);
      for (const [name, data] of [['head', head], ['commit', commitBytes], ['delta', deltaBytes]]) {
        if (await sha256(data) !== packet[name + 'Sha256']) throw new Error('fixture object hash mismatch');
      }
      const commit = await decodeCommit(fixture, key, commitBytes);
      const delta = await decodeDelta(commit, deltaBytes);
      if (delta.sessionId !== fixture.sessionId) throw new Error('wrong session');
      if (commit.sequence === 2n) {
        withdrawn = delta.retractions.length === 1 && delta.retractions[0].id === fixture.retractionId &&
          delta.retractions[0].targetObservationId === fixture.observationId;
      }
      objects.set('head', head);
      objects.set(await commitSlot(fixture, commit.sequence), commitBytes);
      objects.set(commit.deltaSha256, deltaBytes);
    }
    const state = await reader.refresh();
    if (!state.observationChainComplete) throw new Error('incomplete fixture chain: ' + JSON.stringify(state.peers));
    const visible = [...reader.store.observations({ publisher: fixture.deviceId })];
    if (!retained) {
      retained = visible[0]?.record;
      if (!retained || retained.id !== fixture.observationId || retained.kind !== 'external') throw new Error('missing sighting');
    }
    const [[publisher, provenance]] = retained.claims;
    const applied = state.commits - commits;
    commits = state.commits;
    return {
      visibleSupport: visible.length, withdrawn, retainedSha256: await sha256(retained.bytes),
      publisher, provenanceCommit: provenance.commitHash, cursor: Number(reader.store.cursor(publisher).sequence), applied,
    };
  }
  const stages = { before: await inspect(fixture.original), after: await inspect(fixture.withdrawal), replay: await inspect(null) };
  // Withdraw the authority of commit 2 and make the transport unable to supply the original again.
  currentRoster = cutoff;
  objects.clear();
  await reader.refresh();
  const [restored] = reader.store.observations({ publisher: fixture.deviceId });
  if (restored?.record.id !== fixture.observationId || await sha256(restored.record.bytes) !== stages.before.retainedSha256 ||
      restored.record.claims.get(fixture.deviceId)?.commitHash !== stages.before.provenanceCommit) {
    throw new Error('original bytes or publisher proof missing after cutoff');
  }
  return stages;
}
