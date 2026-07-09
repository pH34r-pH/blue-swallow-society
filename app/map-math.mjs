const MAX_LATITUDE = 85.05112878;
const DEFAULT_TILE_BASE_URL = 'https://tile.openstreetmap.org';
const EARTH_CIRCUMFERENCE = 40075016.68557849;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function latLonToTileXY(lat, lon, zoom) {
  const clampedLat = clamp(lat, -MAX_LATITUDE, MAX_LATITUDE);
  const scale = 2 ** zoom;
  const x = ((lon + 180) / 360) * scale;
  const latRad = (clampedLat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;

  return { x, y };
}

export function tileUrl(x, y, zoom, baseUrl = DEFAULT_TILE_BASE_URL) {
  return `${baseUrl}/${zoom}/${x}/${y}.png`;
}

export function wrapTileIndex(index, zoom) {
  const scale = 2 ** zoom;
  return ((index % scale) + scale) % scale;
}

export function metersPerPixel(lat, zoom, tileSize = 256) {
  const latRad = (lat * Math.PI) / 180;
  return (Math.cos(latRad) * EARTH_CIRCUMFERENCE) / (tileSize * 2 ** zoom);
}

export function buildTileGrid({
  lat,
  lon,
  zoom,
  width,
  height,
  tileSize = 256,
  tileBaseUrl = DEFAULT_TILE_BASE_URL
}) {
  const center = latLonToTileXY(lat, lon, zoom);
  const worldPixelX = center.x * tileSize;
  const worldPixelY = center.y * tileSize;
  const topLeftX = worldPixelX - width / 2;
  const topLeftY = worldPixelY - height / 2;
  const minTileX = Math.floor(topLeftX / tileSize);
  const maxTileX = Math.floor((topLeftX + width - 1) / tileSize);
  const minTileY = Math.floor(topLeftY / tileSize);
  const maxTileY = Math.floor((topLeftY + height - 1) / tileSize);
  const tiles = [];
  const scale = 2 ** zoom;

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= scale) {
      continue;
    }

    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const screenLeft = tileX * tileSize - topLeftX;
      const screenTop = tileY * tileSize - topLeftY;
      const wrappedX = wrapTileIndex(tileX, zoom);

      tiles.push({
        x: wrappedX,
        y: tileY,
        rawX: tileX,
        left: screenLeft,
        top: screenTop,
        width: tileSize,
        height: tileSize,
        url: tileUrl(wrappedX, tileY, zoom, tileBaseUrl)
      });
    }
  }

  tiles.center = center;
  tiles.topLeftX = topLeftX;
  tiles.topLeftY = topLeftY;
  return tiles;
}

export function formatCoordinatePair(lat, lon, decimals = 5) {
  return `${lat.toFixed(decimals)}, ${lon.toFixed(decimals)}`;
}
