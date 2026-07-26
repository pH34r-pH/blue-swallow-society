import {
  createFixtureOnlyAdapter,
  normalizeClassification,
  requireArray,
  requireFiniteNumber,
  requirePoint,
  requireString,
  requireTimestamp,
} from './adapter-contract.mjs';

const SOURCE = {
  source_key: 'usgs-earthquakes',
  layer_id: 'usgs-earthquakes',
  display_name: 'USGS earthquakes',
  display_order: 10,
  provider: 'USGS Earthquake Hazards',
  provider_url: 'https://earthquake.usgs.gov/',
  terms_url: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
  attribution_text: 'U.S. Geological Survey',
  source_class: 'green_public',
  enabled: false,
  allowed_preload: false,
  global_layer: true,
  terms_reviewed_at: '2026-07-22T20:18:30.000Z',
  fresh_after_seconds: 300,
  stale_after_seconds: 900,
  normalizer_version: 'bss.greenfeed.usgs-earthquakes.v1',
  caveats: ['public_report_not_local_observation', 'coverage_incomplete'],
};

export const USGS_EARTHQUAKES_ADAPTER = createFixtureOnlyAdapter({
  source: SOURCE,
  normalizePayload(payload) {
    return requireArray(payload?.features).map((feature) => ({
      provider_event_id: requireString(feature?.id),
      observed_at: requireTimestamp(feature?.properties?.time),
      location: requirePoint(feature?.geometry),
      summary: {
        classification: normalizeClassification(feature?.properties?.type),
        magnitude: requireFiniteNumber(feature?.properties?.mag, { min: -10, max: 15 }),
      },
    }));
  },
});
