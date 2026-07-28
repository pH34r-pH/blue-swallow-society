export function toOperatorSignalDataset(snapshot) {
  const signals = Array.isArray(snapshot?.signals) ? snapshot.signals : [];
  return {
    location: normalizeLocation(snapshot?.location),
    source: typeof snapshot?.source === 'string' ? snapshot.source : 'cybermap-postgis',
    updatedAt: typeof snapshot?.updatedAt === 'string' ? snapshot.updatedAt : null,
    accessPoints: signals.map((signal, index) => ({
      id: `operator-signal-${index}`,
      ssid: typeof signal?.label === 'string' ? signal.label : 'Radio observation',
      bssid: null,
      lat: finite(signal?.lat),
      lon: finite(signal?.lon),
      signalDbm: finite(signal?.signalDbm),
      channel: finite(signal?.channel),
      frequencyMhz: finite(signal?.frequencyMhz),
      confidence: finite(signal?.confidence),
      accuracyMeters: finite(signal?.accuracyMeters),
      distanceMeters: finite(signal?.distanceMeters),
      lastSeen: typeof signal?.observedAt === 'string' ? signal.observedAt : null,
      observedAt: typeof signal?.observedAt === 'string' ? signal.observedAt : null,
      source: typeof signal?.sourceClass === 'string' ? signal.sourceClass : 'cybermap-postgis',
      sourceClass: typeof signal?.sourceClass === 'string' ? signal.sourceClass : 'unknown',
      redactionClass: signal?.redactionClass || 'identifier_suppressed',
      retentionClass: signal?.retentionClass || 'policy_bound',
      kind: signal?.kind || 'wifi',
    })),
  };
}

function normalizeLocation(value) {
  return Number.isFinite(Number(value?.lat)) && Number.isFinite(Number(value?.lon))
    ? { lat: Number(value.lat), lon: Number(value.lon) }
    : null;
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
