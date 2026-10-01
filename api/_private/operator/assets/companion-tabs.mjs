export function createCompanionTabController({
  state,
  getTabButtons,
  getTabPanels,
  setTabAria,
  lifecycle = {},
} = {}) {
  return Object.freeze({ activate, activateByIndex, reset });

  function activate(tabKey, { focus = false } = {}) {
    const tabButtons = getTabButtons();
    const tabPanels = getTabPanels();
    const nextIndex = tabButtons.findIndex((button) => button.dataset.tab === tabKey);
    if (nextIndex === -1) return;
    activateByIndex(nextIndex, { focus, tabButtons, tabPanels });
  }

  function activateByIndex(index, {
    focus = false,
    tabButtons = getTabButtons(),
    tabPanels = getTabPanels(),
  } = {}) {
    if (!tabButtons.length) return;
    const normalizedIndex = normalizeIndex(index, tabButtons.length);
    const nextButton = tabButtons[normalizedIndex];
    const nextTabKey = nextButton?.dataset.tab || 'landing';
    if (nextTabKey === state.activeTab && state.authenticated) {
      focusButton(nextButton, focus);
      return;
    }

    leaveTab(state.activeTab, nextTabKey);
    setTabAria(tabButtons, tabPanels, normalizedIndex);
    state.activeTab = nextTabKey;
    enterTab(nextTabKey);
    focusButton(nextButton, focus);
  }

  function reset() {
    setTabAria(getTabButtons(), getTabPanels(), 0);
  }

  function leaveTab(currentTab, nextTab) {
    if (currentTab === 'ar' && nextTab !== 'ar') lifecycle.stopArFeed?.();
    if (currentTab === 'world' && nextTab !== 'world') lifecycle.deactivateWorld?.();
    if (currentTab === 'godeye' && nextTab !== 'godeye') {
      lifecycle.deactivateTravels?.();
      lifecycle.stopGodeyeFeed?.();
    }
  }

  function enterTab(nextTab) {
    if (nextTab === 'ar') lifecycle.initArTab?.();
    if (nextTab === 'godeye') lifecycle.activateTravels?.();
    if (nextTab === 'world') lifecycle.activateWorld?.();
    if (needsGodeyeSetup(nextTab)) {
      lifecycle.initGodeyeTab?.();
      lifecycle.activateGodeyeMode?.(nextTab === 'world' ? 'global' : 'field');
      lifecycle.scheduleGodeyeRender?.();
    }
  }

  function needsGodeyeSetup(nextTab) {
    return nextTab === 'world'
      || (nextTab === 'godeye' && lifecycle.isNearbyOpen?.());
  }
}

function normalizeIndex(index, length) {
  return ((index % length) + length) % length;
}

function focusButton(button, shouldFocus) {
  if (shouldFocus) button?.focus();
}
