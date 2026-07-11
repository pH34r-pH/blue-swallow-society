import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

export const DEFAULT_GREENFEED_SEED_CATALOG_URL = new URL('./greenfeed-seed-catalog.json', import.meta.url);
export const GREEN_SOURCE_CLASSES = Object.freeze(['green_public', 'green_owned', 'green_authorized']);
export const GREEN_SOURCE_CLASS_SET = new Set(GREEN_SOURCE_CLASSES);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_CACHE_TTL_SECONDS = 600;
const DEFAULT_UPDATE_CADENCE_SECONDS = 300;
const EARTH_RADIUS_METERS = 6_371_000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function requiredString(value, fieldName) {
  const normalized = stringValue(value);
  if (!normalized) throw new Error(`${fieldName} is required`);
  return normalized;
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function numberValue(value, fieldName, { min = -Infinity, max = Infinity, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== null) return fallback;
    throw new Error(`${fieldName} is required`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  return number;
}

function integerValue(value, fieldName, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = null } = {}) {
  const number = numberValue(value, fieldName, { min, max, fallback });
  return Math.trunc(number);
}

function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function arrayOfStrings(value) {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value])
    .map((item) => stringValue(item))
    .filter(Boolean);
}

function normalizeUrl(value, fieldName) {
  const raw = requiredString(value, fieldName);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`${fieldName} must use https`);
  if (parsed.username || parsed.password) throw new Error(`${fieldName} cannot include credentials`);
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error(`${fieldName} cannot point persistent Greenfeed jack-in sources at private/local/reserved hosts`);
  }
  return parsed.toString();
}

function isPrivateOrLocalHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.lan')) return true;
  const ipHost = normalizeIpHostname(host);
  const ipKind = isIP(ipHost);
  if (ipKind === 4) return isPrivateOrReservedIpv4(ipHost);
  if (ipKind === 6) return isPrivateOrReservedIpv6(ipHost);
  return false;
}

function normalizeIpHostname(host) {
  return host.replace(/^\[(.*)\]$/, '$1').split('%')[0];
}

function isPrivateOrReservedIpv4(host) {
  const octets = ipv4Octets(host);
  if (!octets) return true;
  return isPrivateOrReservedIpv4Octets(octets);
}

function ipv4Octets(host) {
  const octets = String(host).split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return octets;
}

function isPrivateOrReservedIpv4Octets(octets) {
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51)
    || (a === 203 && b === 0)
    || a >= 224;
}

function isPrivateOrReservedIpv6(host) {
  const hextets = expandIpv6Hextets(host);
  if (!hextets) return true;
  const [a, b, c] = hextets;
  const embeddedIpv4 = embeddedIpv4Octets(hextets);
  const embedsPrivateOrReservedIpv4 = embeddedIpv4 ? isPrivateOrReservedIpv4Octets(embeddedIpv4) : false;
  return isAllZero(hextets)
    || isIpv6Loopback(hextets)
    || (a & 0xfe00) === 0xfc00
    || (a & 0xffc0) === 0xfe80
    || (a & 0xffc0) === 0xfec0
    || (a & 0xff00) === 0xff00
    || (a === 0x2001 && b === 0x0db8)
    || (a === 0x2001 && b === 0x0002 && c === 0x0000)
    || (a === 0x2001 && (b & 0xfff0) === 0x0010)
    || (a === 0x2002 && isPrivateOrReservedIpv4Octets(ipv4OctetsFromHextets(b, c)))
    || embedsPrivateOrReservedIpv4;
}

function expandIpv6Hextets(host) {
  const normalized = normalizeIpHostname(host);
  const parseSide = (side) => {
    if (!side) return [];
    const parts = side.split(':');
    const hextets = [];
    for (const part of parts) {
      if (!part) return null;
      if (part.includes('.')) {
        const octets = ipv4Octets(part);
        if (!octets) return null;
        hextets.push(...ipv4Hextets(octets));
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
      hextets.push(Number.parseInt(part, 16));
    }
    return hextets;
  };

  if (normalized.includes('::')) {
    if (normalized.indexOf('::') !== normalized.lastIndexOf('::')) return null;
    const [leftRaw, rightRaw] = normalized.split('::');
    const left = parseSide(leftRaw);
    const right = parseSide(rightRaw);
    if (!left || !right) return null;
    const zeroCount = 8 - left.length - right.length;
    if (zeroCount < 1) return null;
    return [...left, ...Array(zeroCount).fill(0), ...right];
  }

  const hextets = parseSide(normalized);
  if (!hextets || hextets.length !== 8) return null;
  return hextets;
}

function ipv4Hextets(octets) {
  return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
}

function ipv4OctetsFromHextets(high, low) {
  return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
}

function embeddedIpv4Octets(hextets) {
  if (hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff) {
    return ipv4OctetsFromHextets(hextets[6], hextets[7]);
  }
  if (hextets.slice(0, 6).every((part) => part === 0)) {
    return ipv4OctetsFromHextets(hextets[6], hextets[7]);
  }
  if (hextets[0] === 0x0064 && hextets[1] === 0xff9b && hextets.slice(2, 6).every((part) => part === 0)) {
    return ipv4OctetsFromHextets(hextets[6], hextets[7]);
  }
  if (hextets[0] === 0x0064 && hextets[1] === 0xff9b && hextets[2] === 0x0001 && hextets.slice(3, 6).every((part) => part === 0)) {
    return ipv4OctetsFromHextets(hextets[6], hextets[7]);
  }
  return null;
}

function isAllZero(hextets) {
  return hextets.every((part) => part === 0);
}

function isIpv6Loopback(hextets) {
  return hextets.slice(0, 7).every((part) => part === 0) && hextets[7] === 1;
}

function normalizeSourceClass(value) {
  const sourceClass = requiredString(value, 'source_class').toLowerCase();
  if (!GREEN_SOURCE_CLASS_SET.has(sourceClass)) {
    throw new Error('Persistent Greenfeed jack-in candidates must be Green public/owned/authorized sources.');
  }
  return sourceClass;
}

function normalizeView(value) {
  const view = isPlainObject(value) ? value : {};
  const headingRaw = view.heading_degrees ?? view.headingDegrees;
  const fovRaw = view.fov_degrees ?? view.fovDegrees;
  const heading = headingRaw === undefined || headingRaw === null || headingRaw === ''
    ? null
    : numberValue(headingRaw, 'view.heading_degrees', { min: 0, max: 360 });
  const fov = fovRaw === undefined || fovRaw === null || fovRaw === ''
    ? null
    : numberValue(fovRaw, 'view.fov_degrees', { min: 0, max: 360 });
  const footprint = view.footprint ?? null;
  return {
    mode: stringValue(view.mode) || 'non_visual_point_telemetry',
    heading_degrees: heading,
    fov_degrees: fov,
    footprint,
    angle_quality: stringValue(view.angle_quality ?? view.angleQuality) || (heading === null || fov === null ? 'unavailable' : 'declared'),
    caveat: stringValue(view.caveat) || (heading === null || fov === null ? 'No declared visual footprint/FOV/angle; angle ranking is caveated.' : null),
  };
}

function normalizeProvenance(raw, source) {
  const provenance = isPlainObject(raw) ? { ...raw } : {};
  provenance.owner_publisher ||= source.owner_publisher;
  provenance.terms_url ||= source.terms_url;
  provenance.terms_summary ||= source.terms_summary;
  provenance.publication_basis ||= 'intentional_public_or_authorized_feed';
  provenance.no_private_camera_probing = true;
  provenance.no_raw_payload_retention = true;
  return provenance;
}

export function normalizeGreenfeedSource(rawSource = {}) {
  if (!isPlainObject(rawSource)) throw new Error('Greenfeed source must be an object');
  const sourceClass = normalizeSourceClass(rawSource.source_class ?? rawSource.sourceClass);
  const sourceId = requiredString(rawSource.source_id ?? rawSource.sourceId ?? rawSource.id, 'source_id').toLowerCase();
  if (!UUID_V4.test(sourceId)) throw new Error('source_id must be a UUID v4');
  const sourceKey = requiredString(rawSource.source_key ?? rawSource.sourceKey, 'source_key');
  const provider = requiredString(rawSource.provider, 'provider');
  const ownerPublisher = requiredString(rawSource.owner_publisher ?? rawSource.ownerPublisher ?? rawSource.publisher ?? rawSource.owner, 'owner_publisher');
  const feedUrl = normalizeUrl(rawSource.feed_url ?? rawSource.feedUrl ?? rawSource.url, 'feed_url');
  const termsUrl = normalizeUrl(rawSource.terms_url ?? rawSource.termsUrl, 'terms_url');
  const termsSummary = requiredString(rawSource.terms_summary ?? rawSource.termsSummary ?? rawSource.provenance?.terms_summary, 'terms_summary');
  const lat = numberValue(rawSource.lat ?? rawSource.latitude, 'lat', { min: -90, max: 90 });
  const lon = numberValue(rawSource.lon ?? rawSource.lng ?? rawSource.longitude, 'lon', { min: -180, max: 180 });
  const cacheTtlSeconds = integerValue(rawSource.cache_ttl_seconds ?? rawSource.cacheTtlSeconds, 'cache_ttl_seconds', {
    min: 1,
    max: 86_400,
    fallback: DEFAULT_CACHE_TTL_SECONDS,
  });
  const updateCadenceSeconds = integerValue(rawSource.update_cadence_seconds ?? rawSource.updateCadenceSeconds, 'update_cadence_seconds', {
    min: 1,
    max: 86_400,
    fallback: DEFAULT_UPDATE_CADENCE_SECONDS,
  });
  const enabled = boolValue(rawSource.enabled, true);
  const allowedPreload = boolValue(rawSource.allowed_preload ?? rawSource.allowedPreload, true);
  const retainsRawPayload = boolValue(rawSource.retains_raw_payload ?? rawSource.retainsRawPayload, false);
  const sourceQualityScore = Number(numberValue(rawSource.source_quality_score ?? rawSource.sourceQualityScore, 'source_quality_score', {
    min: 0,
    max: 1,
    fallback: 0.8,
  }).toFixed(3));
  const view = normalizeView(rawSource.view);
  const source = {
    source_id: sourceId,
    source_key: sourceKey,
    name: requiredString(rawSource.name, 'name'),
    source_class: sourceClass,
    provider,
    owner_publisher: ownerPublisher,
    feed_url: feedUrl,
    terms_url: termsUrl,
    terms_summary: termsSummary,
    authorized_scope_ref: stringValue(rawSource.authorized_scope_ref ?? rawSource.authorizedScopeRef),
    allowed_preload: allowedPreload,
    persistent_jack_in_allowed: boolValue(rawSource.persistent_jack_in_allowed ?? rawSource.persistentJackInAllowed, allowedPreload && enabled),
    retains_raw_payload: retainsRawPayload,
    cache_ttl_seconds: cacheTtlSeconds,
    update_cadence_seconds: updateCadenceSeconds,
    last_checked_at: isoOrNull(rawSource.last_checked_at ?? rawSource.lastCheckedAt),
    enabled,
    lat,
    lon,
    freshness_status: stringValue(rawSource.freshness_status ?? rawSource.freshnessStatus) || 'unknown',
    uptime_status: stringValue(rawSource.uptime_status ?? rawSource.uptimeStatus) || 'unknown',
    source_quality_score: sourceQualityScore,
    view,
    footprint: rawSource.footprint ?? view.footprint ?? null,
    caveats: [...new Set([
      ...arrayOfStrings(rawSource.caveats),
      ...arrayOfStrings(view.caveat),
    ])],
    global_lookup_allowed: true,
  };
  source.provenance = normalizeProvenance(rawSource.provenance, source);
  if (source.persistent_jack_in_allowed && !source.allowed_preload) {
    throw new Error('Persistent Greenfeed jack-in requires allowed_preload=true.');
  }
  if (source.persistent_jack_in_allowed && source.retains_raw_payload) {
    throw new Error('Persistent Greenfeed jack-in cannot retain raw payloads by default.');
  }
  return source;
}

export function loadSeedGreenfeedCatalog({ path = DEFAULT_GREENFEED_SEED_CATALOG_URL } = {}) {
  const filePath = path instanceof URL ? fileURLToPath(path) : String(path);
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('Greenfeed seed catalog must be an array');
  return raw.map((source) => normalizeGreenfeedSource(source));
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

export function distanceMeters(a, b) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = (sinLat * sinLat) + (Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon);
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearingDegrees(from, to) {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLon = toRadians(to.lon - from.lon);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = (Math.cos(lat1) * Math.sin(lat2)) - (Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon));
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function angularDeltaDegrees(a, b) {
  const delta = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return Number(delta.toFixed(3));
}

function freshnessScore(source, now) {
  if (!source.last_checked_at) return source.freshness_status === 'fresh' ? 0.9 : 0.75;
  const ageSeconds = Math.max(0, (new Date(now).getTime() - new Date(source.last_checked_at).getTime()) / 1000);
  return Math.max(0.1, Math.min(1, 1 - (ageSeconds / Math.max(source.cache_ttl_seconds * 4, 1))));
}

export function rankGreenfeedSourcesForClaim({ lat, lon, sources = [], limit = 10, now = new Date() } = {}) {
  const target = {
    lat: numberValue(lat, 'lat', { min: -90, max: 90 }),
    lon: numberValue(lon, 'lon', { min: -180, max: 180 }),
  };
  const normalizedSources = sources.map((source) => normalizeGreenfeedSource(source));
  return normalizedSources
    .filter((source) => source.enabled && source.allowed_preload && source.persistent_jack_in_allowed && GREEN_SOURCE_CLASS_SET.has(source.source_class))
    .map((source) => {
      const sourcePoint = { lat: source.lat, lon: source.lon };
      const distance = distanceMeters(sourcePoint, target);
      const bearing = bearingDegrees(sourcePoint, target);
      const hasDeclaredAngle = Number.isFinite(source.view.heading_degrees) && Number.isFinite(source.view.fov_degrees);
      const angleDelta = hasDeclaredAngle ? angularDeltaDegrees(source.view.heading_degrees, bearing) : null;
      const withinDeclaredFov = hasDeclaredAngle ? angleDelta <= source.view.fov_degrees / 2 : null;
      const distanceScore = 1 / (1 + (distance / 25_000));
      const angleScore = angleDelta === null ? 0.75 : Math.max(0, 1 - (angleDelta / 180));
      const score = Number(((source.source_quality_score * 0.45) + (distanceScore * 0.3) + (angleScore * 0.15) + (freshnessScore(source, now) * 0.1)).toFixed(6));
      return {
        ...source,
        distance_meters: Math.round(distance),
        bearing_degrees: Number(bearing.toFixed(3)),
        angle_delta_degrees: angleDelta,
        within_declared_fov: withinDeclaredFov,
        source_quality_score: source.source_quality_score,
        claim_validation_score: score,
        ranking_caveats: [...new Set([
          ...(source.caveats || []),
          ...(angleDelta === null ? ['No declared camera angle/FOV; angle ranking is caveated.'] : []),
        ])],
      };
    })
    .sort((a, b) => (b.claim_validation_score - a.claim_validation_score) || (a.distance_meters - b.distance_meters) || a.source_key.localeCompare(b.source_key))
    .slice(0, Math.max(1, Number.parseInt(String(limit), 10) || 10));
}

function sourceProvenance(source) {
  return {
    ...source.provenance,
    owner_publisher: source.owner_publisher,
    terms_url: source.terms_url,
    terms_summary: source.terms_summary,
    update_cadence_seconds: source.update_cadence_seconds,
    cache_ttl_seconds: source.cache_ttl_seconds,
    freshness_status: source.freshness_status,
    uptime_status: source.uptime_status,
    view: source.view,
    source_quality_score: source.source_quality_score,
    caveats: source.caveats,
    persistent_jack_in_allowed: source.persistent_jack_in_allowed,
    global_lookup_allowed: source.global_lookup_allowed,
  };
}

export async function upsertGreenfeedSources(pool, sources = []) {
  if (!pool?.query) throw new Error('pool with query(sql, params) is required');
  const normalized = sources.map((source) => normalizeGreenfeedSource(source));
  const rows = [];
  for (const source of normalized) {
    const result = await pool.query(`
      INSERT INTO source_catalog (
        id, source_class, source_key, name, provider, feed_url, terms_url,
        authorized_scope_ref, allowed_preload, retains_raw_payload, cache_ttl_seconds,
        geom, footprint, provenance, enabled, last_checked_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        ST_SetSRID(ST_MakePoint($12, $13), 4326),
        CASE WHEN $14::jsonb IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($14::text), 4326) END,
        $15::jsonb, $16, $17::timestamptz, now()
      )
      ON CONFLICT (source_key) DO UPDATE
      SET source_class = EXCLUDED.source_class,
          name = EXCLUDED.name,
          provider = EXCLUDED.provider,
          feed_url = EXCLUDED.feed_url,
          terms_url = EXCLUDED.terms_url,
          authorized_scope_ref = EXCLUDED.authorized_scope_ref,
          allowed_preload = source_catalog.allowed_preload,
          retains_raw_payload = EXCLUDED.retains_raw_payload,
          cache_ttl_seconds = EXCLUDED.cache_ttl_seconds,
          geom = EXCLUDED.geom,
          footprint = EXCLUDED.footprint,
          provenance = CASE
            WHEN source_catalog.allowed_preload IS FALSE
              THEN jsonb_set(EXCLUDED.provenance || source_catalog.provenance, '{persistent_jack_in_allowed}', 'false'::jsonb, true)
            ELSE EXCLUDED.provenance || source_catalog.provenance
          END,
          enabled = source_catalog.enabled,
          last_checked_at = COALESCE(EXCLUDED.last_checked_at, source_catalog.last_checked_at),
          updated_at = now()
      RETURNING id, source_class, source_key, name, provider, feed_url, terms_url,
                authorized_scope_ref, allowed_preload, retains_raw_payload, cache_ttl_seconds,
                provenance, enabled, last_checked_at
    `, [
      source.source_id,
      source.source_class,
      source.source_key,
      source.name,
      source.provider,
      source.feed_url,
      source.terms_url,
      source.authorized_scope_ref,
      source.allowed_preload,
      source.retains_raw_payload,
      source.cache_ttl_seconds,
      source.lon,
      source.lat,
      source.footprint ? JSON.stringify(source.footprint) : null,
      JSON.stringify(sourceProvenance(source)),
      source.enabled,
      source.last_checked_at,
    ]);
    rows.push(result.rows?.[0] || source);
  }
  return { sources: normalized, rows, sourceCount: normalized.length };
}

export async function markGreenfeedSourceChecked(pool, source, { checkedAt = new Date(), status = 'ok', details = {} } = {}) {
  if (!pool?.query) throw new Error('pool with query(sql, params) is required');
  const normalized = normalizeGreenfeedSource(source);
  const checkedAtIso = isoOrNull(checkedAt) || new Date().toISOString();
  const patch = {
    last_poll: {
      checked_at: checkedAtIso,
      status,
      ...details,
    },
  };
  const result = await pool.query(`
    UPDATE source_catalog
    SET last_checked_at = $2::timestamptz,
        provenance = provenance || $3::jsonb,
        updated_at = now()
    WHERE source_key = $1
    RETURNING id, source_key, last_checked_at, provenance
  `, [normalized.source_key, checkedAtIso, JSON.stringify(patch)]);
  return result.rows?.[0] || null;
}
