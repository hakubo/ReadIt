import { createRoot, Root } from "react-dom/client";
import { SelectionButton } from "./SelectionButton";
import { FloatingPlayer, type PlayerState } from "./FloatingPlayer";
import { type ReadHints, type TTSSettings, type SitePrefs, DEFAULT_NOISE_SELECTORS, SENTENCE_PAUSE_MS } from "@/shared/types";
import { getEffectiveSettings, getDomainSettings, saveGlobalSettings, saveDomainSettings } from "@/shared/settings";
import { setPlaybackState, setStartTiming, getStartTiming } from "./playerStore";
import { SHADOW_STYLES } from "./styles";
import { detectMainContentWithRoot, isValidSelector, setNoiseSelector } from "./contentDetection";
import { findBlockAncestor, getSelectionReadableText } from "./textLocator";
import { splitIntoSentences } from "./textProcessing";
import { findQuotedSentences } from "./quoteDetection";
import { setReadingOptions } from "./spokenElements";
import { findReadHints } from "./readHints";
import { StartTimingTracker, formatStartTiming } from "./startTiming";
import { DebugRecorder, sentenceStatus, type DebugSnapshot } from "./debug/debugData";
import { installDebugPanel } from "./debug/mountDebugPanel";
import { noiseUsage, ruleUsage, type ContentSourceKind, type DebugConfig } from "./debug/debugConfig";
import { HighlightManager } from "./highlighting";
import { ElementPicker } from "./elementPicker";
import { AudioEngine } from "./audioEngine";
import { observeRouteChanges, type RouteChange } from "./routeObserver";
import { base64ToArrayBuffer } from "@/shared/binary";
import { resolveShortcut, nextSpeedUp, nextSpeedDown, type ShortcutAction } from "./keyboardShortcuts";
import { createReadId, isMessageForRead } from "@/shared/readId";

// ---------------------------------------------------------------------------
// Extension context invalidation guard
// ---------------------------------------------------------------------------
// After the extension is updated or reloaded, this content script keeps running
// but every chrome.* call (sendMessage, storage, getURL) throws. chrome.runtime.id
// becomes undefined at that point, so entry points check it before doing work.
let extensionContextInvalidated = false;
const EXTENSION_UPDATED_TOAST_MS = 10_000;

function isContextInvalidatedError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Extension context invalidated");
}

/**
 * True when chrome.* APIs still work; otherwise tears down the dead UI once.
 * notifyUser shows the "reload the page" toast; pass false for events that
 * weren't aimed at the extension, so untouched tabs don't all show it.
 */
function ensureExtensionContext(notifyUser = true): boolean {
  if (!extensionContextInvalidated && chrome.runtime?.id) {
    return true;
  }
  handleExtensionContextInvalidated(notifyUser);
  return false;
}

function hasVisibleUi(): boolean {
  return playerContainer !== null || selectionButtonContainer !== null;
}

function handleExtensionContextInvalidated(notifyUser = false) {
  if (extensionContextInvalidated) {return;}
  extensionContextInvalidated = true;
  extensionEnabled = false;
  const shouldNotify = notifyUser || hasVisibleUi();
  removeUiAfterInvalidation();
  if (shouldNotify) {
    showExtensionUpdatedToast();
  }
}

/** Remove our UI without chrome.* calls (they would throw now). */
function removeUiAfterInvalidation() {
  hideSelectionButton();
  playerRoot?.unmount();
  playerContainer?.remove();
  playerRoot = null;
  playerContainer = null;
  playerMounted = false;
  highlightManager.cleanup();
  elementPicker.stop();
  document.querySelectorAll("iframe[data-readit-player]").forEach(el => el.remove());
  document.body.classList.remove("readit-reading");
  seekCursorStyle?.remove();
  seekCursorStyle = null;
}

function showExtensionUpdatedToast() {
  const toast = document.createElement("div");
  toast.id = "readit-extension-updated";
  const shadow = toast.attachShadow({ mode: "open" });
  const button = document.createElement("button");
  button.textContent = "Read it! was updated — reload the page to use it";
  button.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
    padding: 10px 16px; border: none; border-radius: 999px; cursor: pointer;
    background: #1f2937; color: #f9fafb; font: 13px/1.4 system-ui, sans-serif;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  `;
  button.addEventListener("click", () => window.location.reload());
  shadow.appendChild(button);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), EXTENSION_UPDATED_TOAST_MS);
}

function safeSendMessage(message: Record<string, unknown>): Promise<unknown> {
  if (!ensureExtensionContext()) {
    return Promise.resolve(undefined);
  }
  try {
    return chrome.runtime.sendMessage(withCurrentReadId(message)).catch((err: unknown) => {
      if (isContextInvalidatedError(err)) {
        handleExtensionContextInvalidated();
        return undefined;
      }
      throw err;
    });
  } catch (err: unknown) {
    if (isContextInvalidatedError(err)) {
      handleExtensionContextInvalidated();
      return Promise.resolve(undefined);
    }
    throw err;
  }
}

// Capture phase on window runs before any page or React handler, so a click on
// the dead player removes it instead of throwing inside a chrome.* call.
for (const eventType of ["pointerdown", "keydown"]) {
  window.addEventListener(eventType, () => {
    if (extensionContextInvalidated) {return;}
    ensureExtensionContext(false);
  }, true);
}

// ---------------------------------------------------------------------------
// Per-domain preferences
// ---------------------------------------------------------------------------
const currentDomain = window.location.hostname;
const SITE_KEY = `site:${currentDomain}`;
let sitePrefs: SitePrefs = {};

function saveSitePrefs(updates: Partial<SitePrefs>) {
  sitePrefs = { ...sitePrefs, ...updates };
  chrome.storage.local.set({ [SITE_KEY]: sitePrefs });
}

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------
let selectionButtonRoot: Root | null = null;
let selectionButtonContainer: HTMLDivElement | null = null;
let playerRoot: Root | null = null;
let playerContainer: HTMLDivElement | null = null;
let playerMounted = false;
let selectedText = "";
// Element selectedText came from; scopes sentence highlighting (null = whole page).
let selectedContentRoot: Element | null = null;
// Debug panel: how the text being read was chosen, and the settings the read used
let readSourceKind: ContentSourceKind = "none";
let readSettings: TTSSettings | null = null;
// True until the first sentence's audio arrives (spinner); generation goes on
// after that while isStreaming is true.
let isLoading = false;
// Synchronous guard: handleRead awaits settings before it marks a read active.
let isStartingRead = false;
// Id of the read in progress (see shared/readId.ts); null when none.
let currentReadId: string | null = null;

// Offscreen obeys these only when they carry the current read's id, so seeks
// and window advances from a finished read can't steer the next one.
const READ_CONTROL_MESSAGES = new Set(["ADVANCE_GENERATION", "REGENERATE_SENTENCE", "PLAYER_RESET"]);

function withCurrentReadId(message: Record<string, unknown>): Record<string, unknown> {
  if (!READ_CONTROL_MESSAGES.has(message.type as string) || "readId" in message) {
    return message;
  }
  return { ...message, readId: currentReadId };
}

// Streaming / playback state
let totalChunks = 0;
let isStreaming = false;
let currentSpeed = 1;
let closedManually = false;

let playerState: PlayerState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  currentIndex: 0,
  queueLength: 0,
};

// Time tracking
let totalElapsedTime = 0;
let totalEstimatedDuration = 0;
let initialEstimatedDuration = 0;

// Finished state (all chunks played)
let isFinished = false;

// Model download progress
let downloadProgress: { downloaded: number; total: number } | null = null;

// Last generation error, shown in the player instead of a blocking alert()
let generationError: string | null = null;
let generationErrorTimer: ReturnType<typeof setTimeout> | null = null;
const GENERATION_ERROR_DISPLAY_MS = 8000;

// Extension enabled state
let extensionEnabled = true;

// Settings panel requested from context menu
let openSettingsRequested = false;

// Highlighting settings (applied to the manager)
let highlightingEnabled = true;
let autoScrollEnabled = true;
let highlightColor = "rgba(254, 240, 138, 0.55)";

// Selector preview focus tracking
let selectorInputFocused = false;

// Theme state
let currentTheme: "light" | "dark" = "dark";

// Seek cursor style element
let seekCursorStyle: HTMLStyleElement | null = null;

// ---------------------------------------------------------------------------
// Subsystem instances
// ---------------------------------------------------------------------------
const highlightManager = new HighlightManager();
const elementPicker = new ElementPicker();

const startTiming = new StartTimingTracker((timing) => {
  setStartTiming(timing);
  // Page consoles belong to the site: only local builds log this
  if (__DEBUG_TOOLS__) {
    console.warn(`[Read it!] Start-up: ${formatStartTiming(timing)}`);
  }
});

// Feeds the debug panel (local builds); cheap enough to always record.
const debugRecorder = new DebugRecorder();

const audioEngine = new AudioEngine({
  onPlayStateChange(isPlaying: boolean) {
    if (isPlaying) {
      startTiming.audioStarted();
    }
    // The player can report the same state twice (command reply + media event)
    if (isPlaying !== playerState.isPlaying) {
      debugRecorder.event(isPlaying ? "playing" : "paused", `#${audioEngine.currentSentenceIdx}`);
    }
    playerState = { ...playerState, isPlaying };
    updatePlayer();
  },
  onTimeUpdate(elapsed: number, sentenceIdx: number) {
    if (!playerState.isPlaying) {return;}
    totalElapsedTime = elapsed;
    playerState = {
      ...playerState,
      currentTime: totalElapsedTime,
      currentIndex: sentenceIdx,
    };
    scheduleTimeUpdate();
  },
  onSentenceEnded() {
    handleAudioEnded();
  },
  onSentencePlay(sentenceIdx: number) {
    totalElapsedTime = audioEngine.computeElapsedTime();
    totalEstimatedDuration = audioEngine.computeTotalDuration(totalChunks, initialEstimatedDuration);
    // isPlaying is left to PLAYER_PLAYING / PLAYER_ERROR: play() can still fail.
    playerState = {
      ...playerState,
      currentIndex: sentenceIdx,
      queueLength: audioEngine.sentenceWavData.filter(d => d !== null).length,
    };
    highlightManager.updateHighlight(sentenceIdx);
    updatePlayer();

    // Advance windowed generation
    safeSendMessage({
      type: "ADVANCE_GENERATION",
      upTo: sentenceIdx + 15,
    });
  },
});

// ---------------------------------------------------------------------------
// Store sync and throttle
// ---------------------------------------------------------------------------
function syncPlaybackStore() {
  setPlaybackState({
    loading: isLoading,
    playerState,
    speed: currentSpeed,
    totalElapsedTime,
    totalEstimatedDuration,
    finished: isFinished,
    downloadProgress,
    error: generationError,
    forceSettingsOpen: openSettingsRequested,
    domain: currentDomain,
    theme: currentTheme,
    contentSelector: sitePrefs.contentSelector,
  });
}

let timeUpdateScheduled = false;

function scheduleTimeUpdate() {
  if (timeUpdateScheduled) {return;}
  timeUpdateScheduled = true;
  setTimeout(() => {
    timeUpdateScheduled = false;
    syncPlaybackStore();
    updateSeekCursor();
  }, 100);
}

// ---------------------------------------------------------------------------
// Audio ended / skip / seek handlers
// ---------------------------------------------------------------------------
function handleAudioEnded() {
  if (audioEngine.isManuallyNavigating) {return;}

  const nextIdx = audioEngine.currentSentenceIdx + 1;
  if (nextIdx < totalChunks) {
    audioEngine.currentSentenceElapsed = 0;
    if (audioEngine.sentenceWavData[nextIdx]) {
      audioEngine.currentSentenceIdx = nextIdx;
      audioEngine.playCurrentSentence();
    } else {
      audioEngine.currentSentenceIdx = nextIdx;
      playerState = { ...playerState, isPlaying: false, currentIndex: nextIdx };
      showWaitingHighlight(nextIdx);
      updatePlayer();
    }
  } else {
    isFinished = true;
    playerState = { ...playerState, isPlaying: false, currentIndex: audioEngine.currentSentenceIdx };
    highlightManager.clearCurrentHighlight();
    updatePlayer();
  }
}

/**
 * Scroll to a sentence that is still generating and pulse it. updateHighlight()
 * does the scrolling but draws a solid highlight, so the pulse goes on top.
 */
function showWaitingHighlight(idx: number) {
  highlightManager.updateHighlight(idx);
  highlightManager.showLoadingHighlight(idx);
}

function handleSkipForward() {
  if (audioEngine.currentSentenceIdx >= totalChunks - 1) {return;}
  audioEngine.isManuallyNavigating = true;
  audioEngine.pause();
  audioEngine.currentSentenceIdx++;
  handleSeekToSentence(audioEngine.currentSentenceIdx);
}

function handleSkipBack() {
  if (audioEngine.currentSentenceIdx <= 0) {
    audioEngine.restart();
    return;
  }
  audioEngine.isManuallyNavigating = true;
  audioEngine.pause();
  audioEngine.currentSentenceIdx--;
  handleSeekToSentence(audioEngine.currentSentenceIdx);
}

function handleSeekToSentence(idx: number) {
  if (idx < 0 || idx >= totalChunks) {return;}
  audioEngine.isManuallyNavigating = true;
  audioEngine.pause();
  isFinished = false;
  audioEngine.currentSentenceIdx = idx;

  if (audioEngine.sentenceWavData[idx]) {
    audioEngine.playCurrentSentence();
  } else {
    safeSendMessage({
      type: "REGENERATE_SENTENCE",
      index: idx,
    });
    playerState = { ...playerState, isPlaying: false, currentIndex: idx };
    showWaitingHighlight(idx);
    updatePlayer();
  }
}

function handleLocalSetSpeed(speed: number) {
  if (!ensureExtensionContext()) {return;}
  currentSpeed = speed;
  audioEngine.setSpeed(speed);
  persistSpeedChange(speed);
  updatePlayer();
}

// ---------------------------------------------------------------------------
// Seek cursor
// ---------------------------------------------------------------------------
function updateSeekCursor() {
  const hasAudio = playerState.queueLength > 0;
  if (hasAudio && !seekCursorStyle) {
    seekCursorStyle = document.createElement("style");
    seekCursorStyle.textContent = `
      body.readit-reading p,
      body.readit-reading li,
      body.readit-reading h1, body.readit-reading h2, body.readit-reading h3,
      body.readit-reading h4, body.readit-reading h5, body.readit-reading h6,
      body.readit-reading blockquote,
      body.readit-reading td, body.readit-reading th,
      body.readit-reading figcaption,
      body.readit-reading dt, body.readit-reading dd {
        cursor: pointer !important;
      }
    `;
    document.head.appendChild(seekCursorStyle);
    document.body.classList.add("readit-reading");
  } else if (!hasAudio && seekCursorStyle) {
    document.body.classList.remove("readit-reading");
    seekCursorStyle.remove();
    seekCursorStyle = null;
  }
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------
async function getSettings(): Promise<TTSSettings> {
  return getEffectiveSettings(currentDomain);
}

async function persistSpeedChange(speed: number) {
  const domainSettings = await getDomainSettings(currentDomain);
  if (domainSettings) {
    await saveDomainSettings(currentDomain, { ...domainSettings, speed });
  } else {
    const global = await getSettings();
    await saveGlobalSettings({ ...global, speed });
  }
}

// ---------------------------------------------------------------------------
// Read source (selection or detected main content)
// ---------------------------------------------------------------------------
/** Block element around the current selection, used to scope highlighting. */
function getSelectionContentRoot(): Element | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {return null;}
  return findBlockAncestor(selection.getRangeAt(0).commonAncestorContainer);
}

/**
 * Pick what to read: the current selection, else the page's main content.
 * Sets selectedText/selectedContentRoot; returns false when nothing is readable.
 */
function selectReadSource(): boolean {
  const selection = getSelectionReadableText(window.getSelection());
  if (selection) {
    selectedText = selection;
    selectedContentRoot = getSelectionContentRoot();
    readSourceKind = "selection";
    return true;
  }
  const main = detectMainContentWithRoot(sitePrefs.contentSelector);
  if (!main) {return false;}
  selectedText = main.text;
  selectedContentRoot = main.root;
  readSourceKind = describeMainContentSource(main.root);
  return true;
}

/** How detectMainContentWithRoot() found the text (debug panel). */
function describeMainContentSource(root: Element | null): ContentSourceKind {
  if (!root) {
    return "paragraph fallback";
  }
  const savedSelector = sitePrefs.contentSelector;
  return savedSelector && isValidSelector(savedSelector) && root.matches(savedSelector) ? "saved selector" : "detected";
}

// ---------------------------------------------------------------------------
// Stable callback refs for <FloatingPlayer>
// ---------------------------------------------------------------------------
function handlePlayCallback() {
  if (!ensureExtensionContext()) {return;}
  const idle = !isLoading && playerState.queueLength === 0 && !isFinished;
  if (idle) {
    if (selectReadSource()) {
      handleRead();
      return;
    }
    // No content found — open settings panel to guide user
    console.warn("[Read it!] No readable content detected. Opening settings.");
    openSettingsRequested = true;
    updatePlayer();
    return;
  }
  // Waiting on a sentence that hasn't been generated yet (seeked ahead).
  // The iframe still holds the previous sentence's audio — don't replay it;
  // the TTS_SENTENCE_WAV handler starts playback when the audio arrives.
  if (!audioEngine.sentenceWavData[audioEngine.currentSentenceIdx]) {return;}
  audioEngine.play();
}

function handlePauseCallback() {
  if (!ensureExtensionContext()) {return;}
  audioEngine.pause();
}

function handleSettingsOpenedCallback() {
  openSettingsRequested = false;
}

function handlePositionChangeCallback(pos: { x: number; y: number }) {
  if (!ensureExtensionContext()) {return;}
  saveSitePrefs({ playerPosition: pos });
}

function handleClearContentSelectorCallback() {
  saveSitePrefs({ contentSelector: undefined });
  elementPicker.hideSelectorPreview();
  estimatePageDuration();
  syncPlaybackStore();
}

function handleSetContentSelectorCallback(sel: string) {
  saveSitePrefs({ contentSelector: sel || undefined });
  if (selectorInputFocused) {elementPicker.showSelectorPreview(sitePrefs.contentSelector);}
  estimatePageDuration();
  syncPlaybackStore();
}

function handleSelectorFocusCallback() {
  selectorInputFocused = true;
  elementPicker.showSelectorPreview(sitePrefs.contentSelector);
}

function handleSelectorBlurCallback() {
  selectorInputFocused = false;
  elementPicker.hideSelectorPreview();
}

// Noise selector preview & picker callbacks
function handleNoisePreviewCallback(selector: string) {
  elementPicker.showNoisePreview(selector, sitePrefs.contentSelector);
}

function handleNoisePreviewHideCallback() {
  elementPicker.hideNoisePreview();
}

// A picked element is page-specific, so its selector is stored for this site
// only (SitePrefs.noiseSelectors), never in the global list.
function handlePickNoiseCallback() {
  elementPicker.start(
    addSiteNoiseSelector,
    () => {
      // cancelled — no action needed
    },
    "noise",
  );
}

function addSiteNoiseSelector(selector: string) {
  const current = sitePrefs.noiseSelectors ?? [];
  if (current.includes(selector) || !isValidSelector(selector)) {return;}
  saveSitePrefs({ noiseSelectors: [...current, selector] });
  void getSettings().then(applyContentFilters);
}

/**
 * What text extraction reads: the noise list (settings plus selectors picked
 * on this site) and the reading options (alt text, code, struck-out text).
 * Applied when settings load and change, since text is extracted before a read loads them.
 */
function applyContentFilters(settings: TTSSettings) {
  // Debug panel shows the page's settings before the first read, the read's after
  readSettings ??= settings;
  const settingsSelectors = settings.noiseSelectors ?? DEFAULT_NOISE_SELECTORS;
  setNoiseSelector([...settingsSelectors, ...(sitePrefs.noiseSelectors ?? [])]);
  setReadingOptions({
    readAltText: settings.readAltText,
    skipCode: settings.skipCode,
    skipStrikethrough: settings.skipStrikethrough,
  });
}

function noiseMatchCountCallback(selector: string): number {
  return elementPicker.countNoiseMatches(selector, sitePrefs.contentSelector);
}

// ---------------------------------------------------------------------------
// Shadow DOM helpers
// ---------------------------------------------------------------------------
function createShadowContainer(id: string): { container: HTMLDivElement; shadow: ShadowRoot; renderTarget: HTMLDivElement } {
  const container = document.createElement("div");
  container.id = id;
  document.body.appendChild(container);

  const shadow = container.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = SHADOW_STYLES;
  shadow.appendChild(style);

  const renderTarget = document.createElement("div");
  shadow.appendChild(renderTarget);

  return { container, shadow, renderTarget };
}

// ---------------------------------------------------------------------------
// Selection button
// ---------------------------------------------------------------------------
// Warm the model up when the user is about to read, so Play starts sooner.
// Throttled: offscreen ignores repeats anyway, but each one costs a message.
const WARM_UP_THROTTLE_MS = 30_000;
let lastWarmUpAt = 0;

async function requestWarmUp() {
  const now = Date.now();
  if (now - lastWarmUpAt < WARM_UP_THROTTLE_MS || hasReadState()) {
    return;
  }
  lastWarmUpAt = now;
  const settings = await getSettings();
  safeSendMessage({ type: "WARM_UP", voiceId: settings.voices[0] }).catch(() => {});
}

function showSelectionButton(x: number, y: number) {
  void requestWarmUp();
  if (!selectionButtonContainer) {
    const { container, renderTarget } = createShadowContainer("readit-selection-button");
    selectionButtonContainer = container;
    selectionButtonRoot = createRoot(renderTarget);
  }

  selectionButtonRoot?.render(
    <SelectionButton
      position={{ x, y }}
      onRead={handleRead}
      loading={isLoading}
      theme={currentTheme}
    />
  );
}

function hideSelectionButton() {
  if (selectionButtonRoot && selectionButtonContainer) {
    selectionButtonRoot.unmount();
    selectionButtonContainer.remove();
    selectionButtonRoot = null;
    selectionButtonContainer = null;
  }
}

// ---------------------------------------------------------------------------
// Player UI
// ---------------------------------------------------------------------------
function handleRestart() {
  stopPlayback();
  handleRead();
}

function showPlayer() {
  if (!playerContainer) {
    const { container, renderTarget } = createShadowContainer("readit-player");
    playerContainer = container;
    // Hovering the player is a strong hint that Play is next
    container.addEventListener("pointerenter", () => void requestWarmUp());
    playerRoot = createRoot(renderTarget);
  }

  syncPlaybackStore();

  if (!playerMounted) {
    playerMounted = true;
    playerRoot?.render(
      <FloatingPlayer
        onPlay={handlePlayCallback}
        onPause={handlePauseCallback}
        onRestart={handleRestart}
        onSetSpeed={handleLocalSetSpeed}
        onClose={stopPlayback}
        onSettingsOpened={handleSettingsOpenedCallback}
        initialPosition={sitePrefs.playerPosition}
        onPositionChange={handlePositionChangeCallback}
        onPickContent={handlePickContent}
        onClearContentSelector={handleClearContentSelectorCallback}
        onSetContentSelector={handleSetContentSelectorCallback}
        onSelectorFocus={handleSelectorFocusCallback}
        onSelectorBlur={handleSelectorBlurCallback}
        onNoisePreview={handleNoisePreviewCallback}
        onNoisePreviewHide={handleNoisePreviewHideCallback}
        onPickNoise={handlePickNoiseCallback}
        noiseMatchCount={noiseMatchCountCallback}
      />
    );
  }
}

function handlePickContent() {
  elementPicker.start(
    (selector) => {
      saveSitePrefs({ contentSelector: selector });
      estimatePageDuration();
      updatePlayer();
    },
    () => {
      // cancelled — no action needed
    },
  );
}

function updatePlayer() {
  if (playerRoot) {
    syncPlaybackStore();
  }
  updateSeekCursor();
  syncKeepAwake();
}

// Ask the background to keep the computer awake only while audio is playing.
// Sent on change only, since updatePlayer() runs on every time update.
let keepAwakeRequested = false;
function syncKeepAwake() {
  const shouldKeepAwake = playerState.isPlaying;
  if (shouldKeepAwake === keepAwakeRequested) {
    return;
  }
  keepAwakeRequested = shouldKeepAwake;
  safeSendMessage({ type: "KEEP_AWAKE", enabled: shouldKeepAwake }).catch(() => {});
}

function stopPlayback() {
  // Only this tab's own read: offscreen ignores a reset for any other read id.
  safeSendMessage({ type: "PLAYER_RESET", readId: currentReadId });
  clearReadState();
}

/** Forget the current read locally; late messages for it are dropped by read id. */
function clearReadState() {
  closedManually = true;
  currentReadId = null;
  isFinished = false;
  audioEngine.cleanup();
  highlightManager.cleanup();
  totalChunks = 0;
  isStreaming = false;
  totalElapsedTime = 0;
  totalEstimatedDuration = 0;
  initialEstimatedDuration = 0;
  playerState = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    currentIndex: 0,
    queueLength: 0,
  };
  isLoading = false;
  downloadProgress = null;
  updatePlayer();
}

function destroyPlayer() {
  stopPlayback();
  if (playerRoot && playerContainer) {
    playerRoot.unmount();
    playerContainer.remove();
    playerRoot = null;
    playerContainer = null;
    playerMounted = false;
  }
}

// ---------------------------------------------------------------------------
// Main read handler
// ---------------------------------------------------------------------------
function showGenerationError(message: string) {
  generationError = message;
  if (generationErrorTimer) {clearTimeout(generationErrorTimer);}
  generationErrorTimer = setTimeout(() => {
    generationErrorTimer = null;
    generationError = null;
    updatePlayer();
  }, GENERATION_ERROR_DISPLAY_MS);
  updatePlayer();
}

function applyReadSettings(settings: TTSSettings) {
  readSettings = settings;
  currentSpeed = settings.speed;
  audioEngine.setCurrentSpeed(settings.speed);
  highlightingEnabled = settings.highlightSentences;
  highlightColor = settings.highlightColor || "#fef08a";
  autoScrollEnabled = settings.autoScroll !== false;
  currentTheme = settings.theme || "dark";
  highlightManager.highlightingEnabled = highlightingEnabled;
  highlightManager.autoScrollEnabled = autoScrollEnabled;
  highlightManager.highlightColor = highlightColor;
}

function resetPlaybackStateForRead(textLength: number) {
  audioEngine.cleanup();
  audioEngine.ensurePlayerIframe();

  isFinished = false;
  isLoading = true;
  isStreaming = true;
  totalChunks = 0;
  totalElapsedTime = 0;
  const CHARS_PER_SEC = 14;
  totalEstimatedDuration = textLength / CHARS_PER_SEC;
  initialEstimatedDuration = totalEstimatedDuration;
  playerState = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    currentIndex: 0,
    queueLength: 0,
  };
}

/** Prepare highlighting without locating any sentence yet (that's deferred). */
function prepareHighlighting(contentRoot: Element | null) {
  highlightManager.contentRoot = contentRoot;
  highlightManager.resetSentenceRects();
  if (highlightingEnabled) {
    highlightManager.createHighlightOverlay();
  }
}

/** Any read state to tear down, including a finished read whose audio is still queued. */
function hasReadState(): boolean {
  return isLoading || isStreaming || playerState.queueLength > 0;
}

/** False once the read was stopped, replaced, or the page is going away. */
function isReadCurrent(readId: string): boolean {
  return currentReadId === readId && !closedManually;
}

async function handleRead() {
  // Set before the first await, so a second click can't start a second read.
  if (!selectedText || isStartingRead) {return;}
  isStartingRead = true;
  let started: StartedRead | null = null;
  try {
    started = await startRead(selectedText, selectedContentRoot);
  } finally {
    isStartingRead = false;
  }
  if (started) {
    await awaitGeneration(started.generation, started.readId);
  }
}

type StartedRead = { readId: string; generation: Promise<unknown> };

/** Start reading `text`. Null when there is nothing to say or the read was stopped meanwhile. */
async function startRead(text: string, contentRoot: Element | null): Promise<StartedRead | null> {
  // A new read replaces the current one. Cleanup also drops a finished read's
  // overlay, style element and observers before new ones are created.
  if (hasReadState()) {
    stopPlayback();
  }
  highlightManager.cleanup();
  const readId = createReadId();
  currentReadId = readId;
  startTiming.start();
  closedManually = false;
  generationError = null;

  const settings = await getSettings();
  if (!isReadCurrent(readId)) {return null;}
  applyReadSettings(settings);

  // Split raw text into sentences (matches page DOM for highlighting). Offscreen
  // turns each one into speakable text, so indices stay 1:1 with the audio.
  const sentences = splitIntoSentences(text).filter(s => s.trim().length > 0);
  if (sentences.length === 0) {
    console.warn("[Read it!] No sentences to read after splitting text.");
    currentReadId = null;
    return null;
  }

  highlightManager.sentences = sentences;
  resetPlaybackStateForRead(text.length);
  prepareHighlighting(contentRoot);
  hideSelectionButton();
  showPlayer();

  const quotedSentences = findQuotedSentences(sentences, contentRoot);
  debugRecorder.startRead(quotedSentences);
  startTiming.generateSent();
  const hints = findReadHints(sentences, contentRoot);
  const generation = sendGenerateRequest(readId, sentences, quotedSentences, hints, settings);
  // Locate sentences while the model loads. updateHighlight() locates any
  // sentence it needs before the idle chunks reach it (e.g. sentence 0).
  highlightManager.schedulePrecompute();
  return { readId, generation };
}

/** Send GENERATE_TTS; a synchronous throw becomes a rejection for awaitGeneration(). */
function sendGenerateRequest(
  readId: string,
  sentences: string[],
  quotedSentences: number[],
  hints: ReadHints,
  settings: TTSSettings,
): Promise<unknown> {
  try {
    return safeSendMessage({ type: "GENERATE_TTS", readId, sentences, quotedSentences, hints, settings });
  } catch (error) {
    return Promise.reject(error);
  }
}

async function awaitGeneration(generation: Promise<unknown>, readId: string) {
  try {
    const response = await generation as { success?: boolean; error?: string } | undefined;

    if (!response || !response.success) {
      throw new Error(response?.error || "TTS generation failed");
    }

    if (currentReadId === readId) {
      isLoading = false;
      updatePlayer();
    }
  } catch (error) {
    console.error("TTS generation failed:", error);
    // A read that was already replaced or stopped owns no state any more.
    if (currentReadId !== readId) {return;}
    isLoading = false;
    // Suppress alert when playback was stopped intentionally (route change,
    // user close, page unload) or when the message channel was broken by
    // navigation — these are expected interruptions, not actionable errors.
    const isChannelClosed = error instanceof Error && error.message.includes("message channel closed");
    if (!closedManually && !isChannelClosed) {
      stopPlayback();
      showGenerationError(`TTS generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Settings change handling
// ---------------------------------------------------------------------------
/**
 * Apply the highlight toggle to a read in progress. The overlay is normally
 * created at read start, so turning highlighting on mid-read creates it here.
 */
function setHighlightingEnabledMidRead(enabled: boolean) {
  highlightingEnabled = enabled;
  highlightManager.highlightingEnabled = enabled;
  const isReading = highlightManager.sentences.length > 0 && !isFinished;
  if (!isReading) {return;}

  if (!enabled) {
    highlightManager.clearCurrentHighlight();
    return;
  }
  // Idempotent: installs the CSS highlights only if they aren't already set up
  highlightManager.createHighlightOverlay();
  const index = audioEngine.currentSentenceIdx;
  if (audioEngine.sentenceWavData[index]) {
    highlightManager.updateHighlight(index);
  } else {
    showWaitingHighlight(index);
  }
}

function applySettingsChange(newSettings: TTSSettings) {
  if (newSettings.speed !== undefined && newSettings.speed !== currentSpeed) {
    currentSpeed = newSettings.speed;
    audioEngine.setSpeed(currentSpeed);
    updatePlayer();
  }
  if (newSettings.highlightSentences !== undefined && newSettings.highlightSentences !== highlightingEnabled) {
    setHighlightingEnabledMidRead(newSettings.highlightSentences);
  }
  if (newSettings.highlightColor && newSettings.highlightColor !== highlightColor) {
    highlightColor = newSettings.highlightColor;
    highlightManager.highlightColor = highlightColor;
    if (playerState.queueLength > 0 && highlightingEnabled) {
      highlightManager.updateHighlight(playerState.currentIndex);
    }
  }
  if (newSettings.autoScroll !== undefined) {
    autoScrollEnabled = newSettings.autoScroll;
    highlightManager.autoScrollEnabled = autoScrollEnabled;
  }
  if (newSettings.theme && newSettings.theme !== currentTheme) {
    currentTheme = newSettings.theme;
    updatePlayer();
  }
  if (newSettings.noiseSelectors) {
    applyContentFilters(newSettings);
  }
}

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "sync" && changes.settings?.newValue) {
    const domainSettings = await getDomainSettings(currentDomain);
    if (!domainSettings) {
      applySettingsChange(changes.settings.newValue as TTSSettings);
    }
  }
  if (areaName === "local" && changes[SITE_KEY]?.newValue) {
    const prefs = changes[SITE_KEY].newValue as SitePrefs;
    // The settings panel writes these fields straight to storage; keep the
    // in-memory copy current so the next saveSitePrefs() doesn't revert them.
    sitePrefs = { ...sitePrefs, settings: prefs.settings, noiseSelectors: prefs.noiseSelectors };
    if (prefs.settings) {
      applySettingsChange(prefs.settings);
    } else {
      const global = await getSettings();
      applySettingsChange(global);
    }
  }
});

// ---------------------------------------------------------------------------
// Message listener (background → content)
// ---------------------------------------------------------------------------
// Messages about a read's generation. Each carries the read id it belongs to.
const READ_MESSAGES = new Set([
  "TTS_PROGRESS", "TTS_STREAM_START", "TTS_AUDIO_CHUNK",
  "TTS_STREAM_END", "TTS_SENTENCE_WAV", "TTS_TIMING",
  "MODEL_DOWNLOAD_PROGRESS", "MODEL_DOWNLOAD_COMPLETE",
]);

function handleStreamStart(message: Record<string, unknown>) {
  totalChunks = message.totalChunks as number;
  if (message.sentences) {
    audioEngine.generationSentences = message.sentences as string[];
    audioEngine.sentenceWavData = new Array(totalChunks).fill(null);
    audioEngine.sentenceDurations = new Array(totalChunks).fill(0);
    const CHARS_PER_SEC = 14;
    const PAUSE_SEC = SENTENCE_PAUSE_MS / 1000;
    const totalChars = audioEngine.generationSentences.reduce((sum, s) => sum + s.length, 0);
    initialEstimatedDuration = totalChars / CHARS_PER_SEC + audioEngine.generationSentences.length * PAUSE_SEC;
    totalEstimatedDuration = initialEstimatedDuration;
  }
  updatePlayer();
}

function storeSentenceWav(idx: number, wavData: ArrayBuffer, duration: number) {
  while (audioEngine.sentenceWavData.length <= idx) {audioEngine.sentenceWavData.push(null);}
  while (audioEngine.sentenceDurations.length <= idx) {audioEngine.sentenceDurations.push(0);}

  audioEngine.sentenceWavData[idx] = wavData;
  audioEngine.sentenceDurations[idx] = duration;

  totalEstimatedDuration = audioEngine.computeTotalDuration(totalChunks, initialEstimatedDuration);

  playerState = {
    ...playerState,
    queueLength: audioEngine.sentenceWavData.filter(d => d !== null).length,
    duration: totalEstimatedDuration,
  };
}

function handleSentenceWav(message: Record<string, unknown>) {
  const idx = message.index as number;
  startTiming.audioReceived();
  storeSentenceWav(idx, base64ToArrayBuffer(message.wavBase64 as string), message.duration as number);
  // Audio is here: drop the spinner. isStreaming stays true while the rest generates.
  isLoading = false;

  // Auto-play sentence 0 when it arrives
  if (idx === 0 && audioEngine.currentSentenceIdx === 0 && !playerState.isPlaying) {
    audioEngine.playCurrentSentence();
    highlightManager.updateHighlight(0);
  }

  // If we were waiting for this sentence (user seeked to it), play it
  if (idx === audioEngine.currentSentenceIdx && !playerState.isPlaying && idx > 0) {
    audioEngine.playCurrentSentence();
  }

  // Generation fell behind playback: the next sentence arrived after the
  // current one started, so preload it now.
  if (idx === audioEngine.currentSentenceIdx + 1) {
    audioEngine.preloadNextSentence();
  }

  updatePlayer();
}

function applyReadMessage(message: Record<string, unknown>) {
  if (message.type === "MODEL_DOWNLOAD_PROGRESS") {
    downloadProgress = { downloaded: message.downloaded as number, total: message.total as number };
  }
  if (message.type === "MODEL_DOWNLOAD_COMPLETE") {
    downloadProgress = null;
  }
  if (message.type === "TTS_PROGRESS" && message.totalChunks) {
    totalChunks = message.totalChunks as number;
  }
  if (message.type === "TTS_STREAM_START") {
    handleStreamStart(message);
    return;
  }
  if (message.type === "TTS_TIMING") {
    startTiming.recordOffscreen(message);
    return;
  }
  if (message.type === "TTS_SENTENCE_WAV") {
    handleSentenceWav(message);
    return;
  }
  if (message.type === "TTS_STREAM_END") {
    isStreaming = false;
    isLoading = false;
  }
  updatePlayer();
}

chrome.runtime.onMessage.addListener((message) => {
  if (READ_MESSAGES.has(message.type)) {
    // Drop messages from a stopped or replaced read: late audio from an
    // aborted read must not play inside the next one.
    if (!closedManually && isMessageForRead(message, currentReadId)) {
      debugRecorder.message(message);
      applyReadMessage(message);
    }
    return;
  }

  // Another tab started reading; offscreen already moved on to its read.
  if (message.type === "PLAYBACK_INTERRUPTED") {
    clearReadState();
  }

  if (message.type === "OPEN_SETTINGS") {
    openSettingsRequested = true;
    showPlayer();
  }

  if (message.type === "EXTENSION_TOGGLE") {
    // Toggle based on actual player visibility so the icon click always does
    // the intuitive thing — including in auto-mode where 'enabled' is undefined.
    const nowEnabled = !playerRoot;
    extensionEnabled = nowEnabled;
    saveSitePrefs({ enabled: nowEnabled });
    if (!nowEnabled) {
      hideSelectionButton();
      destroyPlayer();
    } else {
      if (!totalEstimatedDuration) {
        estimatePageDuration();
      }
      showPlayer();
    }
  }
});

// ---------------------------------------------------------------------------
// DOM event listeners
// ---------------------------------------------------------------------------
document.addEventListener("mouseup", (e) => {
  if (!extensionEnabled) {return;}
  if (!ensureExtensionContext(false)) {return;}

  const target = e.target as HTMLElement;
  if (
    target.closest("#readit-selection-button") ||
    target.closest("#readit-player") ||
    target.closest("#readit-highlight-overlay")
  ) {
    return;
  }

  const selection = window.getSelection();
  const text = getSelectionReadableText(selection);

  if (text && text.length > 0) {
    selectedText = text;
    selectedContentRoot = getSelectionContentRoot();
    readSourceKind = "selection";
    showSelectionButton(e.clientX, e.clientY);
  } else {
    hideSelectionButton();
  }
});

document.addEventListener("mousedown", (e) => {
  const target = e.target as HTMLElement;
  if (
    !target.closest("#readit-selection-button") &&
    !target.closest("#readit-player") &&
    !target.closest("#readit-highlight-overlay")
  ) {
    if (!isLoading && !isStreaming && !playerState.isPlaying) {
      hideSelectionButton();
    }
  }
});

// Click-to-seek: click on page text to jump to that sentence.
document.addEventListener("click", (e) => {
  if (!extensionEnabled) {return;}
  const hasAudio = playerState.queueLength > 0;
  if ((!hasAudio && !isLoading && !isStreaming) || highlightManager.sentences.length === 0) {return;}

  const target = e.target as HTMLElement;
  if (target.closest("#readit-player, #readit-selection-button")) {return;}
  if (target.closest("a, button, input, select, textarea, [role='button']")) {return;}

  const idx = highlightManager.getSentenceIndexAtPoint(e.clientX, e.clientY);
  if (idx < 0) {return;}
  if (!ensureExtensionContext()) {return;}
  handleSeekToSentence(idx);
});

// Keyboard shortcuts
/** A read the shortcuts act on: loading, streaming, or audio not yet finished. */
function hasActiveRead(): boolean {
  return isLoading || isStreaming || (playerState.queueLength > 0 && !isFinished);
}

function runShortcut(action: ShortcutAction) {
  switch (action) {
    case "read":
      if (selectReadSource()) {
        handleRead();
      }
      break;
    case "stop":
      stopPlayback();
      break;
    case "togglePlay":
      // Same path as the pill button, so a sentence that is still generating
      // isn't replaced by a replay of the previous one.
      if (playerState.isPlaying) {
        handlePauseCallback();
      } else {
        handlePlayCallback();
      }
      break;
    case "skipBack":
      handleSkipBack();
      break;
    case "skipForward":
      handleSkipForward();
      break;
    case "speedUp":
      handleLocalSetSpeed(nextSpeedUp(currentSpeed));
      break;
    case "speedDown":
      handleLocalSetSpeed(nextSpeedDown(currentSpeed));
      break;
  }
}

document.addEventListener("keydown", (e) => {
  if (!extensionEnabled) {return;}

  const action = resolveShortcut(e, e.composedPath()[0], {
    hasActiveRead: hasActiveRead(),
    pickerActive: elementPicker.isActive(),
  });
  if (!action) {return;}
  if (!ensureExtensionContext()) {return;}

  e.preventDefault();
  e.stopPropagation();
  runShortcut(action);
});

// ---------------------------------------------------------------------------
// SPA route change handling
// ---------------------------------------------------------------------------
/** Any read on screen, playing or not, including a finished one still in the player. */
function hasReadOnScreen(): boolean {
  return hasReadState() || playerState.isPlaying;
}

function handleRouteChange(change: RouteChange) {
  if (!extensionEnabled || !hasReadOnScreen()) {return;}
  // replaceState usually rewrites the current page's URL (UTM stripping,
  // infinite-scroll news). Keep reading; handleRouteContentReady stops the
  // read if the content it came from was removed.
  if (change.navigationType === "replace") {return;}
  stopPlayback();
}

function handleRouteContentReady() {
  if (!extensionEnabled) {return;}

  if (hasReadOnScreen()) {
    if (!selectedContentRoot || selectedContentRoot.isConnected) {return;}
    stopPlayback();
  }

  estimatePageDuration();
  // The new route's content may render later than the settle delay.
  setupContentObserver();

  // On SPA navigation, show or hide the player based on new content length
  // (unless the user has an explicit per-domain preference).
  const AUTO_SHOW_MIN_DURATION = 60;
  if (sitePrefs.enabled === undefined) {
    if (totalEstimatedDuration >= AUTO_SHOW_MIN_DURATION && !playerRoot) {
      showPlayer();
    } else if (totalEstimatedDuration < AUTO_SHOW_MIN_DURATION && playerRoot && !isStreaming && !isLoading) {
      destroyPlayer();
    }
  }

  updatePlayer();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
// Whether the last estimate came from a real content element, not the
// page-wide <p> fallback (which can be just a cookie notice or teaser).
let pageContentFound = false;

function estimatePageDuration() {
  // During a read, the duration comes from the generated audio.
  if (hasReadOnScreen()) {return;}
  const CHARS_PER_SEC = 14;
  const content = detectMainContentWithRoot(sitePrefs.contentSelector);
  // Reset when nothing is found, so a previous route's estimate doesn't linger.
  totalEstimatedDuration = content ? content.text.length / CHARS_PER_SEC : 0;
  pageContentFound = Boolean(content?.root);
}

function hasEnoughPageContent(): boolean {
  const AUTO_SHOW_MIN_DURATION = 60;
  return pageContentFound && totalEstimatedDuration >= AUTO_SHOW_MIN_DURATION;
}

let stopContentObserver: (() => void) | null = null;

/**
 * Re-detect content while the page renders late (SPAs, lazy articles) until
 * enough real content is found, MAX_ATTEMPTS checks ran, or 30 s passed.
 */
function setupContentObserver() {
  stopContentObserver?.();
  if (hasEnoughPageContent()) { return; }

  const MAX_ATTEMPTS = 15;
  const CHECK_INTERVAL_MS = 1000;
  let attempts = 0;
  let checkTimer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    observer.disconnect();
    if (checkTimer) { clearTimeout(checkTimer); }
    clearTimeout(giveUpTimer);
    if (stopContentObserver === stop) { stopContentObserver = null; }
  };

  const runCheck = () => {
    checkTimer = null;
    attempts++;
    const done = checkLateContent();
    if (done || attempts >= MAX_ATTEMPTS) { stop(); }
  };

  // Throttle rather than debounce: a busy page mutates constantly and would
  // postpone a debounced check forever.
  const observer = new MutationObserver(() => {
    if (!checkTimer) { checkTimer = setTimeout(runCheck, CHECK_INTERVAL_MS); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const giveUpTimer = setTimeout(stop, 30_000);
  stopContentObserver = stop;
}

/** One late-content check. Returns true when the observer can stop. */
function checkLateContent(): boolean {
  if (hasReadOnScreen()) { return true; }
  const hadPlayer = !!playerRoot;
  estimatePageDuration();

  // Auto-show the player once content crosses the threshold (and the
  // user hasn't explicitly set a preference for this domain).
  if (!hadPlayer && sitePrefs.enabled === undefined && hasEnoughPageContent()) {
    showPlayer();
  }

  updatePlayer();
  return hasEnoughPageContent();
}

// ---------------------------------------------------------------------------
// Debug panel (local builds only)
// ---------------------------------------------------------------------------
function getDebugSnapshot(): DebugSnapshot {
  const currentIndex = audioEngine.currentSentenceIdx;
  return {
    readId: currentReadId,
    flags: { loading: isLoading, streaming: isStreaming, playing: playerState.isPlaying, finished: isFinished, closed: closedManually },
    currentIndex,
    generatingIndex: debugRecorder.generatingIndex,
    startTiming: getStartTiming(),
    sentences: highlightManager.sentences.map((text, index) => {
      const hasAudio = Boolean(audioEngine.sentenceWavData[index]);
      return {
        index,
        text,
        status: sentenceStatus({ index, currentIndex, isPlaying: playerState.isPlaying, hasAudio, generatingIndex: debugRecorder.generatingIndex }),
        quoted: debugRecorder.quotedSentences.has(index),
        located: highlightManager.locationState(index),
        durationSec: hasAudio ? audioEngine.sentenceDurations[index] ?? null : null,
        report: debugRecorder.report(index),
      };
    }),
    events: debugRecorder.events,
  };
}

function getDebugConfig(): DebugConfig {
  const settings = readSettings;
  return {
    content: { kind: readSourceKind, root: selectedContentRoot, textLength: selectedText.length },
    savedContentSelector: sitePrefs.contentSelector ?? null,
    rules: ruleUsage(settings?.textReplacements ?? [], highlightManager.sentences),
    noise: noiseUsage(settings?.noiseSelectors ?? DEFAULT_NOISE_SELECTORS, sitePrefs.noiseSelectors ?? []),
  };
}

if (__DEBUG_TOOLS__) {
  const toggleDebugPanel = installDebugPanel({
    getSnapshot: getDebugSnapshot,
    getConfig: getDebugConfig,
    onSeek: handleSeekToSentence,
  });
  chrome.runtime.onMessage.addListener((message: { type?: string }) => {
    if (message.type === "TOGGLE_DEBUG_PANEL") {
      toggleDebugPanel();
    }
  });
}

async function init() {
  if (document.contentType && !document.contentType.startsWith("text/html")) {return;}

  const settings = await getSettings();
  currentTheme = settings.theme || "dark";
  currentSpeed = settings.speed;
  audioEngine.setCurrentSpeed(settings.speed);

  const result = await chrome.storage.local.get(SITE_KEY);
  sitePrefs = result[SITE_KEY] || {};
  applyContentFilters(settings);

  if (sitePrefs.enabled === false) {
    extensionEnabled = false;
    return;
  }

  estimatePageDuration();

  // Show player automatically only if the user explicitly enabled it for this
  // domain, or if there is enough readable content (≥ 1 minute at ~14 chars/s).
  const AUTO_SHOW_MIN_DURATION = 60;
  if (sitePrefs.enabled === true || totalEstimatedDuration >= AUTO_SHOW_MIN_DURATION) {
    showPlayer();
  }

  setupContentObserver();

  // Detect SPA route changes: stop playback and re-detect content.
  observeRouteChanges(handleRouteChange, handleRouteContentReady);

  // Suppress spurious TTS error alerts during real navigation: awaitGeneration()
  // checks closedManually and skips the alert. pagehide, not beforeunload:
  // beforeunload also fires when the page stays (a link that turns into a
  // download, Cancel on "Leave site?"), which would mute the rest of the read.
  window.addEventListener("pagehide", () => { closedManually = true; });

  if (document.readyState !== "complete") {
    window.addEventListener("load", () => {
      if (!isLoading && !isStreaming) {
        estimatePageDuration();
        updatePlayer();
      }
    }, { once: true });
  }
}

init();
