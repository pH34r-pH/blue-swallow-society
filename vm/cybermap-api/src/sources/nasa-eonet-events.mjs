import {
  createFixtureOnlyAdapter,
  invalidPayload,
  normalizeClassification,
  requireArray,
  requirePoint,
  requireString,
  requireTimestamp,
} from './adapter-contract.mjs';

const SOURCE = {
  source_key: 'nasa-eonet-events',
  layer_id: 'nasa-eonet-events',
  display_name: 'NASA EONET events',
  display_order: 30,
  provider: 'NASA EONET',
  provider_url: 'https://eonet.gsfc.nasa.gov/',
  terms_url: null,
  attribution_text: 'NASA Earth Observatory Natural Event Tracker',
  source_class: 'green_public',
  enabled: false,
  allowed_preload: false,
  global_layer: true,
  terms_reviewed_at: null,
  fresh_after_seconds: 3_600,
  stale_after_seconds: 10_800,
  normalizer_version: 'bss.greenfeed.nasa-eonet-events.v1',
  caveats: ['public_report_not_local_observation', 'provider_data_delayed', 'coverage_incomplete'],
};

export const NASA_EONET_EVENTS_ADAPTER = createFixtureOnlyAdapter({
  source: SOURCE,
  normalizePayload(payload) {
    return requireArray(payload?.events).map((event) => {
      const geometry = latestPointGeometry(event?.geometry);
      return {
        provider_event_id: `${requireString(event?.id)}:${geometry.observed_at}`,
        observed_at: geometry.observed_at,
        location: geometry.location,
        summary: {
          classification: primaryCategory(event?.categories),
        },
      };
    });
  },
});

function latestPointGeometry(geometries) {
  const points = requireArray(geometries)
    .filter((geometry) => geometry?.type === 'Point')
    .map((geometry) => ({
      observed_at: requireTimestamp(geometry.date),
      location: requirePoint(geometry),
    }))
    .sort((left, right) => right.observed_at.localeCompare(left.observed_at)
      || left.location.longitude - right.location.longitude
      || left.location.latitude - right.location.latitude);
  if (points.length === 0) throw invalidPayload();
  return points[0];
}

function primaryCategory(categories) {
  const normalized = requireArray(categories)
    .map((category) => normalizeClassification(category?.id ?? category?.title))
    .sort();
  if (normalized.length === 0) throw invalidPayload();
  return normalized[0];
}
