import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionTabController } from '../api/_private/operator/assets/companion-tabs.mjs';

function tabButtons() {
  return ['godeye', 'entities', 'world', 'devices'].map((tab) => ({
    dataset: { tab },
    focus() { this.focused = true; },
  }));
}

test('companion tab controller preserves lifecycle order and focus', () => {
  const state = { activeTab: 'godeye', authenticated: true };
  const buttons = tabButtons();
  const panels = [{ id: 'godeye-tab' }, { id: 'entities-tab' }, { id: 'world-tab' }, { id: 'devices-tab' }];
  const calls = [];
  const aria = [];
  const controller = createCompanionTabController({
    state,
    getTabButtons: () => buttons,
    getTabPanels: () => panels,
    setTabAria: (...args) => aria.push(args),
    lifecycle: {
      deactivateTravels: () => calls.push('deactivate-travels'),
      stopGodeyeFeed: () => calls.push('stop-godeye'),
      activateWorld: () => calls.push('activate-world'),
      initGodeyeTab: () => calls.push('init-godeye'),
      activateGodeyeMode: (mode) => calls.push(`mode:${mode}`),
      scheduleGodeyeRender: () => calls.push('schedule-godeye'),
    },
  });

  controller.activateByIndex(2, { focus: true });

  assert.equal(state.activeTab, 'world');
  assert.equal(buttons[2].focused, true);
  assert.equal(aria.length, 1);
  assert.deepEqual(calls, ['deactivate-travels', 'stop-godeye', 'activate-world', 'init-godeye', 'mode:global', 'schedule-godeye']);
});

test('companion tab controller does not restart an already active tab', () => {
  const state = { activeTab: 'entities', authenticated: true };
  const buttons = tabButtons();
  let ariaCalls = 0;
  const controller = createCompanionTabController({
    state,
    getTabButtons: () => buttons,
    getTabPanels: () => [],
    setTabAria: () => { ariaCalls += 1; },
  });

  controller.activate('entities', { focus: true });

  assert.equal(buttons[1].focused, true);
  assert.equal(ariaCalls, 0);
});

test('companion tab controller handles reverse World-to-Travels transitions around nearby state', () => {
  for (const nearbyOpen of [true, false]) {
    const state = { activeTab: 'world', authenticated: true };
    const buttons = tabButtons();
    const calls = [];
    const aria = [];
    const controller = createCompanionTabController({
      state,
      getTabButtons: () => buttons,
      getTabPanels: () => [],
      setTabAria: (...args) => aria.push(args),
      lifecycle: {
        deactivateWorld: () => calls.push('deactivate-world'),
        activateTravels: () => calls.push('activate-travels'),
        isNearbyOpen: () => nearbyOpen,
        initGodeyeTab: () => calls.push('init-godeye'),
        activateGodeyeMode: (mode) => calls.push(`mode:${mode}`),
        scheduleGodeyeRender: () => calls.push('schedule-godeye'),
      },
    });

    controller.activate('godeye');

    assert.equal(state.activeTab, 'godeye');
    assert.equal(aria.length, 1);
    assert.deepEqual(calls, [
      'deactivate-world',
      'activate-travels',
      ...(nearbyOpen ? ['init-godeye', 'mode:field', 'schedule-godeye'] : []),
    ]);
  }
});

test('companion tab controller wraps indices and ignores empty or unknown targets', () => {
  const state = { activeTab: 'entities', authenticated: true };
  const buttons = tabButtons();
  const aria = [];
  const controller = createCompanionTabController({
    state,
    getTabButtons: () => buttons,
    getTabPanels: () => [],
    setTabAria: (...args) => aria.push(args),
    lifecycle: { activateTravels: () => {} },
  });

  controller.activateByIndex(-1);
  assert.equal(state.activeTab, 'devices');
  assert.equal(aria.at(-1)[2], 3);
  controller.activateByIndex(buttons.length);
  assert.equal(state.activeTab, 'godeye');
  assert.equal(aria.at(-1)[2], 0);
  const beforeUnknown = aria.length;
  controller.activate('unknown');
  assert.equal(aria.length, beforeUnknown);

  const emptyAria = [];
  const empty = createCompanionTabController({
    state,
    getTabButtons: () => [],
    getTabPanels: () => [],
    setTabAria: (...args) => emptyAria.push(args),
  });
  empty.activateByIndex(7);
  empty.activate('godeye');
  assert.equal(emptyAria.length, 0);
});

test('companion tab controller reset only reapplies the first panel and repeated transitions are idempotent', () => {
  const state = { activeTab: 'godeye', authenticated: true };
  const buttons = tabButtons();
  const panels = [{ id: 'godeye-tab' }];
  const calls = [];
  const aria = [];
  const controller = createCompanionTabController({
    state,
    getTabButtons: () => buttons,
    getTabPanels: () => panels,
    setTabAria: (...args) => aria.push(args),
    lifecycle: {
      stopGodeyeFeed: () => calls.push('stop-godeye'),
      deactivateTravels: () => calls.push('deactivate-travels'),
      activateWorld: () => calls.push('activate-world'),
      deactivateWorld: () => calls.push('deactivate-world'),
      activateTravels: () => calls.push('activate-travels'),
      isNearbyOpen: () => false,
    },
  });

  controller.activate('world');
  controller.activate('world');
  controller.activate('godeye');
  controller.activate('godeye');
  controller.reset();

  assert.equal(state.activeTab, 'godeye');
  assert.deepEqual(calls, ['deactivate-travels', 'stop-godeye', 'activate-world', 'deactivate-world', 'activate-travels']);
  assert.equal(aria.at(-1)[2], 0);
});
