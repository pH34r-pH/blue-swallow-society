export function renderWigleList({
  container,
  records,
  limit = 6,
  documentRef = document,
  formatCoordinates,
} = {}) {
  if (!container) {
    return;
  }

  const limitedRecords = records.slice(0, limit);
  if (!limitedRecords.length) {
    const empty = documentRef.createElement('p');
    empty.className = 'dashboard-empty-state';
    empty.textContent = 'Cybermap observations will appear here when available.';
    container.replaceChildren(empty);
    return;
  }

  const fragment = documentRef.createDocumentFragment();
  limitedRecords.forEach((record, index) => {
    const item = documentRef.createElement('article');
    item.className = 'wigle-item';

    const title = documentRef.createElement('strong');
    title.className = 'wigle-item-title';
    title.textContent = `${index + 1}. ${record.ssid || record.bssid || 'Unknown network'}`;
    item.appendChild(title);

    const meta = documentRef.createElement('div');
    meta.className = 'wigle-item-meta';
    meta.textContent = [
      record.signalDbm === null || record.signalDbm === undefined ? null : `${record.signalDbm} dBm`,
      record.channel ? `ch ${record.channel}` : null,
      record.signalBand || null,
      record.source || null,
    ].filter(Boolean).join(' · ') || 'Cybermap observation';
    item.appendChild(meta);

    const detail = documentRef.createElement('p');
    detail.className = 'wigle-item-detail';
    detail.textContent = [
      record.vendor || null,
      record.security || null,
      record.estimatedRange?.label || null,
      Number.isFinite(record.lat) && Number.isFinite(record.lon)
        ? formatCoordinates(record.lat, record.lon)
        : null,
      Number.isFinite(record.distanceMeters) ? `${Math.round(record.distanceMeters)} m away` : null,
    ].filter(Boolean).join(' · ') || 'Signal hint only';
    item.appendChild(detail);

    fragment.appendChild(item);
  });

  container.replaceChildren(fragment);
}
