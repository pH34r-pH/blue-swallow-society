const net = require('node:net');
const { assertPublicTarget, isLikelyIpAddress, isPrivateIp, isUnsafeHostName } = require('./safety');

function classifyTarget(rawQuery, requestedMode) {
  const query = toCleanString(rawQuery).trim();
  const lowerMode = toCleanString(requestedMode).trim().toLowerCase();
  const normalizedMode = ['auto', 'domain', 'url', 'ip', 'handle', 'email'].includes(lowerMode)
    ? lowerMode
    : 'auto';

  if (!query) {
    return {
      kind: 'overview',
      label: 'Overview',
      normalized: '',
      summary: 'Live public signals',
      headline: 'Overview loaded',
      signalQuery: '',
    };
  }

  if (normalizedMode !== 'auto') {
    return classifyByMode(query, normalizedMode);
  }

  if (looksLikeEmail(query)) {
    return {
      kind: 'email',
      label: 'Email address',
      normalized: query.trim().toLowerCase(),
      summary: 'Mailbox + domain intelligence',
      headline: `Email scan for ${query}`,
      signalQuery: query,
    };
  }

  if (looksLikeUrl(query)) {
    const url = normalizeUrl(query);
    return {
      kind: 'url',
      label: 'URL',
      normalized: url,
      summary: 'URL + domain intelligence',
      headline: `URL scan for ${new URL(url).hostname}`,
      signalQuery: new URL(url).hostname,
    };
  }

  if (looksLikeIp(query)) {
    assertPublicTarget(query, 'ip');
    return {
      kind: 'ip',
      label: 'IP address',
      normalized: query,
      summary: 'Network intelligence and geolocation',
      headline: `IP scan for ${query}`,
      signalQuery: query,
    };
  }

  if (looksLikeDomain(query)) {
    const host = normalizeDomain(query);
    return {
      kind: 'domain',
      label: 'Domain',
      normalized: host,
      summary: 'Domain, DNS, archive, and public traces',
      headline: `Domain scan for ${host}`,
      signalQuery: host,
    };
  }

  const handle = normalizeHandle(query);
  return {
    kind: 'handle',
    label: 'Handle',
    normalized: handle,
    summary: 'Public username traces',
    headline: `Handle scan for ${handle}`,
    signalQuery: handle,
  };
}

function classifyByMode(query, mode) {
  switch (mode) {
    case 'domain': {
      const normalized = normalizeDomain(query);
      return {
        kind: 'domain',
        label: 'Domain',
        normalized,
        summary: 'Domain, DNS, archive, and public traces',
        headline: `Domain scan for ${normalized}`,
        signalQuery: normalized,
      };
    }
    case 'url': {
      const normalized = normalizeUrl(query);
      return {
        kind: 'url',
        label: 'URL',
        normalized,
        summary: 'URL + domain intelligence',
        headline: `URL scan for ${new URL(normalized).hostname}`,
        signalQuery: new URL(normalized).hostname,
      };
    }
    case 'ip':
      assertPublicTarget(query, 'ip');
      return {
        kind: 'ip',
        label: 'IP address',
        normalized: query,
        summary: 'Network intelligence and geolocation',
        headline: `IP scan for ${query}`,
        signalQuery: query,
      };
    case 'email':
      return {
        kind: 'email',
        label: 'Email address',
        normalized: query.trim().toLowerCase(),
        summary: 'Mailbox + domain intelligence',
        headline: `Email scan for ${query}`,
        signalQuery: query,
      };
    case 'handle': {
      const normalized = normalizeHandle(query);
      return {
        kind: 'handle',
        label: 'Handle',
        normalized,
        summary: 'Public username traces',
        headline: `Handle scan for ${normalized}`,
        signalQuery: normalized,
      };
    }
    default:
      return classifyTarget(query, 'auto');
  }
}

function looksLikeIp(value) {
  if (!net.isIP(value)) {
    return false;
  }
  return !isPrivateIp(value);
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function looksLikeUrl(value) {
  return /^https?:\/\//i.test(value) || (/^[^\s]+\.[^\s]+$/.test(value) && value.includes('/'));
}

function looksLikeDomain(value) {
  if (!value || /\s/.test(value)) {
    return false;
  }
  if (value.startsWith('@')) {
    return false;
  }
  const host = value.replace(/^https?:\/\//i, '').split('/')[0];
  return host.includes('.') && !isLikelyIpAddress(host) && !isUnsafeHostName(host);
}

function normalizeDomain(value) {
  let host = value.trim().toLowerCase();
  host = host.replace(/^https?:\/\//i, '');
  host = host.split('/')[0];
  host = host.replace(/^www\./, '');
  if (host.endsWith('.')) {
    host = host.slice(0, -1);
  }
  if (isUnsafeHostName(host)) {
    const err = new Error('Private or local targets are not allowed.');
    err.statusCode = 400;
    throw err;
  }
  return host;
}

function normalizeUrl(value) {
  let url = value.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  const parsed = new URL(url);
  if (isUnsafeHostName(parsed.hostname)) {
    const err = new Error('Private or local targets are not allowed.');
    err.statusCode = 400;
    throw err;
  }
  return parsed.toString();
}

function normalizeHandle(value) {
  return value.trim().replace(/^@+/, '').replace(/\s+/g, '_');
}

function toCleanString(value) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

module.exports = {
  classifyByMode,
  classifyTarget,
  looksLikeDomain,
  looksLikeEmail,
  looksLikeIp,
  looksLikeUrl,
  normalizeDomain,
  normalizeHandle,
  normalizeUrl,
};
