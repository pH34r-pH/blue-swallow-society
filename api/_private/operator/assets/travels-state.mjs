const FILTERS = ['from', 'to', 'deviceId', 'sessionId', 'kind'];
const NAMES = { from: 'historyFrom', to: 'historyTo', deviceId: 'historyDevice', sessionId: 'historySession', kind: 'historyKind', selectedId: 'historyId', cursor: 'historyCursor' };
export function historyRequest(url, now = Date.now()) {
  const params = new URL(url).searchParams;
  const to = params.get(NAMES.to) || new Date(now).toISOString();
  return { from: params.get(NAMES.from) || new Date((Number.isFinite(Date.parse(to)) ? Date.parse(to) : now) - 7 * 86400000).toISOString(), to,
    ...Object.fromEntries(['deviceId', 'sessionId', 'kind', 'selectedId', 'cursor'].map((key) => [key, params.get(NAMES[key]) || null])), limit: 50 };
}
export function historyUrl(url, values) {
  const next = new URL(url);
  for (const [key, name] of Object.entries(NAMES)) {
    if (values[key]) next.searchParams.set(name, values[key]);
    else next.searchParams.delete(name);
  }
  return next.pathname + next.search;
}
export function pageStatus(state, now = Date.now()) {
  if (state.phase === 'loading') return 'Loading observation history…';
  if (state.phase === 'error') return 'History unavailable. Refresh to retry; no observations are shown.';
  if (state.phase !== 'ready') return 'Choose a time interval to load observation history.';
  if (now - Date.parse(state.data.retrievedAt) >= 60000) return 'History snapshot is stale. Refresh before relying on this view.';
  return state.data.observations.length ? `${state.data.observations.length} historical observations on this page. Capture locations are not emitter locations.` : 'No personal observations match these filters.';
}
export function createHistoryController({ fetchPage, render, now = Date.now }) {
  let state = { phase: 'idle', data: null };
  let generation = 0;
  let abort;
  return {
    async load(query) {
      const current = ++generation;
      abort?.abort();
      abort = new AbortController();
      state = { phase: 'loading', data: null }; render(state);
      try {
        const data = await fetchPage(query, abort.signal);
        if (current !== generation) return;
        if (data?.schemaVersion !== 'bss.observation_history.v1' || !Array.isArray(data.observations)
          || data.observations.length > 200 || !Number.isFinite(Date.parse(data.retrievedAt))) throw new Error('Invalid history');
        state = { phase: 'ready', data }; render(state);
      } catch {
        if (current !== generation) return;
        state = { phase: 'error', data: null }; render(state);
      }
    },
    select(id) {
      if (!state.data) return;
      state = { ...state, data: { ...state.data, selected: state.data.observations.find((row) => row.id === id) || null } };
      render(state);
    },
    tick() { render(state, now()); },
    getState() { return state; },
    destroy() { generation++; abort?.abort(); state = { phase: 'idle', data: null }; render(state); },
  };
}
export { FILTERS };
