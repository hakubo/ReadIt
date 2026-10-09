// Background service worker for the Read it! extension
// Manages offscreen document for TTS generation and routes its messages to the active tab

import { isMessageForRead } from "@/shared/readId";
import { registerKeepAwakeCleanup, setTabKeepAwake } from "./keepAwake";

let creatingOffscreen: Promise<void> | null = null;
let activeTabId: number | null = null;
// Read id of the active tab's current read (see shared/readId.ts)
let activeReadId: string | null = null;
// Tab whose settings panel asked for a voice preview; it gets PREVIEW_STATE.
let previewTabId: number | null = null;
// Keep the offscreen document (and its loaded model) warm for a while after
// playback ends or is reset, so the next read skips re-loading the 326 MB model.
// Closing the document is what frees the model memory. An alarm, not
// setTimeout: a timer is lost when the service worker is stopped.
const OFFSCREEN_IDLE_ALARM = "offscreen-idle-close";
const OFFSCREEN_IDLE_MINUTES = 3;

// Restore the active read from session storage (survives service worker restarts)
chrome.storage.session.get(["activeTabId", "activeReadId"]).then((result) => {
  if (result.activeTabId != null && activeTabId === null) {
    activeTabId = result.activeTabId as number;
    activeReadId = (result.activeReadId as string | undefined) ?? null;
  }
});

function setActiveRead(tabId: number | null, readId: string | null) {
  activeTabId = tabId;
  activeReadId = tabId === null ? null : readId;
  if (tabId !== null) {
    chrome.storage.session.set({ activeTabId: tabId, activeReadId });
  } else {
    chrome.storage.session.remove(["activeTabId", "activeReadId"]);
  }
}

type OffscreenStatus = { alive: boolean; busy: boolean };

// Quick health-check: alive if offscreen responds, busy while it is generating
// or previewing. Not alive on timeout/error (including no offscreen document).
function pingOffscreen(): Promise<OffscreenStatus> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ alive: false, busy: false }), 2000);
    chrome.runtime.sendMessage({ type: "OFFSCREEN_PING" }, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError || !response?.pong) {
        resolve({ alive: false, busy: false });
        return;
      }
      resolve({ alive: true, busy: Boolean(response.busy) });
    });
  });
}

const OFFSCREEN_READY_TIMEOUT_MS = 5000;
const OFFSCREEN_READY_POLL_MS = 100;

/**
 * Resolves once the offscreen document's message listener is up: on its
 * OFFSCREEN_READY message, or a ping answered (in case that message was
 * missed), or after a timeout. Must be called BEFORE createDocument(): the
 * document often sends OFFSCREEN_READY before createDocument() resolves, and a
 * listener added afterwards misses it and waits out the whole timeout.
 */
function waitForOffscreenReady(): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timeout);
      clearInterval(poll);
      chrome.runtime.onMessage.removeListener(listener);
      resolve();
    };
    const listener = (msg: { type: string }) => {
      if (msg.type === "OFFSCREEN_READY") {
        finish();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    const timeout = setTimeout(finish, OFFSCREEN_READY_TIMEOUT_MS);
    const poll = setInterval(() => {
      pingOffscreen().then(({ alive }) => alive && finish());
    }, OFFSCREEN_READY_POLL_MS);
  });
}

async function createOffscreenDocument() {
  const offscreenUrl = "offscreen.html";

  creatingOffscreen = (async () => {
    const ready = waitForOffscreenReady();
    await chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: [
        chrome.offscreen.Reason.WORKERS,
      ],
      justification: "TTS inference via ONNX web workers",
    });
    await ready;
  })();

  await creatingOffscreen;
  creatingOffscreen = null;
}

async function setupOffscreenDocument() {
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  const offscreenUrl = "offscreen.html";
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(offscreenUrl)],
  });

  if (existingContexts.length > 0) {
    // Context exists — verify it's actually alive
    const { alive } = await pingOffscreen();
    if (alive) {return;}

    // Dead context — tear it down before recreating
    console.warn("Offscreen document found but unresponsive, recreating...");
    await closeOffscreenDocument();
  }

  await createOffscreenDocument();
}

async function closeOffscreenDocument() {
  try {
    await chrome.offscreen.closeDocument();
    console.log("Offscreen document closed");
  } catch {
    // Document might not exist
  }
}

function scheduleOffscreenIdleClose() {
  // Creating an alarm with an existing name replaces it, restarting the delay.
  chrome.alarms.create(OFFSCREEN_IDLE_ALARM, { delayInMinutes: OFFSCREEN_IDLE_MINUTES });
}

function cancelOffscreenIdleClose() {
  chrome.alarms.clear(OFFSCREEN_IDLE_ALARM).catch(() => {});
}

// The alarm can fire while a read is still generating (e.g. a preview ended
// meanwhile), so ask offscreen first. A busy document gets the close scheduled
// again when its read ends or is reset.
async function closeOffscreenIfIdle() {
  const { busy } = await pingOffscreen();
  if (busy) {return;}
  await closeOffscreenDocument();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === OFFSCREEN_IDLE_ALARM) {
    void closeOffscreenIfIdle();
  }
});

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  console.log("Read it! extension installed");

  chrome.contextMenus.create({
    id: "kokoro-open-settings",
    title: "Open Settings",
    contexts: ["action"],
  });
  // Local builds only: a menu item can't be swallowed by the page the way a
  // keyboard shortcut can (pages may stop key events before content scripts).
  if (__DEBUG_TOOLS__) {
    chrome.contextMenus.create({
      id: "readit-toggle-debug",
      title: "Toggle debug panel",
      contexts: ["action", "page", "selection"],
    });
  }
});

// Handle browser icon click — toggle extension on/off for the domain.
// The content script determines the new state based on actual player visibility
// and persists the preference, so the background just forwards the signal.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {return;}
  chrome.tabs.sendMessage(tab.id, { type: "EXTENSION_TOGGLE" }).catch(() => {});
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "kokoro-open-settings" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "OPEN_SETTINGS" }).catch(() => {});
  }
  if (info.menuItemId === "readit-toggle-debug" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_DEBUG_PANEL" }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === previewTabId) {
    previewTabId = null;
  }
  if (tabId === activeTabId) {
    setActiveRead(null, null);
    closeOffscreenDocument();
  }
});

// When the active tab reloads or navigates, abort generation and close offscreen
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === "loading") {
    const readId = activeReadId;
    setActiveRead(null, null);
    cancelOffscreenIdleClose();
    chrome.runtime.sendMessage({ type: "PLAYER_RESET", readId }).catch(() => {});
    closeOffscreenDocument();
  }
});

function forwardToActiveTab(message: unknown) {
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, message).catch(() => {});
  }
}

function forwardToPreviewTab(message: unknown) {
  if (previewTabId !== null) {
    chrome.tabs.sendMessage(previewTabId, message).catch(() => {});
  }
}

const CACHE_NAME = "kokoro-tts-resources";
const DL_BASE = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231";

registerKeepAwakeCleanup();

function handleCheckCacheStatus(voiceIds: string[], sendResponse: (response: unknown) => void) {
  (async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const modelCached = !!(await cache.match(`${DL_BASE}/onnx/model.onnx`));
      const cachedVoices: string[] = [];
      await Promise.all(
        voiceIds.map(async (id: string) => {
          if (await cache.match(`${DL_BASE}/voices/${id}.bin`)) {
            cachedVoices.push(id);
          }
        })
      );
      sendResponse({ modelCached, cachedVoices });
    } catch {
      sendResponse({ modelCached: false, cachedVoices: [] });
    }
  })();
}

function handleGenerateRequest(
  message: { sentences: string[]; quotedSentences?: number[]; hints?: unknown; settings: unknown; readId?: string },
  senderTabId: number | null,
  sendResponse: (response: unknown) => void,
) {
  cancelOffscreenIdleClose();
  // If another tab was playing, tell it to reset
  if (activeTabId && activeTabId !== senderTabId) {
    chrome.tabs.sendMessage(activeTabId, { type: "PLAYBACK_INTERRUPTED" }).catch(() => {});
  }
  const readId = message.readId ?? null;
  setActiveRead(senderTabId, readId);
  handleTTSRequest(message, readId)
    .then((result) => sendResponse(result))
    .catch((error) =>
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    );
}

// Warm-up when the user is about to read (selection button shown, player
// hovered): create offscreen and let it load the model ahead of Play. The idle
// close is re-armed so an unused warm-up doesn't keep the model in memory.
function handleWarmUpRequest(voiceId: string) {
  cancelOffscreenIdleClose();
  setupOffscreenDocument()
    .then(() => {
      chrome.runtime.sendMessage({ type: "OFFSCREEN_WARM_UP", voiceId });
      scheduleOffscreenIdleClose();
    })
    .catch((error: unknown) => console.warn("[Read it!] Warm-up setup failed:", error));
}

// Voice preview: ensure offscreen exists, then forward. The previewing tab
// gets PREVIEW_STATE; activeTabId stays with the tab that is reading.
function handlePreviewRequest(voiceId: string, senderTabId: number | null) {
  previewTabId = senderTabId;
  cancelOffscreenIdleClose();
  setupOffscreenDocument().then(() => {
    chrome.runtime.sendMessage({ type: "OFFSCREEN_PREVIEW_VOICE", voiceId });
  });
}

const FORWARDED_TO_ACTIVE_TAB = new Set([
  "TTS_PROGRESS",
  "TTS_STREAM_START",
  "TTS_AUDIO_CHUNK",
  "TTS_STREAM_END",
  "TTS_SENTENCE_WAV",
  "TTS_TIMING",
  "MODEL_DOWNLOAD_PROGRESS",
  "MODEL_DOWNLOAD_COMPLETE",
  "VOICE_DOWNLOAD_START",
  "VOICE_DOWNLOAD_COMPLETE",
]);

// Offscreen keeps working while it streams, downloads or is advanced, so the
// idle close must not fire meanwhile.
const KEEPS_OFFSCREEN_BUSY = new Set([
  "TTS_STREAM_START",
  "MODEL_DOWNLOAD_PROGRESS",
  "REGENERATE_SENTENCE",
  "ADVANCE_GENERATION",
]);

/** Idle-close bookkeeping for messages passing through (not handled elsewhere). */
function trackOffscreenActivity(message: { type: string; readId?: unknown; playing?: unknown }) {
  if (KEEPS_OFFSCREEN_BUSY.has(message.type)) {
    cancelOffscreenIdleClose();
  }
  // Close offscreen once idle to free ONNX/WASM memory. An aborted read never
  // sends TTS_STREAM_END, and offscreen keeps the model on abort, so a reset
  // schedules the close too — but only the active read's own reset: another
  // tab's player closing says nothing about this read.
  const ownReset = message.type === "PLAYER_RESET" && isMessageForRead(message, activeReadId);
  const previewEnded = message.type === "PREVIEW_STATE" && message.playing === false;
  if (message.type === "TTS_STREAM_END" || ownReset || previewEnded) {
    scheduleOffscreenIdleClose();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const senderTabId = sender.tab?.id ?? null;

  if (message.type === "KEEP_AWAKE") {
    if (senderTabId !== null) {
      void setTabKeepAwake(senderTabId, Boolean(message.enabled));
    }
    return;
  }

  // Check Browser Cache API for model and voice files
  if (message.type === "CHECK_CACHE_STATUS") {
    handleCheckCacheStatus(message.voiceIds || [], sendResponse);
    return true;
  }

  // From content script: start TTS generation
  if (message.type === "GENERATE_TTS") {
    handleGenerateRequest(message, senderTabId, sendResponse);
    return true;
  }

  if (message.type === "PREVIEW_VOICE") {
    handlePreviewRequest(message.voiceId, senderTabId);
    return true;
  }

  if (message.type === "WARM_UP") {
    handleWarmUpRequest(String(message.voiceId));
    return;
  }

  // REGENERATE_SENTENCE, ADVANCE_GENERATION and PLAYER_RESET are broadcast to
  // all contexts via chrome.runtime.sendMessage — offscreen receives them
  // directly, no forwarding needed.
  trackOffscreenActivity(message);

  // From offscreen: forward progress/state/wav to content script
  if (FORWARDED_TO_ACTIVE_TAB.has(message.type)) {
    forwardToActiveTab(message);
  }
  if (message.type === "PREVIEW_STATE") {
    forwardToPreviewTab(message);
  }
});

async function handleTTSRequest(
  { sentences, quotedSentences = [], hints = {}, settings }: { sentences: string[]; quotedSentences?: number[]; hints?: unknown; settings: unknown },
  readId: string | null,
) {
  await setupOffscreenDocument();
  forwardToActiveTab({ type: "TTS_PROGRESS", status: "starting", readId });

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "OFFSCREEN_GENERATE_TTS",
        sentences,
        quotedSentences,
        hints,
        settings,
        readId,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: `TTS engine unavailable: ${chrome.runtime.lastError.message}`,
          });
          return;
        }
        resolve(response ?? { success: false, error: "No response from TTS engine" });
      }
    );
  });
}

console.log("Read it! background service worker started");
