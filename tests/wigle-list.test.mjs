import test from 'node:test';
import assert from 'node:assert/strict';

import { renderWigleList } from '../api/_private/operator/assets/wigle-list.mjs';

function createElement(tagName) {
  return {
    tagName,
    children: [],
    className: '',
    textContent: '',
    appendChild(child) {
      this.children.push(child);
    },
    replaceChildren(...children) {
      this.children = children.flatMap((child) => child.tagName === 'fragment' ? child.children : [child]);
    },
  };
}

function createDocument() {
  return {
    createElement,
    createDocumentFragment: () => createElement('fragment'),
  };
}

test('WiGLE list renderer keeps the bounded empty state', () => {
  const container = createElement('section');

  renderWigleList({
    container,
    records: [],
    documentRef: createDocument(),
    formatCoordinates: () => 'unused',
  });

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tagName, 'p');
  assert.equal(container.children[0].className, 'dashboard-empty-state');
  assert.equal(container.children[0].textContent, 'Cybermap observations will appear here when available.');
});

test('WiGLE list renderer preserves ordering, limit, and evidence labels', () => {
  const container = createElement('section');
  const records = [
    {
      ssid: 'Managed AP',
      bssid: 'aa:bb:cc:dd:ee:01',
      signalDbm: -48,
      channel: 11,
      signalBand: 'good',
      source: 'cybermap-postgis',
      vendor: 'Ubiquiti',
      security: 'WPA2',
      estimatedRange: { label: 'very near' },
      lat: 47.6205,
      lon: -122.3493,
      distanceMeters: 12.4,
    },
    { ssid: 'Second AP', bssid: 'aa:bb:cc:dd:ee:02' },
  ];

  renderWigleList({
    container,
    records,
    limit: 1,
    documentRef: createDocument(),
    formatCoordinates: (lat, lon) => `${lat},${lon}`,
  });

  assert.equal(container.children.length, 1);
  const item = container.children[0];
  assert.equal(item.className, 'wigle-item');
  assert.equal(item.children[0].textContent, '1. Managed AP');
  assert.match(item.children[1].textContent, /-48 dBm · ch 11 · good · cybermap-postgis/);
  assert.match(item.children[2].textContent, /Ubiquiti · WPA2 · very near · 47\.6205,-122\.3493 · 12 m away/);
});
