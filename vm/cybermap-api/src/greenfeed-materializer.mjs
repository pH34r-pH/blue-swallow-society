import { cellToParent, latLngToCell } from 'h3-js';

const H3_RESOLUTIONS = Object.freeze([5, 7, 9, 11]);

export function materializeGreenfeedSnapshots(snapshots) {
  if (!Array.isArray(snapshots)) throw new TypeError('snapshots must be an array.');

  const uniqueSnapshots = new Map();
  for (const snapshot of snapshots) {
    uniqueSnapshots.set(snapshotIdentity(snapshot), snapshot);
  }

  const observations = [...uniqueSnapshots.values()]
    .map((snapshot) => ({ external_event_key: externalEventKey(snapshot) }))
    .sort((left, right) => left.external_event_key.localeCompare(right.external_event_key));

  const cells = new Map();
  for (const snapshot of uniqueSnapshots.values()) {
    const h3_11 = latLngToCell(snapshot.location.latitude, snapshot.location.longitude, 11);
    for (const resolution of H3_RESOLUTIONS) {
      const h3_cell = resolution === 11 ? h3_11 : cellToParent(h3_11, resolution);
      const key = `${resolution}:${h3_cell}`;
      const cell = cells.get(key) ?? createCell({ resolution, h3_cell });
      cell.observation_count += 1;
      cell.entity_count += snapshot.entity_count;
      cell.source_classes.add(snapshot.source_class);
      cell.layers.set(snapshot.layer_id, (cell.layers.get(snapshot.layer_id) ?? 0) + 1);
      cells.set(key, cell);
    }
  }

  return {
    observations,
    cells: [...cells.values()]
      .map(toAggregateCell)
      .sort((left, right) => left.resolution - right.resolution || left.h3_cell.localeCompare(right.h3_cell)),
  };
}

function snapshotIdentity(snapshot) {
  return `${snapshot.source_id}:${snapshot.provider_event_id}`;
}

function externalEventKey(snapshot) {
  return `greenfeed:${snapshot.layer_id}:${snapshot.provider_event_id}`;
}

function createCell({ resolution, h3_cell }) {
  return {
    resolution,
    h3_cell,
    observation_count: 0,
    entity_count: 0,
    source_classes: new Set(),
    layers: new Map(),
  };
}

function toAggregateCell(cell) {
  return {
    resolution: cell.resolution,
    h3_cell: cell.h3_cell,
    observation_count: cell.observation_count,
    entity_count: cell.entity_count,
    source_classes: [...cell.source_classes].sort(),
    layers: Object.fromEntries(
      [...cell.layers.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([layerId, observation_count]) => [layerId, { observation_count }]),
    ),
  };
}
