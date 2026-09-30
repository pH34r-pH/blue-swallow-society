/** Explicit host lifecycle; map reads never call refresh. No enabled feed is fetched until start().
 * Hosts must run only one acquisition instance per outbound IP; these snapshots are not durable.
 */
export function createWorldAcquisition(service, { setTimer = setTimeout, clearTimer = clearTimeout, intervalMs = 300000 } = {}) {
  const cadence = Math.max(300000, intervalMs); let stopped = true; let timer = null; let generation = 0;
  async function tick(epoch) {
    if (stopped || epoch !== generation) return;
    await Promise.allSettled(['usgs-earthquakes', 'nws-alerts'].map((id) => service.refresh(id)));
    if (!stopped && epoch === generation) { timer = setTimer(() => tick(epoch), cadence); timer?.unref?.(); }
  }
  return Object.freeze({ start() { if (!stopped) return; stopped = false; void tick(++generation); }, stop() { stopped = true; generation++; if (timer) clearTimer(timer); } });
}
