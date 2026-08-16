const MAX_CYBERMAP_BYTES = 1024 * 1024;

function boundaryError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function getHeader(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name) ?? headers.get(name.toLowerCase());
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function assertDeclaredLength(headers, maxBytes, { label, status, codePrefix }) {
  const raw = getHeader(headers, 'content-length');
  if (raw === undefined || raw === null || String(raw).trim() === '') return;

  const value = String(raw).trim();
  if (!/^\d+$/.test(value)) {
    throw boundaryError(`${label} has an invalid Content-Length.`, status, `${codePrefix}_invalid_length`);
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw boundaryError(`${label} has an invalid Content-Length.`, status, `${codePrefix}_invalid_length`);
  }
  if (length > maxBytes) {
    throw boundaryError(`${label} exceeds the ${maxBytes}-byte limit.`, status, `${codePrefix}_too_large`);
  }
}

function boundedJsonStringify(value, { label = 'Cybermap request' } = {}) {
  const chunks = [];
  const seen = new Set();
  let bytes = 0;

  const limitError = () => boundaryError(
    `${label} exceeds the ${MAX_CYBERMAP_BYTES}-byte limit.`,
    413,
    'cybermap_request_too_large',
  );
  const append = (fragment) => {
    const next = bytes + Buffer.byteLength(fragment, 'utf8');
    if (next > MAX_CYBERMAP_BYTES) throw limitError();
    bytes = next;
    chunks.push(fragment);
  };
  const writeString = (text) => {
    append('"');
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code === 0x22) append('\\"');
      else if (code === 0x5c) append('\\\\');
      else if (code === 0x08) append('\\b');
      else if (code === 0x0c) append('\\f');
      else if (code === 0x0a) append('\\n');
      else if (code === 0x0d) append('\\r');
      else if (code === 0x09) append('\\t');
      else if (code < 0x20) append(`\\u${code.toString(16).padStart(4, '0')}`);
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          append(text.slice(index, index + 2));
          index += 1;
        } else append(`\\u${code.toString(16).padStart(4, '0')}`);
      } else if (code >= 0xd800 && code <= 0xdfff) append(`\\u${code.toString(16).padStart(4, '0')}`);
      else append(text[index]);
    }
    append('"');
  };
  const write = (current, arrayValue = false) => {
    if (current === null) return append('null');
    switch (typeof current) {
      case 'string': return writeString(current);
      case 'boolean': return append(current ? 'true' : 'false');
      case 'number': return append(Number.isFinite(current) ? String(current) : 'null');
      case 'undefined': return arrayValue ? append('null') : false;
      case 'bigint': throw new TypeError('Cannot serialize a BigInt value as JSON.');
      case 'function':
      case 'symbol': return arrayValue ? append('null') : false;
      case 'object': break;
      default: return false;
    }

    if (seen.has(current)) throw new TypeError('Cannot serialize circular JSON.');
    seen.add(current);
    if (Array.isArray(current)) {
      append('[');
      current.forEach((item, index) => {
        if (index) append(',');
        write(item, true);
      });
      append(']');
    } else {
      append('{');
      let wroteProperty = false;
      for (const key of Object.keys(current)) {
        const item = current[key];
        if (typeof item === 'undefined' || typeof item === 'function' || typeof item === 'symbol') continue;
        if (wroteProperty) append(',');
        writeString(key);
        append(':');
        write(item);
        wroteProperty = true;
      }
      append('}');
    }
    seen.delete(current);
    return true;
  };

  write(value);
  return chunks.join('');
}

function assertRequestContentLength(req, { label = 'Cybermap request' } = {}) {
  assertDeclaredLength(req?.headers, MAX_CYBERMAP_BYTES, {
    label,
    status: 413,
    codePrefix: 'cybermap_request',
  });
}

function requestBody(req, { required = false, label = 'Cybermap request' } = {}) {
  assertRequestContentLength(req, { label });

  let body;
  if (typeof req?.rawBody === 'string' || Buffer.isBuffer(req?.rawBody)) {
    body = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : req.rawBody;
  } else if (typeof req?.body === 'string' || Buffer.isBuffer(req?.body)) {
    body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  } else if (req?.body && typeof req.body === 'object') {
    body = boundedJsonStringify(req.body, { label });
  }

  if ((body === undefined || body === null || body === '') && required) {
    throw boundaryError(`${label} JSON body is required.`, 400, 'cybermap_request_missing_body');
  }
  if (body === undefined || body === null) return undefined;

  if (Buffer.byteLength(body, 'utf8') > MAX_CYBERMAP_BYTES) {
    throw boundaryError(`${label} exceeds the ${MAX_CYBERMAP_BYTES}-byte limit.`, 413, 'cybermap_request_too_large');
  }
  return body;
}

function serializeJson(payload, { label = 'Cybermap request' } = {}) {
  return boundedJsonStringify(payload, { label });
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.from(String(value), 'utf8');
}

async function readBoundedResponseBytes(response, { label = 'Cybermap backend response' } = {}) {
  try {
    assertDeclaredLength(response?.headers, MAX_CYBERMAP_BYTES, {
      label,
      status: 502,
      codePrefix: 'cybermap_response',
    });
  } catch (error) {
    await cancelResponseBody(response);
    throw error;
  }

  if (response?.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = toBuffer(value);
        if (total + chunk.length > MAX_CYBERMAP_BYTES) {
          try {
            await reader.cancel?.();
          } catch {
            // Preserve the bounded transport error; cancellation is best effort.
          }
          throw boundaryError(`${label} exceeds the ${MAX_CYBERMAP_BYTES}-byte limit.`, 502, 'cybermap_response_too_large');
        }
        total += chunk.length;
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks, total);
  }

  await cancelResponseBody(response);
  throw boundaryError(`${label} has no bounded readable stream.`, 502, 'cybermap_response_unreadable');
}

async function cancelResponseBody(response) {
  const body = response?.body;
  if (!body) return;
  if (typeof body.cancel === 'function') {
    try {
      await body.cancel();
    } catch {
      // Preserve the bounded transport error; cancellation is best effort.
    }
    return;
  }
  if (typeof body.getReader !== 'function') return;

  let reader;
  try {
    reader = body.getReader();
    await reader.cancel?.();
  } catch {
    // Preserve the bounded transport error; cancellation is best effort.
  } finally {
    reader?.releaseLock?.();
  }
}

async function readBoundedJsonResponse(response, options) {
  const text = (await readBoundedResponseBytes(response, options)).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw boundaryError(`${options?.label || 'Cybermap backend response'} is not valid JSON.`, 502, 'cybermap_response_invalid_json');
  }
}

module.exports = {
  MAX_CYBERMAP_BYTES,
  assertRequestContentLength,
  boundedJsonStringify,
  getHeader,
  readBoundedJsonResponse,
  readBoundedResponseBytes,
  requestBody,
  serializeJson,
};
