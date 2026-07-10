const dns = require('node:dns').promises;
const net = require('node:net');

const DEFAULT_TIMEOUT_MS = 9000;
const HTML_TEXT_BYTES = 64 * 1024;
const MAX_PUBLIC_REDIRECTS = 3;
const USER_AGENT = 'BlueSwallowSociety/1.0 (+https://blueswallow.co.in)';

const defaultDnsLookup = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });
let dnsLookup = defaultDnsLookup;

async function probePublicUrl(targetUrl, redirectsRemaining = MAX_PUBLIC_REDIRECTS) {
  const url = new URL(targetUrl);
  assertPublicUrlObject(url);
  await assertPublicResolvableHostname(url.hostname);

  const result = await fetchText(url.toString(), {
    timeout: 12000,
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
    await assertPublicResolvableHostname(nextUrl.hostname);
    return probePublicUrl(nextUrl.toString(), redirectsRemaining - 1);
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
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('::ffff:')) {
      const maybeV4 = lower.slice('::ffff:'.length);
      return net.isIP(maybeV4) === 4 ? isPrivateIp(maybeV4) : true;
    }
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
    return;
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

  for (const answer of answers) {
    const address = typeof answer === 'string' ? answer : answer?.address;
    if (!address || isPrivateIp(address)) {
      throw publicTargetError('DNS resolution returned a private, local, or reserved address.');
    }
  }
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

async function fetchText(url, { timeout = DEFAULT_TIMEOUT_MS, headers = {}, method = 'GET', redirect = 'follow' } = {}) {
  const response = await fetchWithTimeout(url, { timeout, headers, method, redirect });
  const body = await readResponseText(response, HTML_TEXT_BYTES);
  return {
    ok: response.ok,
    status: response.status,
    url: response.url,
    headers: response.headers,
    body,
  };
}

async function fetchWithTimeout(url, { timeout, headers, method, redirect = 'follow' }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      method,
      signal: controller.signal,
      headers,
      redirect,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseText(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    const nextTotal = total + value.byteLength;
    if (nextTotal > maxBytes) {
      chunks.push(Buffer.from(value.slice(0, maxBytes - total)));
      total = maxBytes;
      break;
    }
    chunks.push(Buffer.from(value));
    total = nextTotal;
  }

  try {
    await reader.cancel();
  } catch {
    // no-op
  }

  return Buffer.concat(chunks).toString('utf8');
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
  assertPublicResolvableHostname,
  assertPublicTarget,
  assertPublicUrlObject,
  isLikelyIpAddress,
  isPrivateIp,
  isSafePublicUrl,
  isUnsafeHostName,
  probePublicUrl,
  publicTargetError,
  setDnsLookupForTests(fn) {
    dnsLookup = fn;
  },
  resetDnsLookupForTests() {
    dnsLookup = defaultDnsLookup;
  },
};
