import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_EVENTS,
  buildEventCalendarMonth,
  claimSupplyItem,
  getSupplyClaimLabel,
  normalizeClaimName,
  releaseSupplyItem,
} from '../app/public-events.mjs';

test('Great Northern Hoot is the seeded public camping event with needed supplies', () => {
  assert.equal(PUBLIC_EVENTS.length, 1);

  const [event] = PUBLIC_EVENTS;
  assert.equal(event.id, 'great-northern-hoot');
  assert.equal(event.title, 'The Great Northern Hoot');
  assert.equal(event.category, 'camping trip');
  assert.equal(event.startDate, '2026-07-17');
  assert.equal(event.endDate, '2026-07-20');
  assert.equal(event.location, 'Penrose Point State Park');
  assert.equal(event.site, '83');
  assert.ok(event.supplies.length >= 4);
  assert.ok(event.supplies.every((supply) => supply.status === 'needed'));
});

test('calendar month marks every day of the Great Northern Hoot range', () => {
  const calendar = buildEventCalendarMonth(PUBLIC_EVENTS, '2026-07');
  assert.equal(calendar.monthLabel, 'July 2026');

  const markedDates = calendar.weeks
    .flatMap((week) => week)
    .filter((day) => day.events.some((event) => event.id === 'great-northern-hoot'))
    .map((day) => day.date);

  assert.deepEqual(markedDates, [
    '2026-07-17',
    '2026-07-18',
    '2026-07-19',
    '2026-07-20',
  ]);
});

test('claim flow uses the entered name and only releases that normalized name', () => {
  const [event] = PUBLIC_EVENTS;
  const [supply] = event.supplies;
  const emptyClaims = {};

  assert.equal(normalizeClaimName('  Ada   Lovelace  '), 'Ada Lovelace');
  assert.equal(getSupplyClaimLabel(event.id, supply.id, emptyClaims), 'needed');

  const claimed = claimSupplyItem(emptyClaims, event.id, supply.id, '  Ada   Lovelace  ');
  assert.equal(claimed[event.id][supply.id], 'Ada Lovelace');
  assert.equal(getSupplyClaimLabel(event.id, supply.id, claimed), 'Ada Lovelace will bring this.');

  const wrongRelease = releaseSupplyItem(claimed, event.id, supply.id, 'Grace Hopper');
  assert.equal(wrongRelease[event.id][supply.id], 'Ada Lovelace');

  const released = releaseSupplyItem(claimed, event.id, supply.id, 'Ada Lovelace');
  assert.equal(released[event.id]?.[supply.id], undefined);
  assert.equal(getSupplyClaimLabel(event.id, supply.id, released), 'needed');
});
