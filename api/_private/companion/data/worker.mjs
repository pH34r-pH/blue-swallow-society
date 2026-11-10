import { DatasetReader } from './reader.mjs';
import { receiverFixes } from './receiver-projection.mjs';

// The worker receives bounded transport results, never a session token or URL.
const pending = new Map(); let serial = 0;
const errors = new Set(['session_expired', 'roster_changed', 'dataset_unavailable', 'invalid_dataset']);
function transport(kind, reference, signal, maxBytes) {
  return new Promise((resolve, reject) => {
    if (signal.aborted || pending.size) { reject(new Error('dataset_unavailable')); return; }
    const id = ++serial;
    const abort = () => {
      pending.delete(id); self.postMessage({ type: 'abort', id }); reject(new Error('cancelled'));
    };
    signal.addEventListener('abort', abort, { once: true });
    pending.set(id, { resolve, reject, cleanup: () => signal.removeEventListener('abort', abort) });
    self.postMessage({ type: 'read', id, kind, reference, maxBytes });
  });
}
const reader = new DatasetReader({
  loadRoster: (signal) => transport('roster', null, signal, 192 * 1024),
  loadObject: (reference, signal, maxBytes) => transport('object', reference, signal, maxBytes),
  onChange: (status) => self.postMessage({ type: 'status', status }),
});
function project(data) {
  const status = reader.status();
  if (!Number.isSafeInteger(data.id) || data.id < 1) return;
  if (status.suspended || !status.rosterRevision || status.phase === 'locked'
    || data.epoch !== reader.epoch || data.generation !== status.generation) {
    self.postMessage({ type: 'projection', id: data.id, error: 'stale_projection' }); return;
  }
  try {
    if (data.publisher != null && (typeof data.publisher !== 'string' || !/^[a-f0-9]{64}$/.test(data.publisher))) throw new Error('invalid_projection');
    const result = receiverFixes(reader.store, { publisher: data.publisher ?? null, limit: data.limit });
    self.postMessage({ type: 'projection', id: data.id, epoch: reader.epoch, result });
  } catch { self.postMessage({ type: 'projection', id: data.id, error: 'invalid_projection' }); }
}
self.onmessage = ({ data }) => {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'result') {
    const request = pending.get(data.id); if (!request) return;
    pending.delete(data.id); request.cleanup();
    if (data.error) request.reject(new Error(errors.has(data.error) ? data.error : 'dataset_unavailable'));
    else request.resolve(data.value);
  } else if (data.type === 'refresh') void reader.refresh();
  else if (data.type === 'cancel') reader.cancel();
  else if (data.type === 'clear') reader.clear();
  else if (data.type === 'receiver-fixes') project(data);
  else if (data.type === 'status') self.postMessage({ type: 'status', status: reader.status() });
};
