export const PUBLIC_EVENTS = [
  {
    id: 'great-northern-hoot',
    title: 'The Great Northern Hoot',
    calendarLabel: 'Hoot',
    category: 'camping trip',
    startDate: '2026-07-17',
    endDate: '2026-07-20',
    location: 'Penrose Point State Park',
    site: '83',
    summary: 'A long-weekend campout at Penrose Point. Site 83 is the rendezvous point.',
    supplies: [
      { id: 'drinking-water', label: 'Drinking water', status: 'needed' },
      { id: 'firewood', label: 'Firewood bundle', status: 'needed' },
      { id: 'cooler-ice', label: 'Cooler ice', status: 'needed' },
      { id: 'shared-snacks', label: 'Shared snacks', status: 'needed' },
      { id: 'camp-chairs', label: 'Camp chairs', status: 'needed' },
    ],
  },
];

const ISO_DATE_RE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/;

export function normalizeClaimName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function claimSupplyItem(claims, eventId, supplyId, name) {
  const claimant = normalizeClaimName(name);
  const nextClaims = cloneClaims(claims);

  if (!claimant) {
    return nextClaims;
  }

  nextClaims[eventId] = {
    ...(nextClaims[eventId] || {}),
    [supplyId]: claimant,
  };

  return nextClaims;
}

export function releaseSupplyItem(claims, eventId, supplyId, name) {
  const claimant = normalizeClaimName(name);
  const nextClaims = cloneClaims(claims);
  const existingClaimant = normalizeClaimName(nextClaims[eventId]?.[supplyId]);

  if (!claimant || existingClaimant !== claimant) {
    return nextClaims;
  }

  delete nextClaims[eventId][supplyId];

  if (Object.keys(nextClaims[eventId]).length === 0) {
    delete nextClaims[eventId];
  }

  return nextClaims;
}

export function getSupplyClaimLabel(eventId, supplyId, claims) {
  const claimant = normalizeClaimName(claims?.[eventId]?.[supplyId]);
  return claimant ? `${claimant} will bring this.` : 'needed';
}

export function buildEventCalendarMonth(events, monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOffset = firstOfMonth.getUTCDay();
  const gridStart = addDays(firstOfMonth, -startOffset);
  const weeks = [];

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = addDays(gridStart, weekIndex * 7 + dayIndex);
      const isoDate = toIsoDate(date);
      week.push({
        date: isoDate,
        dayNumber: date.getUTCDate(),
        inMonth: date.getUTCFullYear() === year && date.getUTCMonth() === month - 1,
        events: events.filter((event) => isoDate >= event.startDate && isoDate <= event.endDate),
      });
    }
    weeks.push(week);
  }

  return {
    month: monthKey,
    monthLabel: new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(firstOfMonth),
    weeks,
  };
}

export function formatEventDateRange(event) {
  const start = parseIsoDate(event.startDate);
  const end = parseIsoDate(event.endDate);
  const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(start);
    return `${monthLabel} ${start.getUTCDate()}–${end.getUTCDate()}, ${start.getUTCFullYear()}`;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function cloneClaims(claims) {
  if (!claims || typeof claims !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(claims)
      .filter(([, eventClaims]) => eventClaims && typeof eventClaims === 'object')
      .map(([eventId, eventClaims]) => [
        eventId,
        Object.fromEntries(
          Object.entries(eventClaims)
            .map(([supplyId, claimant]) => [supplyId, normalizeClaimName(claimant)])
            .filter(([, claimant]) => Boolean(claimant)),
        ),
      ])
      .filter(([, eventClaims]) => Object.keys(eventClaims).length > 0),
  );
}

function parseMonthKey(monthKey) {
  const match = /^(?<year>\d{4})-(?<month>\d{2})$/.exec(monthKey);
  if (!match) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }

  return {
    year: Number(match.groups.year),
    month: Number(match.groups.month),
  };
}

function parseIsoDate(value) {
  const match = ISO_DATE_RE.exec(value);
  if (!match) {
    throw new Error(`Invalid ISO date: ${value}`);
  }

  return new Date(Date.UTC(
    Number(match.groups.year),
    Number(match.groups.month) - 1,
    Number(match.groups.day),
  ));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}
