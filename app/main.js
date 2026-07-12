import {
  PUBLIC_EVENTS,
  buildEventCalendarMonth,
  claimSupplyItem,
  formatEventDateRange,
  getSupplyClaimLabel,
  normalizeClaimName,
  releaseSupplyItem,
} from './public-events.mjs';

const OPERATOR_SESSION_KEY = 'blue-swallow-society:operator-session';
const CLAIM_NAME_KEY = 'blue-swallow-society:event-claim-name';
const SUPPLY_CLAIMS_KEY = 'blue-swallow-society:event-supply-claims';

const $ = (id) => document.getElementById(id);

function init() {
  const loginBtn = $('loginBtn');
  const passcodeInput = $('passcodeInput');

  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  if (passcodeInput) {
    passcodeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleLogin();
      }
    });
    passcodeInput.focus();
  }

  initPublicEvents();
}

async function handleLogin() {
  const passcodeInput = $('passcodeInput');
  const loginBtn = $('loginBtn');
  const passcode = passcodeInput ? passcodeInput.value.trim() : '';

  if (!passcode) {
    return;
  }

  if (loginBtn) {
    loginBtn.disabled = true;
  }

  try {
    const session = await requestOperatorSession(passcode);
    if (session?.token) {
      persistOperatorSession(session);
      window.location.assign('/operator');
      return;
    }

    showStandardSite();
  } catch (error) {
    console.warn('Standard site fallback selected.', error);
    showStandardSite();
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
    }
  }
}

async function requestOperatorSession(passcode) {
  const response = await fetch('/api/validate-passcode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ passcode }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data?.ok === true && data.operatorSession?.token ? data.operatorSession : null;
}

function persistOperatorSession(session) {
  try {
    sessionStorage.setItem(OPERATOR_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Session storage is best-effort; the server-side cookie is the download fallback.
  }
}

function showStandardSite() {
  document.body.dataset.mode = 'standard';

  const terminalScreen = $('terminalScreen');
  const standardSite = $('standardSite');
  const passcodeInput = $('passcodeInput');

  if (terminalScreen) {
    terminalScreen.classList.remove('active');
    terminalScreen.setAttribute('aria-hidden', 'true');
  }

  if (standardSite) {
    standardSite.classList.add('active');
    standardSite.removeAttribute('aria-hidden');
  }

  if (passcodeInput) {
    passcodeInput.value = '';
  }
}

function initPublicEvents() {
  const eventsCalendar = $('eventsCalendar');
  const eventsList = $('eventsList');
  const claimNameInput = $('eventClaimName');

  if (!eventsCalendar && !eventsList) {
    return;
  }

  if (claimNameInput) {
    claimNameInput.value = readStoredClaimName();
    claimNameInput.addEventListener('input', () => {
      const claimName = normalizeClaimName(claimNameInput.value);
      writeStoredClaimName(claimName);
      updateClaimNameStatus();
      renderEventsList();
    });
    claimNameInput.addEventListener('change', () => {
      claimNameInput.value = normalizeClaimName(claimNameInput.value);
    });
  }

  if (eventsList) {
    eventsList.addEventListener('click', handleSupplyClaim);
  }

  renderEventsCalendar();
  renderEventsList();
  updateClaimNameStatus();
}

function renderEventsCalendar() {
  const container = $('eventsCalendar');
  if (!container) {
    return;
  }

  const firstEventMonth = PUBLIC_EVENTS[0]?.startDate.slice(0, 7) || '2026-07';
  const calendar = buildEventCalendarMonth(PUBLIC_EVENTS, firstEventMonth);
  container.replaceChildren();

  const heading = document.createElement('div');
  heading.className = 'calendar-heading';
  const monthLabel = document.createElement('h3');
  monthLabel.textContent = calendar.monthLabel;
  const legend = document.createElement('p');
  legend.textContent = 'Dates with event blocks are marked below.';
  heading.append(monthLabel, legend);
  container.append(heading);

  const grid = document.createElement('div');
  grid.className = 'calendar-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', `${calendar.monthLabel} events calendar`);

  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((dayName) => {
    const label = document.createElement('div');
    label.className = 'calendar-weekday';
    label.textContent = dayName;
    grid.append(label);
  });

  calendar.weeks.flat().forEach((day) => {
    const cell = document.createElement('div');
    cell.className = ['calendar-day', day.inMonth ? '' : 'is-outside', day.events.length ? 'has-event' : '']
      .filter(Boolean)
      .join(' ');
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `${day.date}${day.events.length ? `: ${day.events.map((event) => event.title).join(', ')}` : ''}`);

    const number = document.createElement('span');
    number.className = 'calendar-day-number';
    number.textContent = String(day.dayNumber);
    cell.append(number);

    day.events.forEach((event) => {
      const eventPill = document.createElement('span');
      eventPill.className = 'calendar-event-pill';
      eventPill.textContent = event.calendarLabel || event.title;
      cell.append(eventPill);
    });

    grid.append(cell);
  });

  container.append(grid);
}

function renderEventsList() {
  const container = $('eventsList');
  if (!container) {
    return;
  }

  const claims = loadSupplyClaims();
  const currentName = getCurrentClaimName();
  container.replaceChildren();

  PUBLIC_EVENTS.forEach((event) => {
    const article = document.createElement('article');
    article.className = 'event-card';

    const header = document.createElement('header');
    header.className = 'event-card-header';

    const titleBlock = document.createElement('div');
    const category = document.createElement('p');
    category.className = 'event-category';
    category.textContent = event.category;
    const title = document.createElement('h3');
    title.textContent = event.title;
    titleBlock.append(category, title);

    const date = document.createElement('p');
    date.className = 'event-date';
    date.textContent = formatEventDateRange(event);
    header.append(titleBlock, date);

    const summary = document.createElement('p');
    summary.className = 'event-summary';
    summary.textContent = event.summary;

    const meta = document.createElement('dl');
    meta.className = 'event-meta';
    appendMeta(meta, 'Location', event.location);
    appendMeta(meta, 'Site', event.site);

    const supplies = document.createElement('section');
    supplies.className = 'supplies-panel';
    supplies.setAttribute('aria-label', `${event.title} needed supplies`);

    const supplyHeading = document.createElement('h4');
    supplyHeading.textContent = 'Needed supplies';
    supplies.append(supplyHeading);

    const supplyList = document.createElement('ul');
    supplyList.className = 'supply-list';

    event.supplies.forEach((supply) => {
      supplyList.append(createSupplyListItem(event, supply, claims, currentName));
    });

    supplies.append(supplyList);
    article.append(header, summary, meta, supplies);
    container.append(article);
  });
}

function createSupplyListItem(event, supply, claims, currentName) {
  const claimant = normalizeClaimName(claims?.[event.id]?.[supply.id]);
  const statusLabel = getSupplyClaimLabel(event.id, supply.id, claims);
  const claimedByCurrentName = Boolean(currentName) && claimant === currentName;
  const isClaimedByOther = Boolean(claimant) && !claimedByCurrentName;

  const item = document.createElement('li');
  item.className = ['supply-item', claimant ? 'is-claimed' : 'is-needed'].join(' ');

  const text = document.createElement('div');
  text.className = 'supply-copy';
  const label = document.createElement('strong');
  label.textContent = supply.label;
  const status = document.createElement('span');
  status.className = 'supply-status';
  status.textContent = statusLabel;
  text.append(label, status);

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'supply-action btn';
  action.dataset.eventId = event.id;
  action.dataset.supplyId = supply.id;

  if (claimedByCurrentName) {
    action.dataset.supplyAction = 'release';
    action.textContent = 'erase my name';
  } else if (isClaimedByOther) {
    action.disabled = true;
    action.textContent = 'claimed';
    action.title = 'Choose this claim name to edit it.';
  } else {
    action.dataset.supplyAction = 'claim';
    action.textContent = 'I’ll bring this';
  }

  item.append(text, action);
  return item;
}

function handleSupplyClaim(event) {
  const button = event.target.closest('button[data-supply-action]');
  if (!button) {
    return;
  }

  const claimName = getCurrentClaimName();
  if (!claimName) {
    updateClaimNameStatus('Enter a name before claiming supplies.');
    $('eventClaimName')?.focus();
    return;
  }

  const eventId = button.dataset.eventId;
  const supplyId = button.dataset.supplyId;
  const action = button.dataset.supplyAction;
  const claims = loadSupplyClaims();
  const nextClaims = action === 'release'
    ? releaseSupplyItem(claims, eventId, supplyId, claimName)
    : claimSupplyItem(claims, eventId, supplyId, claimName);

  saveSupplyClaims(nextClaims);
  renderEventsList();
  updateClaimNameStatus(`${claimName} is the active supply-claim name.`);
}

function appendMeta(meta, label, value) {
  const term = document.createElement('dt');
  term.textContent = label;
  const detail = document.createElement('dd');
  detail.textContent = value;
  meta.append(term, detail);
}

function getCurrentClaimName() {
  return normalizeClaimName($('eventClaimName')?.value || readStoredClaimName());
}

function updateClaimNameStatus(message) {
  const status = $('eventClaimNameStatus');
  if (!status) {
    return;
  }

  status.textContent = message || (getCurrentClaimName()
    ? `${getCurrentClaimName()} is the active supply-claim name.`
    : 'No name selected yet.');
}

function readStoredClaimName() {
  try {
    return normalizeClaimName(localStorage.getItem(CLAIM_NAME_KEY));
  } catch {
    return '';
  }
}

function writeStoredClaimName(claimName) {
  try {
    if (claimName) {
      localStorage.setItem(CLAIM_NAME_KEY, claimName);
    } else {
      localStorage.removeItem(CLAIM_NAME_KEY);
    }
  } catch {
    // Claim names are a POC convenience; ignore storage failures.
  }
}

function loadSupplyClaims() {
  try {
    return JSON.parse(localStorage.getItem(SUPPLY_CLAIMS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveSupplyClaims(claims) {
  try {
    localStorage.setItem(SUPPLY_CLAIMS_KEY, JSON.stringify(claims));
  } catch {
    // Claims are local-only in this POC; ignore storage failures.
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
