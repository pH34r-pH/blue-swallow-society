export const CLIENT_TYPES = Object.freeze([
  'wardriver_device',
  'swa_proxy',
  'jetson',
  'greenfeed_worker',
  'operator_admin',
]);

export const SOURCE_CLASSES = Object.freeze([
  'green_public',
  'green_owned',
  'green_authorized',
  'owned_device',
  'local_observation',
  'grey_enrichment',
  'orange_exposure',
  'red_restricted',
]);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const OPERATOR_SCOPES = new Set(['*', 'operator:*', 'cybermap:*']);

function asArray(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).flatMap((value) => {
    if (typeof value === 'string' && value.includes(',')) {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return String(value ?? '').trim() ? [String(value).trim()] : [];
  }))];
}

export function normalizeClientType(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const alias = normalized === 'operator' || normalized === 'admin' ? 'operator_admin' : normalized;
  if (!CLIENT_TYPES.includes(alias)) {
    throw new Error(`unsupported Cybermap client type: ${value}`);
  }
  return alias;
}

export function normalizeSourceClasses(values = []) {
  return uniqueStrings(values).map((sourceClass) => {
    const normalized = sourceClass.toLowerCase();
    if (!SOURCE_CLASSES.includes(normalized)) {
      throw new Error(`unsupported Cybermap source class: ${sourceClass}`);
    }
    return normalized;
  });
}

export function normalizeSourceIds(values = []) {
  return uniqueStrings(values);
}

export function normalizeScopes(values = []) {
  return uniqueStrings(values).map((scope) => scope.toLowerCase());
}

export function routeKindForRequest(method = 'GET', pathname = '/') {
  if (!pathname.startsWith('/api/v1/')) return 'other';
  const upperMethod = String(method || 'GET').toUpperCase();
  if (MUTATING_METHODS.has(upperMethod)) return 'ingest';
  if (upperMethod === 'GET' || upperMethod === 'HEAD') return 'read';
  return 'other';
}

export function requiredScopesForRequest(method = 'GET', pathname = '/') {
  if (!pathname.startsWith('/api/v1/')) return [];
  const upperMethod = String(method || 'GET').toUpperCase();
  if (MUTATING_METHODS.has(upperMethod)) {
    if (pathname.startsWith('/api/v1/sources')) return ['sources:write'];
    if (pathname.startsWith('/api/v1/mosaic') || pathname.startsWith('/api/v1/murmur')) return ['memory:write'];
    return ['observations:write'];
  }
  if (upperMethod === 'GET' || upperMethod === 'HEAD') {
    if (pathname.startsWith('/api/v1/sources')) return ['sources:read', 'cybermap:read'];
    return ['cybermap:read'];
  }
  return ['cybermap:read'];
}

export function identityHasAnyScope(identity, requiredScopes = []) {
  if (!requiredScopes.length) return true;
  const scopes = new Set(normalizeScopes(identity?.scopes || []));
  if ([...OPERATOR_SCOPES].some((scope) => scopes.has(scope))) return true;
  return requiredScopes.some((scope) => scopes.has(scope));
}

function collectAuthority(value, result, depth = 0) {
  if (value === null || value === undefined || depth > 6) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectAuthority(item, result, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (key === 'source_id' || key === 'sourceId') {
      uniqueStrings(child).forEach((sourceId) => result.sourceIds.add(sourceId));
      continue;
    }
    if (key === 'source_ids' || key === 'sourceIds') {
      uniqueStrings(child).forEach((sourceId) => result.sourceIds.add(sourceId));
      continue;
    }
    if (key === 'source_class' || key === 'sourceClass') {
      uniqueStrings(child).forEach((sourceClass) => result.sourceClasses.add(sourceClass.toLowerCase()));
      continue;
    }
    if (key === 'source_classes' || key === 'sourceClasses') {
      uniqueStrings(child).forEach((sourceClass) => result.sourceClasses.add(sourceClass.toLowerCase()));
      continue;
    }
    collectAuthority(child, result, depth + 1);
  }
}

export function extractRequestedSourceAuthority({ searchParams, body } = {}) {
  const result = { sourceIds: new Set(), sourceClasses: new Set() };
  if (searchParams) {
    for (const key of ['source_id', 'sourceId']) {
      searchParams.getAll(key).forEach((value) => {
        uniqueStrings(value).forEach((sourceId) => result.sourceIds.add(sourceId));
      });
    }
    for (const key of ['source_ids', 'sourceIds']) {
      searchParams.getAll(key).forEach((value) => {
        uniqueStrings(value).forEach((sourceId) => result.sourceIds.add(sourceId));
      });
    }
    for (const key of ['source_class', 'sourceClass']) {
      searchParams.getAll(key).forEach((value) => {
        uniqueStrings(value).forEach((sourceClass) => result.sourceClasses.add(sourceClass.toLowerCase()));
      });
    }
    for (const key of ['source_classes', 'sourceClasses']) {
      searchParams.getAll(key).forEach((value) => {
        uniqueStrings(value).forEach((sourceClass) => result.sourceClasses.add(sourceClass.toLowerCase()));
      });
    }
  }
  collectAuthority(body, result);
  return {
    sourceIds: [...result.sourceIds],
    sourceClasses: [...result.sourceClasses],
  };
}

function hasWildcard(values) {
  return values.has('*');
}

function sourceIdAllowed(sourceId, allowedSourceIds) {
  return hasWildcard(allowedSourceIds) || allowedSourceIds.has(sourceId);
}

function sourceClassAllowed(sourceClass, allowedSourceClasses) {
  return hasWildcard(allowedSourceClasses) || allowedSourceClasses.has(sourceClass);
}

function routeRequiresRegisteredSourceAuthority(kind) {
  return kind === 'ingest' || kind === 'read';
}

export function authorizeApiRequest({ identity, method = 'GET', pathname = '/', searchParams, body } = {}) {
  const requiredScopes = requiredScopesForRequest(method, pathname);
  if (!identityHasAnyScope(identity, requiredScopes)) {
    return {
      ok: false,
      statusCode: 403,
      code: 'scope_forbidden',
      message: 'Token scope does not authorize this Cybermap API route.',
      requiredScopes,
    };
  }

  const scopes = new Set(normalizeScopes(identity?.scopes || []));
  const routeKind = routeKindForRequest(method, pathname);
  const operator = identity?.clientType === 'operator_admin' || [...OPERATOR_SCOPES].some((scope) => scopes.has(scope));
  if (operator) return { ok: true, requiredScopes, requestedAuthority: { sourceIds: [], sourceClasses: [] } };

  const requestedAuthority = extractRequestedSourceAuthority({ searchParams, body });
  const allowedSourceIds = new Set(normalizeSourceIds(identity?.sourceIds || []));
  const rawSourceClasses = identity?.sourceClasses || [];
  const wildcardSourceClass = normalizeSourceIds(rawSourceClasses).includes('*');
  const allowedSourceClasses = new Set(normalizeSourceClasses(
    normalizeSourceIds(rawSourceClasses).filter((sourceClass) => sourceClass !== '*'),
  ));
  if (wildcardSourceClass) allowedSourceClasses.add('*');

  if (
    routeRequiresRegisteredSourceAuthority(routeKind)
    && requestedAuthority.sourceIds.length === 0
    && requestedAuthority.sourceClasses.length === 0
    && allowedSourceIds.size === 0
    && allowedSourceClasses.size === 0
  ) {
    return {
      ok: false,
      statusCode: 403,
      code: 'source_scope_required',
      message: 'Token has route scope but no registered Cybermap source authority for this API route.',
      requiredScopes,
    };
  }

  const invalidSourceClasses = requestedAuthority.sourceClasses.filter((sourceClass) => !SOURCE_CLASSES.includes(sourceClass));
  if (invalidSourceClasses.length) {
    return {
      ok: false,
      statusCode: 403,
      code: 'source_scope_forbidden',
      message: 'Requested source class is not registered for this token.',
      requestedAuthority,
    };
  }

  const unauthorizedIds = requestedAuthority.sourceIds.filter((sourceId) => !sourceIdAllowed(sourceId, allowedSourceIds));
  if (unauthorizedIds.length) {
    return {
      ok: false,
      statusCode: 403,
      code: 'source_scope_forbidden',
      message: 'Requested source ID is not registered for this token.',
      requestedAuthority,
    };
  }

  const unauthorizedClasses = requestedAuthority.sourceClasses.filter(
    (sourceClass) => !sourceClassAllowed(sourceClass, allowedSourceClasses),
  );
  if (unauthorizedClasses.length) {
    return {
      ok: false,
      statusCode: 403,
      code: 'source_scope_forbidden',
      message: 'Requested source class is not registered for this token.',
      requestedAuthority,
    };
  }

  return { ok: true, requiredScopes, requestedAuthority };
}

export const sourceRegistryDefaults = Object.freeze({
  CLIENT_TYPES,
  SOURCE_CLASSES,
});
