import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTileGrid, latLonToTileXY } from '../app/map-math.mjs';

test('latLonToTileXY centers the world at zoom 0', () => {
  const tile = latLonToTileXY(0, 0, 0);

  assert.equal(tile.x, 0.5);
  assert.equal(tile.y, 0.5);
});

test('buildTileGrid returns the centered world tile for a 256px viewport at zoom 0', () => {
  const tiles = buildTileGrid({
    lat: 0,
    lon: 0,
    zoom: 0,
    width: 256,
    height: 256,
    tileSize: 256,
    tileBaseUrl: 'https://tile.openstreetmap.org'
  });

  assert.equal(tiles.length, 1);
  const [tile] = tiles;
  assert.equal(tile.x, 0);
  assert.equal(tile.y, 0);
  assert.equal(tile.width, 256);
  assert.equal(tile.height, 256);
  assert.equal(tile.left, 0);
  assert.equal(tile.top, 0);
  assert.equal(tile.url, 'https://tile.openstreetmap.org/0/0/0.png');
});
