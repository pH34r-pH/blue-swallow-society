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
