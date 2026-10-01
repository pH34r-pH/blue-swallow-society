export function renderGodeyeFieldState({
  location = null,
  currentLocation = null,
  authenticated = false,
  setText,
  getElement,
  formatCoordinates,
  updateStatus,
} = {}) {
  setText('geoLat', location ? location.lat.toFixed(6) : '—');
  setText('geoLon', location ? location.lon.toFixed(6) : '—');
  setText('geoAccuracy', location ? `${Math.round(location.accuracy || 0)} m` : '—');
  setText('geoHeading', location && location.heading !== null ? `${Math.round(location.heading)}°` : '—');
  setText('geoSpeed', location && location.speed !== null ? `${location.speed.toFixed(1)} m/s` : '—');

  const coords = getElement('godeyeCoords');
  if (coords) {
    coords.textContent = location
      ? `${formatCoordinates(location.lat, location.lon)} · ±${Math.round(location.accuracy || 0)}m · 100m Cybermap radius`
      : 'No GPS fix yet · tap enable to query managed Cybermap data';
  }

  if (!currentLocation && authenticated) {
    updateStatus('Tap enable to request GPS and query managed Cybermap observations around your current fix.');
  }
}
