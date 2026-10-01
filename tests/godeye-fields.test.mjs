import test from 'node:test';
import assert from 'node:assert/strict';

import { renderGodeyeFieldState } from '../api/_private/operator/assets/godeye-fields.mjs';

function renderFixture() {
  const values = new Map();
  const coords = { textContent: '' };
  const status = [];
  return {
    values,
    coords,
    status,
    setText: (id, value) => values.set(id, value),
    getElement: (id) => id === 'godeyeCoords' ? coords : null,
    formatCoordinates: (lat, lon) => `${lat},${lon}`,
    updateStatus: (message) => status.push(message),
  };
}

test('Godeye field renderer preserves the unauthenticated empty state', () => {
  const fixture = renderFixture();

  renderGodeyeFieldState(fixture);

  assert.deepEqual(Object.fromEntries(fixture.values), {
    geoLat: '—',
    geoLon: '—',
    geoAccuracy: '—',
    geoHeading: '—',
    geoSpeed: '—',
  });
  assert.equal(fixture.coords.textContent, 'No GPS fix yet · tap enable to query managed Cybermap data');
  assert.deepEqual(fixture.status, []);
});

test('Godeye field renderer preserves authenticated location values and status prompt', () => {
  const fixture = renderFixture();

  renderGodeyeFieldState({
    ...fixture,
    authenticated: true,
  });
  assert.equal(fixture.status.length, 1);

  renderGodeyeFieldState({
    ...fixture,
    authenticated: true,
    currentLocation: {
      lat: 47.6205,
      lon: -122.3493,
      accuracy: 12.4,
      heading: 91.2,
      speed: 3.14,
    },
    location: {
      lat: 47.6205,
      lon: -122.3493,
      accuracy: 12.4,
      heading: 91.2,
      speed: 3.14,
    },
  });

  assert.deepEqual(Object.fromEntries(fixture.values), {
    geoLat: '47.620500',
    geoLon: '-122.349300',
    geoAccuracy: '12 m',
    geoHeading: '91°',
    geoSpeed: '3.1 m/s',
  });
  assert.equal(fixture.coords.textContent, '47.6205,-122.3493 · ±12m · 100m Cybermap radius');
  assert.equal(fixture.status.length, 1);
});

test('Godeye field renderer keeps the authenticated GPS prompt when only fallback dataset coordinates exist', () => {
  const fixture = renderFixture();

  renderGodeyeFieldState({
    ...fixture,
    authenticated: true,
    currentLocation: null,
    location: {
      lat: 47.6205,
      lon: -122.3493,
      accuracy: 12.4,
      heading: 91.2,
      speed: 3.14,
    },
  });

  assert.equal(fixture.coords.textContent, '47.6205,-122.3493 · ±12m · 100m Cybermap radius');
  assert.equal(fixture.status.length, 1);
});
