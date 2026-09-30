const ROUTES = Object.freeze({ godeye: 'travels', entities: 'entities', world: 'world', devices: 'devices' });

export function companionRoute(pathname) {
  return Object.keys(ROUTES).find((key) => pathname === `/operator/${ROUTES[key]}`) || 'godeye';
}

export function companionUrl(key, currentUrl) {
  if (!Object.hasOwn(ROUTES, key)) throw new TypeError('Unknown companion route');
  const url = new URL(currentUrl);
  return `/operator/${ROUTES[key]}${url.search}`;
}
