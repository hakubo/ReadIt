// Background service worker for unmute.page extension
// Manages offscreen document for TTS generation and audio playback

import type {
  ExtensionMessage,
  GenerateTTSResponse,
  TTSProgressMessage,
  OffscreenGenerateTTSMessage,
  OffscreenPreviewVoiceMessage,
  PlayerResetMessage,
  PlaybackInterruptedMessage,
  ExtensionToggleMessage,
  OpenSettingsMessage,
  OffscreenPingMessage,
} from "@/shared/messaging";
import type { TTSSettings } from "@/shared/types";

let creatingOffscreen: Promise<void> | null = null;
let activeTabId: number | null = null;
let offscreenIdleTimer: ReturnType<typeof setTimeout> | null = null;
const OFFSCREEN_IDLE_MS = 10_000; // Close offscreen 10s after generation ends

// Restore activeTabId from session storage (survives service worker restarts)
chrome.storage.session.get("activeTabId").then((result) => {
  if (result.activeTabId != null && activeTabId === null) {
    activeTabId = result.activeTabId as number;
  }
});

function setActiveTabId(id: number | null) {
  activeTabId = id;
  if (id !== null) {
    chrome.storage.session.set({ activeTabId: id });
  } else {
    chrome.storage.session.remove("activeTabId");
  }
}

// Quick health-check: resolve true if offscreen responds, false on timeout/error
function pingOffscreen(): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 2000);
    const msg: OffscreenPingMessage = { type: "OFFSCREEN_PING" };
    chrome.runtime.sendMessage(msg, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError || !response?.pong) {
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

async function createOffscreenDocument() {
  const offscreenUrl = "offscreen.html";

  creatingOffscreen = (async () => {
    await chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: [
        chrome.offscreen.Reason.WORKERS,
      ],
      justification: "TTS inference via ONNX web workers",
    });

    // Wait for the offscreen document to signal its message listener is ready.
    // This prevents a race where we send a message before the listener exists.
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      const listener = (msg: ExtensionMessage) => {
        if (msg.type === "OFFSCREEN_READY") {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(listener);
          resolve();
        }
      };
      chrome.runtime.onMessage.addListener(listener);
    });
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
    const alive = await pingOffscreen();
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

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  console.log("unmute.page extension installed");

  chrome.contextMenus.create({
    id: "kokoro-open-settings",
    title: "Open Settings",
    contexts: ["action"],
  });
});

// Handle browser icon click — toggle extension on/off for the domain
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) {return;}

  const tabId = tab.id;
  let hostname: string;
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    return;
  }

  const key = `site:${hostname}`;
  const result = await chrome.storage.local.get(key);
  const prefs = (result[key] as Record<string, unknown> | undefined) ?? {};
  const wasEnabled = prefs.enabled !== false;
  const nowEnabled = !wasEnabled;

  await chrome.storage.local.set({ [key]: { ...prefs, enabled: nowEnabled } });

  const toggleMsg: ExtensionToggleMessage = { type: "EXTENSION_TOGGLE", enabled: nowEnabled };
  chrome.tabs.sendMessage(tabId, toggleMsg).catch(() => {});
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "kokoro-open-settings" && tab?.id) {
    const settingsMsg: OpenSettingsMessage = { type: "OPEN_SETTINGS" };
    chrome.tabs.sendMessage(tab.id, settingsMsg).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    setActiveTabId(null);
    closeOffscreenDocument();
  }
});

// When the active tab reloads or navigates, abort generation and close offscreen
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === "loading") {
    setActiveTabId(null);
    if (offscreenIdleTimer) { clearTimeout(offscreenIdleTimer); offscreenIdleTimer = null; }
    const resetMsg: PlayerResetMessage = { type: "PLAYER_RESET" };
    chrome.runtime.sendMessage(resetMsg).catch(() => {});
    closeOffscreenDocument();
  }
});

function forwardToActiveTab(message: unknown) {
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, message).catch(() => {});
  }
}

// Fetch page title with timeout
async function fetchPageTitle(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {return null;}

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim() || null;
    }
    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

const CACHE_NAME = "kokoro-tts-resources";
const DL_BASE = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231";

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // Check Browser Cache API for model and voice files
  if (message.type === "CHECK_CACHE_STATUS") {
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const modelCached = !!(await cache.match(`${DL_BASE}/onnx/model.onnx`));
        const voiceIds = message.voiceIds;
        const cachedVoices: string[] = [];
        await Promise.all(
          voiceIds.map(async (id) => {
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
    return true;
  }

  // Fetch page title for URL (used by offscreen for TTS)
  if (message.type === "FETCH_PAGE_TITLE") {
    fetchPageTitle(message.url)
      .then((title) => sendResponse({ title }))
      .catch(() => sendResponse({ title: null }));
    return true;
  }

  // From content script: start TTS generation
  if (message.type === "GENERATE_TTS") {
    const newTabId = sender.tab?.id ?? null;
    // If another tab was playing, tell it to reset
    if (activeTabId && activeTabId !== newTabId) {
      const interruptMsg: PlaybackInterruptedMessage = { type: "PLAYBACK_INTERRUPTED" };
      chrome.tabs.sendMessage(activeTabId, interruptMsg).catch(() => {});
    }
    setActiveTabId(newTabId);
    handleTTSRequest(message.sentences, message.settings)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      );
    return true;
  }

  // Voice preview: ensure offscreen exists, then forward
  if (message.type === "PREVIEW_VOICE") {
    setActiveTabId(sender.tab?.id ?? activeTabId);
    setupOffscreenDocument().then(() => {
      const previewMsg: OffscreenPreviewVoiceMessage = { type: "OFFSCREEN_PREVIEW_VOICE", voiceId: message.voiceId };
      chrome.runtime.sendMessage(previewMsg);
    });
    return true;
  }

  // REGENERATE_SENTENCE and ADVANCE_GENERATION are broadcast to all contexts
  // via chrome.runtime.sendMessage — offscreen receives them directly, no forwarding needed.
  // Cancel idle timer if generation is being advanced (offscreen still active).
  if (message.type === "REGENERATE_SENTENCE" || message.type === "ADVANCE_GENERATION") {
    if (offscreenIdleTimer) { clearTimeout(offscreenIdleTimer); offscreenIdleTimer = null; }
  }

  // Model download progress: forward to active tab
  if (message.type === "MODEL_DOWNLOAD_PROGRESS") {
    forwardToActiveTab(message);
  }

  if (message.type === "MODEL_DOWNLOAD_COMPLETE") {
    forwardToActiveTab(message);
  }

  // From offscreen: forward progress/state/wav to content script
  if (
    message.type === "TTS_PROGRESS" ||
    message.type === "TTS_STREAM_START" ||
    message.type === "TTS_AUDIO_CHUNK" ||
    message.type === "TTS_STREAM_END" ||
    message.type === "TTS_SENTENCE_WAV" ||
    message.type === "PREVIEW_STATE" ||
    message.type === "VOICE_DOWNLOAD_START" ||
    message.type === "VOICE_DOWNLOAD_COMPLETE"
  ) {
    forwardToActiveTab(message);
  }

  // Cancel idle timer when new generation starts
  if (message.type === "TTS_STREAM_START") {
    if (offscreenIdleTimer) { clearTimeout(offscreenIdleTimer); offscreenIdleTimer = null; }
  }

  // Close offscreen after generation ends to free ONNX/WASM memory
  if (message.type === "TTS_STREAM_END") {
    if (offscreenIdleTimer) { clearTimeout(offscreenIdleTimer); }
    offscreenIdleTimer = setTimeout(() => {
      offscreenIdleTimer = null;
      closeOffscreenDocument();
    }, OFFSCREEN_IDLE_MS);
  }
});

async function handleTTSRequest(sentences: string[], settings: TTSSettings): Promise<GenerateTTSResponse> {
  await setupOffscreenDocument();
  const progressMsg: TTSProgressMessage = { type: "TTS_PROGRESS", status: "starting" };
  forwardToActiveTab(progressMsg);

  return new Promise((resolve) => {
    const genMsg: OffscreenGenerateTTSMessage = {
      type: "OFFSCREEN_GENERATE_TTS",
      sentences,
      settings,
    };
    chrome.runtime.sendMessage(genMsg, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: `TTS engine unavailable: ${chrome.runtime.lastError.message}`,
        });
        return;
      }
      resolve(response ?? { success: false, error: "No response from TTS engine" });
    });
  });
}

console.log("unmute.page background service worker started");
