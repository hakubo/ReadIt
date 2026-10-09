// Keeps the screen on and the computer awake while any tab is reading aloud.
//
// chrome.power is only available to extension pages, so content scripts send
// KEEP_AWAKE { enabled } and this module tracks which tabs want it. The tab set
// lives in chrome.storage.session because the service worker can be stopped
// mid-read; without it a closed tab could leave the system awake forever.

const STORAGE_KEY = "keepAwakeTabs";

// Updates are a read-modify-write of session storage. Run them one at a time,
// or two overlapping ones can each miss the other's change — e.g. a lost
// "disabled" that leaves the screen on forever.
let pendingUpdate: Promise<void> = Promise.resolve();

async function loadTabs(): Promise<Set<number>> {
  const stored = await chrome.storage.session.get(STORAGE_KEY);
  const tabIds: unknown = stored[STORAGE_KEY];
  return new Set<number>(Array.isArray(tabIds) ? tabIds : []);
}

async function saveAndApply(tabs: Set<number>): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: [...tabs] });
  if (tabs.size > 0) {
    // "display" keeps the screen on too, so the highlight can be followed
    chrome.power.requestKeepAwake("display");
  } else {
    chrome.power.releaseKeepAwake();
  }
}

/** Queue a change to the tab set. `change` returns false when nothing needs saving. */
function updateTabs(change: (tabs: Set<number>) => boolean): Promise<void> {
  const update = pendingUpdate.then(async () => {
    const tabs = await loadTabs();
    if (change(tabs)) {
      await saveAndApply(tabs);
    }
  });
  // A failed update must not block the ones queued after it.
  pendingUpdate = update.catch(() => {});
  return update;
}

export function setTabKeepAwake(tabId: number, enabled: boolean): Promise<void> {
  return updateTabs((tabs) => {
    if (enabled) {
      tabs.add(tabId);
    } else {
      tabs.delete(tabId);
    }
    // Always re-apply: the power request may have been dropped meanwhile.
    return true;
  });
}

/** Drop a tab's request if it has one; tabs that never asked cost no write. */
function releaseTrackedTab(tabId: number): Promise<void> {
  return updateTabs((tabs) => tabs.delete(tabId));
}

/** Release a tab's request when it closes or navigates away mid-read. */
export function registerKeepAwakeCleanup(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void releaseTrackedTab(tabId);
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") {
      void releaseTrackedTab(tabId);
    }
  });
}
