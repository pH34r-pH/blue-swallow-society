const fail = (code = 'dataset_unavailable') => { throw new Error(code); };
function validReference(ref) {
  return ref && Object.keys(ref).length === 5 && ref.version === 1
    && Number.isSafeInteger(ref.revision) && ref.revision > 0
    && ['rosterSha256', 'deviceId', 'object'].every((key) => typeof ref[key] === 'string')
    && /^[a-f0-9]{64}$/.test(ref.rosterSha256) && /^[a-f0-9]{64}$/.test(ref.deviceId)
    && (ref.object === 'head' || /^[a-f0-9]{64}$/.test(ref.object));
}
function validRead(message) {
  if (!Number.isSafeInteger(message.id) || message.id < 1) return false;
  if (message.kind === 'roster') return message.reference === null && message.maxBytes === 192 * 1024;
  return message.kind === 'object' && validReference(message.reference)
    && Number.isSafeInteger(message.maxBytes) && message.maxBytes > 0 && message.maxBytes <= 1048576;
}
async function boundedBytes(response, limit) {
  const stream = response.body?.getReader(); if (!stream) fail();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await stream.read(); if (done) break;
      size += value.byteLength; if (size > limit) fail('invalid_dataset'); chunks.push(value);
    }
    if (!size) fail('invalid_dataset');
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally { await stream.cancel().catch(() => {}); stream.releaseLock(); }
}
async function read(request, message, signal) {
  const isObject = message.kind === 'object';
  const response = await request('/api/companion-datasets/' + message.kind, { signal,
    ...(isObject ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message.reference) } : {}) });
  if ([401, 403].includes(response.status)) fail('session_expired');
  if (response.status === 409) fail('roster_changed');
  if (isObject && message.reference.object === 'head' && response.status === 404) return null;
  if (!response.ok) fail();
  if (isObject && (response.headers.get('X-Blue-Swallow-Roster-Revision') !== String(message.reference.revision)
    || response.headers.get('X-Blue-Swallow-Roster-Sha256') !== message.reference.rosterSha256)) fail('roster_changed');
  const bytes = await boundedBytes(response, message.maxBytes);
  if (isObject) return bytes;
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('invalid_dataset'); }
}
export function createDatasetClient({ source, request, signal, onStatus }) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  let worker;
  try { worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
  const pending = new Map(); let closed = false;
  function destroy() {
    if (closed) return;
    closed = true; worker.terminate();
    for (const controller of pending.values()) controller.abort();
    pending.clear(); signal.removeEventListener('abort', destroy);
  }
  async function respond(message) {
    if (!validRead(message) || pending.size || pending.has(message.id)) { destroy(); onStatus({ phase: 'failed', failure: 'dataset_unavailable' }); return; }
    const controller = new AbortController(); pending.set(message.id, controller);
    try {
      const value = await read(request, message, controller.signal);
      if (!closed && !controller.signal.aborted) worker.postMessage({ type: 'result', id: message.id, value }, value instanceof Uint8Array ? [value.buffer] : []);
    } catch (error) {
      const code = ['session_expired', 'roster_changed', 'invalid_dataset'].includes(error.message) ? error.message : 'dataset_unavailable';
      if (!closed && !controller.signal.aborted) worker.postMessage({ type: 'result', id: message.id, error: code });
    } finally { pending.delete(message.id); }
  }
  worker.onmessage = ({ data }) => {
    if (closed) return;
    if (data?.type === 'status') onStatus(data.status);
    else if (data?.type === 'read') void respond(data);
    else if (data?.type === 'abort') { pending.get(data.id)?.abort(); pending.delete(data.id); }
  };
  worker.onerror = (event) => { event.preventDefault(); destroy(); onStatus({ phase: 'failed', failure: 'dataset_unavailable' }); };
  signal.addEventListener('abort', destroy, { once: true });
  if (signal.aborted) destroy();
  return { refresh() { if (!closed) worker.postMessage({ type: 'refresh' }); },
    cancel() { if (!closed) worker.postMessage({ type: 'cancel' }); },
    clear() { if (!closed) worker.postMessage({ type: 'clear' }); }, destroy };
}
