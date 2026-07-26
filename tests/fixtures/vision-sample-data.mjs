const FIXTURE_TIMESTAMP = '2026-07-09T12:10:00Z';
const FIXTURE_FRAME = { width: 1280, height: 720 };
const FIXTURE_DETECTIONS = [
  {
    id: 'sample-person-1',
    label: 'person',
    confidence: 0.96,
    box: { x: 0.18, y: 0.12, width: 0.18, height: 0.55, normalized: true },
    source: 'sample',
    trackId: 'person-1',
  },
  {
    id: 'sample-bicycle-1',
    label: 'bicycle',
    confidence: 0.84,
    box: { x: 0.42, y: 0.34, width: 0.24, height: 0.28, normalized: true },
    source: 'sample',
    trackId: 'bicycle-1',
  },
  {
    id: 'sample-car-1',
    label: 'car',
    confidence: 0.78,
    box: { x: 0.68, y: 0.18, width: 0.2, height: 0.18, normalized: true },
    source: 'sample',
    trackId: 'car-1',
  },
  {
    id: 'sample-door-1',
    label: 'door',
    confidence: 0.71,
    box: { left: 900, top: 220, right: 1115, bottom: 612 },
    source: 'sample',
    trackId: 'door-1',
  },
];

export function createVisionSampleFixture() {
  return {
    frame: { ...FIXTURE_FRAME },
    detections: FIXTURE_DETECTIONS.map((detection) => ({ ...detection, box: { ...detection.box } })),
    source: 'sample',
    updatedAt: FIXTURE_TIMESTAMP,
  };
}
