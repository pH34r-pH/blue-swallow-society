const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');

const DEFAULT_TIMEOUT_MS = 12_000;
const HTML_TEXT_BYTES = 64 * 1024;
const MAX_PUBLIC_REDIRECTS = 3;
const USER_AGENT = 'BlueSwallowSociety/1.0 (+https://blueswallow.net)';

const defaultDnsLookup = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });
const defaultHttpsRequest = https.request;
let dnsLookup = defaultDnsLookup;
let httpsRequest = defaultHttpsRequest;
let pinnedRequester = defaultPinnedRequester;

async function probePublicUrl(targetUrl, redirectsRemaining = MAX_PUBLIC_REDIRECTS, options = {}) {
  const timeout = normalizeTimeout(options.timeoutMs);
  const url = new URL(targetUrl);
  assertPublicUrlObject(url);
  const addresses = await assertPublicResolvableHostname(url.hostname);

  const result = await fetchText(url, {
    addresses,
    timeout,
    redirect: 'manual',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (isRedirectStatus(result.status)) {
    if (redirectsRemaining <= 0) {
      throw publicTargetError('Too many redirects while probing public URL.');
    }

    const location = result.headers.get('location');
    if (!location) {
      throw publicTargetError('Redirect response did not include a Location header.');
    }

    const nextUrl = new URL(location, url);
    assertPublicUrlObject(nextUrl);
    return probePublicUrl(nextUrl.toString(), redirectsRemaining - 1, options);
  }

  const titleMatch = result.body.match(/<title[^>]*>([^<]*)<\/title>/i);
  return {
    status: result.status,
    finalUrl: result.url || url.toString(),
    title: titleMatch ? decodeHtml(titleMatch[1]).trim() : null,
    headers: pickResponseHeaders(result.headers),
    bytes: Buffer.byteLength(result.body, 'utf8'),
  };
}

function normalizeTimeout(value) {
  if (value === undefined || value === null) return DEFAULT_TIMEOUT_MS;
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 60_000) {
    throw publicTargetError('Public URL probe timeout is invalid.');
  }
  return Math.floor(timeout);
}

function isSafePublicUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !isUnsafeHostName(parsed.hostname);
  } catch {
    return false;
  }
}

function assertPublicTarget(value, kind) {
  if (kind === 'ip' && !looksLikeIp(value)) {
    throw publicTargetError('Private or invalid IP targets are not allowed.');
  }
  if (isUnsafeHostName(value)) {
    throw publicTargetError('Private or local targets are not allowed.');
  }
}

function looksLikeIp(value) {
  if (!net.isIP(value)) {
    return false;
  }
  return !isPrivateIp(value);
}

function isUnsafeHostName(hostname) {
  const host = normalizeHostForSafety(hostname);
  if (!host) return true;
  if (host === 'localhost' || host === 'localhost.localdomain') return true;
  if (host.endsWith('.local') || host.endsWith('.localdomain') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home.arpa')) {
    return true;
  }
  if (isLikelyIpAddress(host)) {
    return isPrivateIp(host);
  }
  return false;
}

function normalizeHostForSafety(hostname) {
  let host = toCleanString(hostname).trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  if (host.endsWith('.')) {
    host = host.slice(0, -1);
  }
  const zoneIndex = host.indexOf('%');
  if (zoneIndex !== -1) {
    host = host.slice(0, zoneIndex);
  }
  return host;
}

function isLikelyIpAddress(value) {
  return net.isIP(normalizeHostForSafety(value)) !== 0;
}

function isPrivateIp(value) {
  const normalized = normalizeHostForSafety(value);
  if (net.isIP(normalized) === 4) {
    const [a, b, c, d] = normalized.split('.').map((segment) => parseInt(segment, 10));
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return d < 0 || d > 255;
  }

  if (net.isIP(normalized) === 6) {
    const lower = normalized.toLowerCase();
    if (lower.startsWith('::ffff:') && net.isIP(lower.slice('::ffff:'.length)) === 4) {
      return isPrivateIp(lower.slice('::ffff:'.length));
    }
    const mappedV4 = mappedIpv4(normalized);
    if (mappedV4) return isPrivateIp(mappedV4);
    if (lower === '::' || lower === '::1') return true;
    return lower.startsWith('fe80:')
      || lower.startsWith('fc')
      || lower.startsWith('fd')
      || lower.startsWith('ff')
      || lower.startsWith('2001:db8:')
      || lower === '2001:db8::1'
      || lower === '2001:db8::';
  }

  return false;
}

function mappedIpv4(value) {
  const canonical = canonicalIp(value);
  const groups = canonical.split(':');
  if (groups.length !== 8 || groups.slice(0, 5).some((group) => group !== '0000') || groups[5] !== 'ffff') {
    return null;
  }
  const high = parseInt(groups[6], 16);
  const low = parseInt(groups[7], 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function canonicalIp(value) {
  const host = normalizeHostForSafety(value);
  if (net.isIP(host) === 4) return host;
  if (host.toLowerCase().startsWith('::ffff:') && net.isIP(host.slice('::ffff:'.length)) === 4) {
    return host.slice('::ffff:'.length);
  }
  if (net.isIP(host) !== 6) return '';

  const [left, right] = host.split('::');
  const head = left ? left.split(':') : [];
  const tail = right === undefined || !right ? [] : right.split(':');
  if (head.some((part) => !/^[0-9a-f]{1,4}$/i.test(part)) || tail.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) {
    return '';
  }
  const hasElision = host.includes('::');
  const missing = 8 - head.length - tail.length;
  if ((hasElision && missing < 1) || (!hasElision && missing !== 0)) return '';
  return [...head, ...Array(Math.max(0, missing)).fill('0'), ...tail]
    .map((part) => part.padStart(4, '0').toLowerCase())
    .join(':');
}

function assertPublicUrlObject(url) {
  if (url.protocol !== 'https:') {
    throw publicTargetError('Only HTTPS public URL probes are allowed.');
  }
  if (url.username || url.password) {
    throw publicTargetError('URL credentials are not allowed.');
  }
  if (isUnsafeHostName(url.hostname)) {
    throw publicTargetError('Private, local, or reserved targets are not allowed.');
  }
}

async function assertPublicResolvableHostname(hostname) {
  const host = normalizeHostForSafety(hostname);
  if (isUnsafeHostName(host)) {
    throw publicTargetError('Private, local, or reserved targets are not allowed.');
  }
  if (isLikelyIpAddress(host)) {
    return [{ address: host, family: net.isIP(host) }];
  }

  let records;
  try {
    records = await dnsLookup(host);
  } catch (error) {
    throw publicTargetError(`DNS resolution failed for public target: ${error.message}`);
  }

  const answers = Array.isArray(records) ? records : [records];
  if (!answers.length) {
    throw publicTargetError('DNS resolution returned no public addresses.');
  }

  const vetted = [];
  for (const answer of answers) {
    const address = typeof answer === 'string' ? answer : answer?.address;
    const normalized = normalizeHostForSafety(address);
    const family = net.isIP(normalized);
    if (!normalized || !net.isIP(normalized) || isPrivateIp(normalized)) {
      throw publicTargetError('DNS resolution returned a private, local, or reserved address.');
    }
    if (!vetted.some((record) => canonicalIp(record.address) === canonicalIp(normalized))) {
      vetted.push({ address: normalized, family });
    }
  }
  return vetted;
}

function isRedirectStatus(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function publicTargetError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function pickResponseHeaders(headers) {
  const selected = ['content-type', 'server', 'x-powered-by', 'cache-control', 'last-modified', 'location'];
  const result = {};
  for (const key of selected) {
    const value = headers.get(key);
    if (value) {
      result[key] = value;
    }
  }
  return result;
}

async function fetchText(url, { addresses, timeout = DEFAULT_TIMEOUT_MS, headers = {}, method = 'GET', redirect = 'manual' } = {}) {
  const result = await pinnedRequester({
    url: url.toString(),
    addresses,
    timeout,
    headers,
    method,
    redirect,
  });
  assertPinnedPeer(result?.peerAddress, addresses);
  return {
    status: Number(result?.status) || 0,
    url: result?.url || url.toString(),
    headers: toHeaders(result?.headers),
    body: toCleanString(result?.body),
  };
}

async function defaultPinnedRequester({ url, addresses, timeout, headers, method }) {
  let lastError;
  const deadlineAt = Date.now() + timeout;
  for (const address of addresses) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) break;
    try {
      return await requestHttpsAtAddress({ url, address, timeout: remaining, headers, method });
    } catch (error) {
      lastError = error;
    }
  }
  throw publicTargetError(`Unable to connect to vetted public target: ${lastError?.message || 'no address accepted the connection'}`);
}

function requestHttpsAtAddress({ url, address, timeout, headers, method }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const hostname = normalizeHostForSafety(parsed.hostname);
    let completed = false;
    let deadline;
    const finish = (callback, value) => {
      if (completed) return;
      completed = true;
      clearTimeout(deadline);
      callback(value);
    };
    const request = httpsRequest({
      protocol: 'https:',
      hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      agent: false,
      rejectUnauthorized: true,
      servername: net.isIP(hostname) ? undefined : hostname,
      lookup(_hostname, _options, callback) {
        callback(null, address.address, address.family);
      },
    }, (response) => {
      readIncomingText(response, HTML_TEXT_BYTES)
        .then((body) => finish(resolve, {
          status: response.statusCode || 0,
          url,
          headers: response.headers,
          body,
          peerAddress: response.socket?.remoteAddress || null,
        }))
        .catch((error) => finish(reject, error));
    });

    if (completed) return;
    const abortForTimeout = () => request.destroy(publicTargetError('Public URL probe timed out.'));
    deadline = setTimeout(abortForTimeout, timeout);
    request.setTimeout(timeout, abortForTimeout);
    request.once('error', (error) => finish(reject, error));
    request.end();
  });
}

function assertPinnedPeer(peerAddress, addresses) {
  const peer = canonicalIp(peerAddress);
  if (!peer || isPrivateIp(peer)) {
    throw publicTargetError('HTTPS connection did not reach a vetted public peer.');
  }
  if (!Array.isArray(addresses) || !addresses.some((record) => canonicalIp(record.address) === peer)) {
    throw publicTargetError('HTTPS connection peer did not match the vetted DNS address.');
  }
}

async function readIncomingText(response, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const value of response) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const remaining = maxBytes - total;
    if (remaining <= 0) break;
    if (chunk.length > remaining) {
      chunks.push(chunk.subarray(0, remaining));
      total += remaining;
      response.destroy();
      break;
    }
    chunks.push(chunk);
    total += chunk.length;
  }
  return Buffer.concat(chunks).toString('utf8');
}

function toHeaders(value) {
  if (value && typeof value.get === 'function') return value;
  const headers = new Headers();
  for (const [key, headerValue] of Object.entries(value || {})) {
    if (headerValue === undefined) continue;
    headers.set(key, Array.isArray(headerValue) ? headerValue.join(', ') : String(headerValue));
  }
  return headers;
}

function decodeHtml(value) {
  return toCleanString(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function toCleanString(value) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

module.exports = {
  assertPinnedPeer,
  assertPublicResolvableHostname,
  assertPublicTarget,
  assertPublicUrlObject,
  isLikelyIpAddress,
  isPrivateIp,
  isSafePublicUrl,
  isUnsafeHostName,
  probePublicUrl,
  publicTargetError,
  resetDnsLookupForTests() {
    dnsLookup = defaultDnsLookup;
  },
  resetHttpsRequestForTests() {
    httpsRequest = defaultHttpsRequest;
  },
  resetPinnedRequesterForTests() {
    pinnedRequester = defaultPinnedRequester;
  },
  setDnsLookupForTests(fn) {
    dnsLookup = fn;
  },
  setHttpsRequestForTests(fn) {
    httpsRequest = fn;
  },
  setPinnedRequesterForTests(fn) {
    pinnedRequester = fn;
  },
};
