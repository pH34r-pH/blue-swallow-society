import { mergeVisionDetections } from './vision.mjs';

export function createVisionController({ now = () => new Date().toISOString() } = {}) {
  return Object.freeze({
    emptyDataset,
    reduceDataset,
  });

  function emptyDataset() {
    return {
      frame: null,
      detections: [],
      source: 'unavailable',
      updatedAt: null,
    };
  }

  function reduceDataset(payload = {}, {
    sourceLabel = 'unavailable',
    previous = null,
    merge = true,
  } = {}) {
    const currentDetections = Array.isArray(previous?.detections) ? previous.detections : [];
    const detections = merge
      ? mergeVisionDetections(currentDetections, payload.detections || [])
      : mergeVisionDetections(payload.detections || []);

    return {
      frame: payload.frame || previous?.frame || null,
      detections,
      source: sourceLabel,
      updatedAt: payload.updatedAt || now(),
    };
  }
}
