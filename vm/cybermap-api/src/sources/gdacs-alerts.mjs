import {
  createFixtureOnlyAdapter,
  normalizeClassification,
  requireArray,
  requirePoint,
  requireString,
  requireTimestamp,
} from './adapter-contract.mjs';

const GDACS_EVENT_TYPES = Object.freeze({
  EQ: 'earthquake',
  FL: 'flood',
});

const SOURCE = {
  source_key: 'gdacs-alerts',
  layer_id: 'gdacs-alerts',
  display_name: 'GDACS alerts',
  display_order: 20,
  provider: 'GDACS',
  provider_url: 'https://www.gdacs.org/',
  terms_url: null,
  attribution_text: 'GDACS',
  source_class: 'green_public',
  enabled: false,
  allowed_preload: false,
  global_layer: true,
  terms_reviewed_at: null,
  fresh_after_seconds: 900,
  stale_after_seconds: 2_700,
  normalizer_version: 'bss.greenfeed.gdacs-alerts.v1',
  caveats: ['public_report_not_local_observation', 'provider_alert_level', 'coverage_incomplete'],
};

export const GDACS_ALERTS_ADAPTER = createFixtureOnlyAdapter({
  source: SOURCE,
  normalizePayload(payload) {
    return requireArray(payload?.features).map((feature) => {
      const properties = feature?.properties;
      const eventType = requireString(properties?.eventtype).toUpperCase();
      const classification = GDACS_EVENT_TYPES[eventType] ?? normalizeClassification(eventType);
      return {
        provider_event_id: requireString(properties?.eventid),
        observed_at: requireTimestamp(properties?.fromdate),
        location: requirePoint(feature?.geometry),
        summary: {
          classification,
          alert_level: normalizeClassification(properties?.alertlevel),
        },
      };
    });
  },
});
