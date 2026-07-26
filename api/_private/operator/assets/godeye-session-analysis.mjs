const MAX_TIMELINE_ENTRIES = 24;

export function clearGodeyeSessionAnalysis() {
  return {
    totalRecords: 0,
    sourceClassCounts: {},
    newestObservedAt: null,
    timeline: [],
  };
}

function validRecord(record) {
  return Boolean(record)
    && typeof record === 'object'
    && typeof record.kind === 'string'
    && record.kind.length > 0
    && typeof record.sourceClass === 'string'
    && record.sourceClass.length > 0
    && typeof record.observedAt === 'string'
    && Number.isFinite(Date.parse(record.observedAt));
}

export function deriveGodeyeSessionAnalysis(viewport) {
  const records = Array.isArray(viewport?.accessPoints) ? viewport.accessPoints.filter(validRecord) : [];
  if (records.length === 0) return clearGodeyeSessionAnalysis();

  const sourceClassCounts = {};
  for (const record of records) {
    sourceClassCounts[record.sourceClass] = (sourceClassCounts[record.sourceClass] || 0) + 1;
  }
  const orderedCounts = Object.fromEntries(Object.entries(sourceClassCounts).sort(([left], [right]) => left.localeCompare(right)));
  const timeline = records
    .map((record) => ({
      kind: record.kind,
      sourceClass: record.sourceClass,
      observedAt: record.observedAt,
    }))
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))
    .slice(0, MAX_TIMELINE_ENTRIES);

  return {
    totalRecords: records.length,
    sourceClassCounts: orderedCounts,
    newestObservedAt: timeline[0]?.observedAt || null,
    timeline,
  };
}
