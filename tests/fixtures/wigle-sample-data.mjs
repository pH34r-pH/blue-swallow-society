const FIXTURE_LOCATION = {
  lat: 47.6154,
  lon: -122.3362,
  accuracy: 14,
  heading: 38,
  speed: 0.4,
  timestamp: '2026-07-09T12:00:00Z',
};

const FIXTURE_ACCESS_POINTS = [
  {
    bssid: 'e8:de:27:aa:11:01',
    ssid: 'BSS-WorkRouter',
    lat: 47.61555,
    lon: -122.33615,
    signalDbm: -44,
    channel: 6,
    security: 'WPA2',
    vendor: 'Ubiquiti',
    lastSeen: '2026-07-09T12:15:00Z',
    source: 'sample',
    deviceClass: 'router',
  },
  {
    bssid: 'e8:de:27:aa:11:02',
    ssid: 'BSS-Guest',
    lat: 47.61582,
    lon: -122.33572,
    signalDbm: -58,
    channel: 11,
    security: 'WPA2',
    vendor: 'Ubiquiti',
    lastSeen: '2026-07-09T12:12:30Z',
    source: 'sample',
    deviceClass: 'access point',
  },
  {
    bssid: '00:11:22:33:44:55',
    ssid: 'BSS-Camera',
    lat: 47.61486,
    lon: -122.33708,
    signalDbm: -71,
    channel: 1,
    security: 'WPA2',
    vendor: 'Generic',
    lastSeen: '2026-07-08T16:42:00Z',
    source: 'sample',
    deviceClass: 'network appliance',
  },
];

export function createWigleSampleFixture() {
  return {
    location: { ...FIXTURE_LOCATION },
    accessPoints: FIXTURE_ACCESS_POINTS.map((record) => ({ ...record })),
    source: 'sample',
    mode: 'sample',
    live: false,
    streamState: 'sample',
    updatedAt: FIXTURE_LOCATION.timestamp,
  };
}
