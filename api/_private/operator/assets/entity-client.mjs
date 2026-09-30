export function createEntityClient({ getHeaders, fetchImpl = fetch } = {}) {
  return async (operation, input) => {
    if (!['list', 'detail', 'preview', 'mutate'].includes(operation)) throw new Error('Invalid entity operation');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetchImpl(`/api/cybermap/entities/${operation}`, {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: getHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' }), body: JSON.stringify(input),
      });
      const body = await response.json();
      if (!response.ok) throw Object.assign(new Error('Entity request failed'), { code: body.error, status: response.status });
      return body;
    } finally { clearTimeout(timer); }
  };
}

export function createEntityEditingClient({ getHeaders, fetchImpl = fetch, navigate = (url) => location.assign(url) } = {}) {
  async function call(method) {
    const response = await fetchImpl('/api/owner-auth/edit', { method, credentials: 'same-origin',
      headers: getHeaders({ Accept: 'application/json' }) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error('Editing authorization unavailable'), { status: response.status });
    return result;
  }
  return { status: () => call('GET'), async enable() {
    const result = await call('POST');
    const url = new URL(result.authorizationUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'login.microsoftonline.com') throw new Error('Invalid authorization destination');
    navigate(url.href);
  } };
}
