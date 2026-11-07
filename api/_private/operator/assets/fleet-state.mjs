const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const HEALTH_STATES = new Set(['healthy', 'warning', 'critical', 'stopped', 'unknown']);
const ISSUE_FILTERS = new Set(['all', 'open', 'completed', 'closed']);

function timestamp(value) {
  return typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
}

// Only the producer's observation and freshness deadline establish current health.
export function healthState(node, now = Date.now()) {
  const health = node?.health;
  if (!health || !HEALTH_STATES.has(health.state) || !Number.isFinite(now)) return 'unknown';
  const observedAt = timestamp(health.observedAt);
  const freshUntil = timestamp(health.freshUntil);
  if (!Number.isFinite(observedAt) || observedAt > now || !Number.isFinite(freshUntil)
    || freshUntil < observedAt) return 'unknown';
  return freshUntil <= now ? 'stale' : health.state;
}

export function issueDisposition(issue) {
  if (issue?.state === 'open') return 'open';
  return issue?.state === 'closed' && issue.stateReason === 'completed' ? 'completed' : 'closed';
}

// The window measures updates, not completion events. "closed" means other closures.
export function recentIssues(snapshot, { repoId = null, days = 7, now = Date.now(), state = 'all' } = {}) {
  const windowMs = days === 'all' ? Infinity : Number(days) * DAY_MS;
  if (!Array.isArray(snapshot?.issues) || !Number.isFinite(now) || !ISSUE_FILTERS.has(state)
    || Number.isNaN(windowMs) || windowMs < 0) return [];
  return snapshot.issues
    .map((issue) => ({ issue, updatedAt: timestamp(issue?.updatedAt) }))
    .filter(({ issue, updatedAt }) => (issue?.state === 'open' || issue?.state === 'closed')
      && Number.isFinite(updatedAt) && updatedAt <= now && now - updatedAt <= windowMs
      && (repoId === null || issue.repoId === repoId)
      && (state === 'all' || issueDisposition(issue) === state))
    .sort((a, b) => {
      const dateOrder = b.updatedAt - a.updatedAt;
      if (dateOrder) return dateOrder;
      const aId = String(a.issue.id ?? '');
      const bId = String(b.issue.id ?? '');
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    })
    .map(({ issue }) => issue);
}

// Callers supply the surrounding label; future or missing evidence has no age.
export function relativeTime(iso, now = Date.now()) {
  const observedAt = timestamp(iso);
  if (!Number.isFinite(now) || !Number.isFinite(observedAt) || observedAt > now) return '—';
  const age = now - observedAt;
  if (age < MINUTE_MS) return '<1m';
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)}m`;
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)}h`;
  return `${Math.floor(age / DAY_MS)}d`;
}
