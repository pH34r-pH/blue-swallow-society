import { mergeWigleRecords } from './wigle.mjs';

export function createGodeyeController({ now = () => new Date().toISOString() } = {}) {
  return Object.freeze({
    buildRequestPayload,
    emptyDataset,
    reduceDataset,
  });

  function buildRequestPayload(params = {}) {
    return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  }

  function emptyDataset(source = 'cybermap-postgis') {
    return {
      location: null,
      accessPoints: [],
      source,
      mode: 'viewport',
      live: false,
      updatedAt: null,
    };
  }

  function reduceDataset(payload = {}, {
    sourceLabel = 'cybermap-postgis',
    previous = null,
    currentLocation = null,
    merge = true,
    live = false,
  } = {}) {
    const previousRecords = Array.isArray(previous?.accessPoints) ? previous.accessPoints : [];
    const nextRecords = merge
      ? mergeWigleRecords(previousRecords, payload.accessPoints || [])
      : mergeWigleRecords(payload.accessPoints || []);

    return {
      location: payload.location || currentLocation || previous?.location || null,
      accessPoints: nextRecords,
      source: sourceLabel,
      updatedAt: payload.updatedAt || now(),
      mode: 'viewport',
      live,
    };
  }
}
