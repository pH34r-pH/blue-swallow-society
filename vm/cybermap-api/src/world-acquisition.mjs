/** Explicit host lifecycle; map reads never call refresh. No enabled feed is fetched until start().
 * Hosts must run only one acquisition instance per outbound IP; these snapshots are not durable.
 */
export function createWorldAcquisition(service, { setTimer = setTimeout, clearTimer = clearTimeout, intervalMs = 300000 } = {}) {
  const cadence = Math.max(300000, intervalMs); let stopped = true; let timer = null;
  async function tick() {
    if (stopped) return;
    await Promise.allSettled(['usgs-earthquakes', 'nws-alerts'].map((id) => service.refresh(id)));
    if (!stopped) { timer = setTimer(tick, cadence); timer?.unref?.(); }
  }
  return Object.freeze({ start() { if (!stopped) return; stopped = false; void tick(); }, stop() { stopped = true; if (timer) clearTimer(timer); } });
}
