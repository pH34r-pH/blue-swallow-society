export function createOrbitAcquisition(service, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let running = false, timer = null, generation = 0;
  async function tick(epoch) {
    if (!running || epoch !== generation) return;
    await service.refresh().catch(() => {});
    if (running && epoch === generation) { timer = setTimer(() => tick(epoch),7200000); timer?.unref?.(); }
  }
  return { start() { if (running) return; running=true; void tick(++generation); },
    stop() { running=false; generation++; if (timer) clearTimer(timer); } };
}
