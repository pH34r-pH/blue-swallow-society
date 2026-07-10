const crypto = require('node:crypto');
const net = require('node:net');
const dns = require('node:dns').promises;
const { requireOperatorToken } = require('../_lib/operator-auth');

const USER_AGENT = 'BlueSwallowSociety/1.0 (+https://blueswallow.co.in)';
const DEFAULT_TIMEOUT_MS = 9000;
const JSON_TEXT_BYTES = 256 * 1024;
const HTML_TEXT_BYTES = 64 * 1024;
const MAX_PUBLIC_REDIRECTS = 3;
const defaultDnsLookup = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });
let dnsLookup = defaultDnsLookup;
const COMMON_SOURCES = [
  'RDAP / WHOIS',
  'DNS',
  'crt.sh',
  'Wayback Machine',
  'GitHub',
  'Reddit',
  'Wikipedia',
  'Hacker News',
];

module.exports = async function (context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) {
    return;
  }

  const body = req?.body && typeof req.body === 'object' ? req.body : {};
  const query = toCleanString(body.query ?? '').trim();
  const requestedMode = toCleanString(body.mode ?? 'auto')
    .trim()
    .toLowerCase();
  const limit = clampNumber(parseInt(body.limit ?? '5', 10), 1, 10);

  try {
    const payload = query
      ? await buildScanPayload({ query, requestedMode, limit })
      : await buildOverviewPayload({ limit });

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: {
        ok: true,
        ...payload,
      },
    };
  } catch (error) {
    context.log.error(`OSINT lookup failed: ${error.stack || error.message}`);
    context.res = {
      status: error.statusCode || 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: {
        ok: false,
        error: error.message || 'OSINT lookup failed',
      },
    };
  }
};

async function buildOverviewPayload({ limit }) {
  const signals = await fetchSignals({ query: '', limit });
  const now = new Date().toISOString();

  return {
    mode: 'overview',
    query: '',
    requestedMode: 'overview',
    detectedType: 'overview',
    detectedLabel: 'Live overview',
    normalizedQuery: '',
    summary: 'Public signals from HN and Reddit, ready for a target scan.',
    metrics: {
      sourceCount: signals.length,
      findingCount: signals.reduce((total, feed) => total + feed.items.length, 0),
      updatedAt: now,
      headline: 'Overview loaded',
    },
    supportedSources: COMMON_SOURCES,
    sources: [
      { name: 'Hacker News', status: 'live', detail: 'Top stories with query-aware filtering.' },
      { name: 'Reddit worldnews', status: 'live', detail: 'Hot posts surfaced as public signal feed.' },
    ],
    sections: {
      profile: [
        { label: 'Mode', value: 'Overview', detail: 'No target entered yet.' },
        { label: 'Scope', value: 'Public signal preview', detail: 'This is the default dashboard state.' },
        { label: 'Sources', value: COMMON_SOURCES.join(' · '), detail: 'Common sources used by many OSINT dashboards.' },
      ],
      network: [
        { label: 'Focus', value: 'Type a domain, URL, IP, email, or handle', detail: 'The dashboard fans out automatically.' },
      ],
      social: [
        { label: 'Live feeds', value: 'Hacker News + Reddit', detail: 'Public streams refresh on each scan.' },
      ],
      archive: [
        { label: 'Archive tools', value: 'crt.sh + Wayback', detail: 'Activated when the target looks like a domain or URL.' },
      ],
    },
    signals,
    sourceDigest: COMMON_SOURCES,
  };
}

async function buildScanPayload({ query, requestedMode, limit }) {
  const detected = classifyTarget(query, requestedMode);
  const signalsPromise = fetchSignals({ query: detected.signalQuery || query, limit });

  let payload;
  switch (detected.kind) {
    case 'ip':
      payload = await buildIpPayload({ query, detected, limit });
      break;
    case 'email':
      payload = await buildEmailPayload({ query, detected, limit });
      break;
    case 'url':
      payload = await buildUrlPayload({ query, detected, limit });
      break;
    case 'domain':
      payload = await buildDomainPayload({ query, detected, limit });
      break;
    case 'handle':
    default:
      payload = await buildHandlePayload({ query, detected, limit });
      break;
  }

  const signals = await signalsPromise;
  const now = new Date().toISOString();
  const findingCount = countFindings(payload.sections) + signals.reduce((total, feed) => total + feed.items.length, 0);

  return {
    mode: requestedMode === 'auto' ? detected.kind : requestedMode,
    query,
    requestedMode,
    detectedType: detected.kind,
    detectedLabel: detected.label,
    normalizedQuery: detected.normalized,
    summary: detected.summary,
    metrics: {
      sourceCount: payload.sources.length + signals.length,
      findingCount,
      updatedAt: now,
      headline: detected.headline,
    },
    supportedSources: COMMON_SOURCES,
    sources: payload.sources,
    sections: payload.sections,
    signals,
    sourceDigest: COMMON_SOURCES,
  };
}

async function buildDomainPayload({ query, detected, limit }) {
  const host = detected.normalized;
  const httpsUrl = `https://${host}/`;
  const safeTarget = isSafePublicUrl(httpsUrl) ? httpsUrl : null;
  const [rdap, dns, crtSh, wayback, probe, github, reddit, wikipedia] = await Promise.all([
    fetchJson(`https://rdap.org/domain/${encodeURIComponent(host)}`).catch((error) => errorToResult(error)),
    fetchDnsPack(host).catch((error) => errorToResult(error)),
    fetchCrtSh(host).catch((error) => errorToResult(error)),
    fetchWayback(safeTarget || httpsUrl).catch((error) => errorToResult(error)),
    safeTarget ? probePublicUrl(safeTarget).catch((error) => errorToResult(error)) : Promise.resolve(null),
    fetchGithubUsers(host).catch((error) => errorToResult(error)),
    fetchRedditSearch(host).catch((error) => errorToResult(error)),
    fetchWikipediaSearch(host).catch((error) => errorToResult(error)),
  ]);

  const sources = [
    sourceCard('RDAP / WHOIS', rdap, 'registrar / status / nameservers'),
    sourceCard('DNS', dns, 'A / AAAA / MX / NS / TXT / CNAME'),
    sourceCard('crt.sh', crtSh, 'certificate transparency results'),
    sourceCard('Wayback Machine', wayback, 'archived snapshot availability'),
    sourceCard('Web probe', probe, 'title / headers / final URL'),
  ];

  return {
    sources,
    sections: {
      profile: [
        { label: 'Target', value: query, detail: 'Domain scan mode' },
        { label: 'Canonical host', value: host, detail: 'Hostname extracted from the input.' },
        { label: 'Scan surface', value: 'Domain / URL', detail: 'Commonly used by web-check style dashboards.' },
        { label: 'Safety', value: safeTarget ? 'Public URL probe enabled' : 'Probe skipped', detail: safeTarget ? 'HTTPS probe attempted against the public host.' : 'Unsafe or unsupported URL.' },
      ],
      network: [
        ...flattenDomainDns(dns),
        ...flattenRdap(rdap),
        ...flattenProbe(probe),
      ],
      social: [
        ...flattenGithubUsers(github),
        ...flattenReddit(reddit),
        ...flattenWikipedia(wikipedia),
      ],
      archive: [
        ...flattenCrtSh(crtSh),
        ...flattenWayback(wayback),
      ],
    },
    headline: `Domain scan for ${host}`,
    summary: `Domain and URL analysis with DNS, RDAP, certificate transparency, archive, and public search sources.`,
  };
}

async function buildUrlPayload({ query, detected, limit }) {
  const url = detected.normalized;
  const host = new URL(url).hostname;
  const safeTarget = isSafePublicUrl(url) ? url : null;
  const [domainPayload, probe] = await Promise.all([
    buildDomainPayload({ query: host, detected: { ...detected, normalized: host }, limit }),
    safeTarget ? probePublicUrl(url).catch((error) => errorToResult(error)) : Promise.resolve(null),
  ]);

  return {
    sources: [
      ...domainPayload.sources,
      sourceCard('URL probe', probe, 'title / content-type / server'),
    ],
    sections: {
      ...domainPayload.sections,
      profile: [
        { label: 'Target', value: query, detail: 'URL scan mode' },
        { label: 'Canonical URL', value: url, detail: 'Normalized from the input.' },
        ...domainPayload.sections.profile,
      ],
      network: domainPayload.sections.network,
    },
    headline: `URL scan for ${host}`,
    summary: 'Domain intelligence plus a safe public URL probe for headers and title.',
  };
}

async function buildIpPayload({ query, detected, limit }) {
  assertPublicTarget(detected.normalized, 'ip');
  const ip = detected.normalized;
  const reverseName = ipToReverseDnsName(ip);
  const [rdap, ipwhois, ptr, github, reddit, wikipedia] = await Promise.all([
    fetchJson(`https://rdap.org/ip/${encodeURIComponent(ip)}`).catch((error) => errorToResult(error)),
    fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`).catch((error) => errorToResult(error)),
    fetchDnsQuery(reverseName, 'PTR').catch((error) => errorToResult(error)),
    fetchGithubUsers(ip).catch((error) => errorToResult(error)),
    fetchRedditSearch(ip).catch((error) => errorToResult(error)),
    fetchWikipediaSearch(ip).catch((error) => errorToResult(error)),
  ]);

  return {
    sources: [
      sourceCard('RDAP / WHOIS', rdap, 'registration and network owner details'),
      sourceCard('IPWho.is', ipwhois, 'geo / ASN / abuse summary'),
      sourceCard('PTR lookup', ptr, 'reverse DNS'),
    ],
    sections: {
      profile: [
        { label: 'Target', value: query, detail: 'IP scan mode' },
        { label: 'Canonical IP', value: ip, detail: 'Validated public address.' },
        { label: 'Reverse DNS', value: reverseName, detail: 'PTR lookup candidate.' },
      ],
      network: [
        ...flattenIpwhois(ipwhois),
        ...flattenRdap(rdap),
        ...flattenPtr(ptr),
      ],
      social: [
        ...flattenGithubUsers(github),
        ...flattenReddit(reddit),
        ...flattenWikipedia(wikipedia),
      ],
      archive: [
        { label: 'Archive note', value: 'IP targets do not normally have archive coverage', detail: 'Searches remain in the public signal lane.' },
      ],
    },
    headline: `IP scan for ${ip}`,
    summary: 'Network intelligence, reverse DNS, geolocation, and public search sources.',
  };
}

async function buildEmailPayload({ query, detected, limit }) {
  const email = detected.normalized;
  const domain = email.split('@')[1] || '';
  const gravatarHash = crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
  const gravatarUrl = `https://www.gravatar.com/avatar/${gravatarHash}?d=404`;
  const safeGravatar = isSafePublicUrl(gravatarUrl) ? gravatarUrl : null;
  const [domainPayload, gravatar, github, reddit, wikipedia] = await Promise.all([
    domain
      ? buildDomainPayload({ query: domain, detected: { kind: 'domain', normalized: domain, summary: 'Email domain analysis', headline: `Domain scan for ${domain}`, label: 'Domain / URL', signalQuery: domain }, limit })
      : Promise.resolve(null),
    safeGravatar ? probeGravatar(safeGravatar).catch((error) => errorToResult(error)) : Promise.resolve(null),
    fetchGithubUsers(email).catch((error) => errorToResult(error)),
    fetchRedditSearch(email).catch((error) => errorToResult(error)),
    fetchWikipediaSearch(email).catch((error) => errorToResult(error)),
  ]);

  return {
    sources: [
      sourceCard('Gravatar', gravatar, 'avatar existence check'),
      ...(domainPayload ? domainPayload.sources : []),
    ],
    sections: {
      profile: [
        { label: 'Target', value: query, detail: 'Email scan mode' },
        { label: 'Canonical email', value: email, detail: 'Normalized and lowercased.' },
        { label: 'Mailbox domain', value: domain || '—', detail: 'Domain intelligence runs if a domain is present.' },
        { label: 'Avatar probe', value: safeGravatar ? 'Gravatar check attempted' : 'Probe skipped', detail: safeGravatar ? 'A 404/200 response indicates whether a public avatar exists.' : 'Unsafe or unsupported URL.' },
      ],
      network: [
        ...(domainPayload ? domainPayload.sections.network : []),
        ...flattenGravatar(gravatar),
      ],
      social: [
        ...flattenGithubUsers(github),
        ...flattenReddit(reddit),
        ...flattenWikipedia(wikipedia),
      ],
      archive: [
        ...(domainPayload ? domainPayload.sections.archive : []),
      ],
    },
    headline: `Email scan for ${email}`,
    summary: 'Mailbox domain intelligence plus Gravatar and public search traces.',
  };
}

async function buildHandlePayload({ query, detected, limit }) {
  const handle = detected.normalized;
  const [githubUsers, githubRepos, reddit, wikipedia] = await Promise.all([
    fetchGithubUsers(handle).catch((error) => errorToResult(error)),
    fetchGithubRepos(handle).catch((error) => errorToResult(error)),
    fetchRedditSearch(handle).catch((error) => errorToResult(error)),
    fetchWikipediaSearch(handle).catch((error) => errorToResult(error)),
  ]);

  return {
    sources: [
      sourceCard('GitHub users', githubUsers, 'username search'),
      sourceCard('GitHub repositories', githubRepos, 'repository search'),
      sourceCard('Reddit', reddit, 'public mention search'),
      sourceCard('Wikipedia', wikipedia, 'public knowledge search'),
    ],
    sections: {
      profile: [
        { label: 'Target', value: query, detail: 'Handle / username scan mode' },
        { label: 'Normalized handle', value: handle, detail: 'Leading @ removed if present.' },
        { label: 'Search surface', value: 'GitHub · Reddit · Wikipedia', detail: 'Common source mix for OSINT username scans.' },
      ],
      network: [
        { label: 'Network tools', value: 'Not applicable', detail: 'This target type does not map cleanly to RDAP or DNS.' },
      ],
      social: [
        ...flattenGithubUsers(githubUsers),
        ...flattenGithubRepos(githubRepos),
        ...flattenReddit(reddit),
        ...flattenWikipedia(wikipedia),
      ],
      archive: [
        { label: 'Archive note', value: 'Username scans rely on platform search rather than web archive tools.', detail: 'Use the social traces above for follow-up.' },
      ],
    },
    headline: `Handle scan for ${handle}`,
    summary: 'Username search across public social and code sources.',
  };
}

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
    case 'domain':
      return {
        kind: 'domain',
        label: 'Domain',
        normalized: normalizeDomain(query),
        summary: 'Domain, DNS, archive, and public traces',
        headline: `Domain scan for ${normalizeDomain(query)}`,
        signalQuery: normalizeDomain(query),
      };
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
    case 'handle':
      return {
        kind: 'handle',
        label: 'Handle',
        normalized: normalizeHandle(query),
        summary: 'Public username traces',
        headline: `Handle scan for ${normalizeHandle(query)}`,
        signalQuery: normalizeHandle(query),
      };
    default:
      return classifyTarget(query, 'auto');
  }
}

async function fetchSignals({ query, limit = 5 }) {
  const [hn, reddit] = await Promise.all([
    fetchHackerNews(query, limit).catch((error) => errorToResult(error)),
    fetchRedditWorldNews(limit).catch((error) => errorToResult(error)),
  ]);

  return [hn, reddit].filter(Boolean);
}

async function fetchHackerNews(query, limit) {
  const base = query
    ? `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`
    : `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=${limit}`;
  const result = await fetchJson(base, {
    timeout: 8000,
    headers: { 'User-Agent': USER_AGENT },
  });

  const hits = Array.isArray(result.body?.hits) ? result.body.hits : [];
  return {
    source: 'Hacker News',
    kind: 'feed',
    items: hits.slice(0, limit).map((hit) => ({
      title: hit.title || hit.story_title || 'Untitled',
      url: hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      detail: [
        hit.author ? `by ${hit.author}` : null,
        typeof hit.points === 'number' ? `${hit.points} points` : null,
        hit.created_at ? formatRelativeTime(hit.created_at) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })),
  };
}

async function fetchRedditWorldNews(limit) {
  const result = await fetchJson(`https://www.reddit.com/r/worldnews/hot.json?limit=${limit}`, {
    timeout: 8000,
    headers: { 'User-Agent': USER_AGENT },
  });

  const children = Array.isArray(result.body?.data?.children) ? result.body.data.children : [];
  return {
    source: 'Reddit worldnews',
    kind: 'feed',
    items: children.slice(0, limit).map((child) => {
      const data = child.data || {};
      return {
        title: data.title || 'Untitled',
        url: `https://www.reddit.com${data.permalink || ''}`,
        detail: [
          data.author ? `u/${data.author}` : null,
          typeof data.score === 'number' ? `${data.score} score` : null,
          data.created_utc ? formatRelativeTime(new Date(data.created_utc * 1000).toISOString()) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }),
  };
}

async function fetchGithubUsers(query) {
  const result = await fetchJson(`https://api.github.com/search/users?q=${encodeURIComponent(query)}+in:login&per_page=5`, {
    timeout: 9000,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
  });

  return {
    totalCount: result.body?.total_count ?? 0,
    items: Array.isArray(result.body?.items)
      ? result.body.items.slice(0, 5).map((item) => ({
          label: item.login,
          value: item.html_url,
          detail: [item.type, item.score ? `score ${item.score}` : null].filter(Boolean).join(' · '),
          href: item.html_url,
        }))
      : [],
  };
}

async function fetchGithubRepos(query) {
  const result = await fetchJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+in:name,description&sort=stars&order=desc&per_page=5`, {
    timeout: 9000,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
  });

  return {
    totalCount: result.body?.total_count ?? 0,
    items: Array.isArray(result.body?.items)
      ? result.body.items.slice(0, 5).map((item) => ({
          label: item.full_name,
          value: item.html_url,
          detail: [item.language, typeof item.stargazers_count === 'number' ? `${item.stargazers_count} stars` : null, item.description || null]
            .filter(Boolean)
            .join(' · '),
          href: item.html_url,
        }))
      : [],
  };
}

async function fetchRedditSearch(query) {
  const result = await fetchJson(`https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&t=all&limit=5`, {
    timeout: 9000,
    headers: { 'User-Agent': USER_AGENT },
  });

  const children = Array.isArray(result.body?.data?.children) ? result.body.data.children : [];
  return {
    totalCount: children.length,
    items: children.slice(0, 5).map((child) => {
      const data = child.data || {};
      return {
        label: data.subreddit ? `r/${data.subreddit}` : 'Reddit',
        value: data.title || 'Untitled',
        detail: [data.author ? `u/${data.author}` : null, data.permalink ? 'post' : null].filter(Boolean).join(' · '),
        href: data.permalink ? `https://www.reddit.com${data.permalink}` : null,
      };
    }),
  };
}

async function fetchWikipediaSearch(query) {
  const result = await fetchJson(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json&origin=*`, {
    timeout: 9000,
    headers: { 'User-Agent': USER_AGENT },
  });

  const titles = Array.isArray(result.body?.[1]) ? result.body[1] : [];
  const descriptions = Array.isArray(result.body?.[2]) ? result.body[2] : [];
  const links = Array.isArray(result.body?.[3]) ? result.body[3] : [];

  return {
    totalCount: titles.length,
    items: titles.slice(0, 5).map((title, index) => ({
      label: 'Wikipedia',
      value: title,
      detail: descriptions[index] || 'Open encyclopedia result',
      href: links[index] || null,
    })),
  };
}

async function fetchDnsPack(host) {
  const recordTypes = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME'];
  const packs = await Promise.all(recordTypes.map((type) => fetchDnsQuery(host, type).catch((error) => errorToResult(error))));
  return {
    host,
    recordTypes,
    packs,
  };
}

async function fetchDnsQuery(host, type) {
  const result = await fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=${encodeURIComponent(type)}`, {
    timeout: 8000,
    headers: { 'User-Agent': USER_AGENT },
  });

  const answers = Array.isArray(result.body?.Answer) ? result.body.Answer : [];
  return {
    type,
    answers: answers.slice(0, 5).map((answer) => answer.data).filter(Boolean),
    rawCount: answers.length,
  };
}

async function fetchCrtSh(host) {
  const result = await fetchText(`https://crt.sh/?q=${encodeURIComponent(`%.${host}`)}&output=json`, {
    timeout: 12000,
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!result.ok) {
    throw new Error(`crt.sh returned HTTP ${result.status}`);
  }

  const raw = result.body.trim();
  if (!raw) {
    return { certificates: [] };
  }

  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const seen = new Set();
  const certificates = [];

  for (const row of rows) {
    const names = toCleanString(row.name_value || '').split('\n').map((value) => value.trim()).filter(Boolean);
    const primary = names[0] || row.common_name || row.id || '';
    if (!primary || seen.has(primary)) {
      continue;
    }
    seen.add(primary);
    certificates.push({
      name: primary,
      issuer: toCleanString(row.issuer_name || '').replace(/\s+/g, ' ').trim(),
      notBefore: row.not_before || null,
      notAfter: row.not_after || null,
    });
    if (certificates.length >= 10) {
      break;
    }
  }

  return { certificates };
}

async function fetchWayback(targetUrl) {
  const result = await fetchJson(`https://archive.org/wayback/available?url=${encodeURIComponent(targetUrl)}`, {
    timeout: 8000,
    headers: { 'User-Agent': USER_AGENT },
  });

  const snapshot = result.body?.archived_snapshots?.closest || null;
  return {
    url: targetUrl,
    snapshot: snapshot
      ? {
          available: snapshot.available,
          status: snapshot.status,
          url: snapshot.url,
          timestamp: snapshot.timestamp,
        }
      : null,
  };
}

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

async function probeGravatar(targetUrl) {
  const result = await fetchText(targetUrl, {
    method: 'HEAD',
    timeout: 8000,
    headers: { 'User-Agent': USER_AGENT },
  });

  return {
    status: result.status,
    available: result.status === 200,
    headers: pickResponseHeaders(result.headers),
  };
}

function sourceCard(name, result, detail) {
  if (result && result.ok === false) {
    return {
      name,
      status: 'error',
      detail: result.error || detail,
    };
  }

  return {
    name,
    status: result ? 'live' : 'skipped',
    detail,
  };
}

function flattenRdap(result) {
  if (!result || result.ok === false) {
    return [makeRow('RDAP', 'Unavailable', result?.error || 'The lookup failed or timed out.')];
  }

  const body = result.body || {};
  const status = arrayToCompact(body.status);
  const handle = body.handle || body.ldhName || body.name || '—';
  const nameservers = Array.isArray(body.nameservers) ? body.nameservers.map((ns) => ns.ldhName || ns.name).filter(Boolean) : [];
  const events = Array.isArray(body.events)
    ? body.events.slice(0, 3).map((event) => `${event.eventAction || 'event'} ${event.eventDate || ''}`.trim()).filter(Boolean)
    : [];

  return [
    makeRow('Handle', handle, status || 'Registry handle / entity name'),
    makeRow('Status', status || '—', 'RDAP status flags'),
    makeRow('Nameservers', nameservers.slice(0, 4).join(' · ') || '—', 'Registry-provided nameservers'),
    makeRow('Events', events.join(' · ') || '—', 'Registration / update history'),
  ];
}

function flattenDomainDns(result) {
  if (!result || result.ok === false) {
    return [makeRow('DNS', 'Unavailable', result?.error || 'The lookup failed or timed out.')];
  }

  const packs = Array.isArray(result.body?.packs) ? result.body.packs : [];
  const rows = [];

  for (const pack of packs) {
    if (!pack || !pack.type) continue;
    const label = pack.type;
    const answers = Array.isArray(pack.answers) ? pack.answers : [];
    rows.push(makeRow(label, answers.slice(0, 4).join(' · ') || '—', `${pack.rawCount || 0} record(s)`));
  }

  return rows.length ? rows : [makeRow('DNS', 'No records returned', 'The public resolver returned an empty answer set.')];
}

function flattenProbe(result) {
  if (!result) {
    return [];
  }
  if (result.ok === false) {
    return [makeRow('Web probe', 'Unavailable', result.error || 'The probe failed.')];
  }

  const body = result.body || {};
  const headers = body.headers || {};
  const rows = [
    makeRow('Title', body.title || '—', 'HTML title from the public URL'),
    makeRow('Status', body.status ? String(body.status) : '—', `Final URL: ${body.finalUrl || '—'}`),
  ];

  const headerBits = [headers['content-type'], headers.server, headers['x-powered-by']].filter(Boolean).join(' · ');
  rows.push(makeRow('Headers', headerBits || '—', 'Selected response headers'));
  return rows;
}

function flattenIpwhois(result) {
  if (!result || result.ok === false) {
    return [makeRow('IP intelligence', 'Unavailable', result?.error || 'The lookup failed or timed out.')];
  }

  const body = result.body || {};
  const rows = [
    makeRow('IPWho.is', body.success === false ? 'Unavailable' : [body.country || null, body.city || null].filter(Boolean).join(' · ') || '—', [body.asn || null, body.org || null].filter(Boolean).join(' · ') || 'ASN / org summary'),
  ];
  if (body.connection) {
    rows.push(makeRow('Connection', [body.connection.isp || null, body.connection.domain || null].filter(Boolean).join(' · ') || '—', 'ISP and domain details'));
  }
  if (body.location) {
    rows.push(makeRow('Location', [body.latitude, body.longitude].filter((value) => value !== null && value !== undefined).join(', ') || '—', [body.timezone?.id || null, body.flag?.emoji || null].filter(Boolean).join(' · ') || 'Geolocation'));
  }
  return rows;
}

function flattenPtr(result) {
  if (!result || result.ok === false) {
    return [makeRow('PTR', 'Unavailable', result?.error || 'The lookup failed or timed out.')];
  }

  const answers = Array.isArray(result.answers) ? result.answers : [];
  return [makeRow('PTR', answers.slice(0, 4).join(' · ') || '—', `${result.rawCount || 0} record(s)` )];
}

function flattenGravatar(result) {
  if (!result || result.ok === false) {
    return [makeRow('Gravatar', 'Unavailable', result?.error || 'The lookup failed or timed out.')];
  }

  return [
    makeRow('Avatar', result.body?.available ? 'Public avatar found' : 'No public avatar found', `HTTP ${result.body?.status ?? '—'}`),
  ];
}

function flattenCrtSh(result) {
  if (!result || result.ok === false) {
    return [makeRow('crt.sh', 'Unavailable', result?.error || 'The lookup failed or timed out.')];
  }

  const certificates = Array.isArray(result.body?.certificates) ? result.body.certificates : [];
  if (!certificates.length) {
    return [makeRow('crt.sh', 'No matches', 'No certificate transparency entries surfaced.')];
  }

  return certificates.slice(0, 5).map((cert) => makeRow(cert.name || 'Certificate', [cert.notBefore || null, cert.notAfter || null].filter(Boolean).join(' → ') || '—', cert.issuer || 'Certificate transparency entry'));
}

function flattenWayback(result) {
  if (!result || result.ok === false) {
    return [makeRow('Wayback', 'Unavailable', result?.error || 'The lookup failed or timed out.')];
  }

  const snapshot = result.body?.snapshot;
  if (!snapshot) {
    return [makeRow('Wayback', 'No snapshot found', 'The archive.org availability API returned empty.')];
  }

  return [
    makeRow('Snapshot', snapshot.url || '—', snapshot.timestamp || 'Archived copy available'),
  ];
}

function flattenGithubUsers(result) {
  if (!result || result.ok === false) {
    return [makeRow('GitHub users', 'Unavailable', result?.error || 'The lookup failed or timed out.')];
  }

  const items = Array.isArray(result.body?.items) ? result.body.items : result.items || [];
  if (!items.length) {
    return [makeRow('GitHub users', 'No matches', 'No public profile results were returned.')];
  }

  return items.slice(0, 5).map((item) => makeRow(item.label || item.login || 'GitHub user', item.value || item.html_url || '—', item.detail || 'Public profile result'));
}

function flattenGithubRepos(result) {
  if (!result || result.ok === false) {
    return [makeRow('GitHub repos', 'Unavailable', result?.error || 'The lookup failed or timed out.')];
  }

  const items = Array.isArray(result.body?.items) ? result.body.items : result.items || [];
  if (!items.length) {
    return [makeRow('GitHub repos', 'No matches', 'No repository results were returned.')];
  }

  return items.slice(0, 5).map((item) => makeRow(item.label || item.full_name || 'Repository', item.value || item.html_url || '—', item.detail || 'Public repository result'));
}

function flattenReddit(result) {
  if (!result || result.ok === false) {
    return [makeRow('Reddit', 'Unavailable', result?.error || 'The lookup failed or timed out.')];
  }

  const items = Array.isArray(result.body?.items) ? result.body.items : result.items || [];
  if (!items.length) {
    return [makeRow('Reddit', 'No matches', 'No public posts were returned.')];
  }

  return items.slice(0, 5).map((item) => makeRow(item.label || 'Reddit', item.value || '—', item.detail || 'Public discussion result'));
}

function flattenWikipedia(result) {
  if (!result || result.ok === false) {
    return [makeRow('Wikipedia', 'Unavailable', result?.error || 'The lookup failed or timed out.')];
  }

  const items = Array.isArray(result.body?.items) ? result.body.items : result.items || [];
  if (!items.length) {
    return [makeRow('Wikipedia', 'No matches', 'No encyclopedia results were returned.')];
  }

  return items.slice(0, 5).map((item) => makeRow(item.value || item.label || 'Wikipedia', item.href || '—', item.detail || 'Open encyclopedia result'));
}

function countFindings(sections) {
  return Object.values(sections || {}).reduce((total, rows) => total + (Array.isArray(rows) ? rows.length : 0), 0);
}

function makeRow(label, value, detail, href = null) {
  return { label, value, detail, href };
}

function errorToResult(error) {
  return {
    ok: false,
    error: error && error.message ? error.message : String(error),
  };
}

function toCleanString(value) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
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
    const err = new Error('Private or invalid IP targets are not allowed.');
    err.statusCode = 400;
    throw err;
  }
  if (isUnsafeHostName(value)) {
    const err = new Error('Private or local targets are not allowed.');
    err.statusCode = 400;
    throw err;
  }
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

function ipToReverseDnsName(ip) {
  if (net.isIP(ip) === 4) {
    return `${ip.split('.').reverse().join('.')}.in-addr.arpa`;
  }

  const expanded = expandIpv6(ip);
  const nibbles = expanded.replace(/:/g, '').split('').reverse().join('.');
  return `${nibbles}.ip6.arpa`;
}

function expandIpv6(value) {
  if (net.isIP(value) !== 6) {
    return value;
  }
  const segments = value.toLowerCase().split('::');
  const left = segments[0] ? segments[0].split(':') : [];
  const right = segments[1] ? segments[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  const middle = Array.from({ length: missing }, () => '0000');
  return [...left, ...middle, ...right]
    .map((segment) => segment.padStart(4, '0'))
    .join(':');
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

function arrayToCompact(value) {
  if (!Array.isArray(value)) {
    return '';
  }
  return value.filter(Boolean).join(' · ');
}

function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const diffSeconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

async function fetchJson(url, { timeout = DEFAULT_TIMEOUT_MS, headers = {}, method = 'GET' } = {}) {
  const response = await fetchWithTimeout(url, { timeout, headers, method });
  const text = await readResponseText(response, JSON_TEXT_BYTES);
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return {
    ok: response.ok,
    status: response.status,
    url: response.url,
    headers: response.headers,
    body,
  };
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


module.exports._internals = {
  isUnsafeHostName,
  isPrivateIp,
  probePublicUrl,
  assertPublicResolvableHostname,
  setDnsLookupForTests(fn) {
    dnsLookup = fn;
  },
  resetDnsLookupForTests() {
    dnsLookup = defaultDnsLookup;
  },
};
