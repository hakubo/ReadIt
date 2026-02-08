import { createRoot, Root } from "react-dom/client";
import { SelectionButton } from "./SelectionButton";
import { FloatingPlayer, type PlayerState } from "./FloatingPlayer";
import { type TTSSettings, type SitePrefs } from "@/shared/types";
import { getEffectiveSettings, getDomainSettings, saveGlobalSettings, saveDomainSettings } from "@/shared/settings";
import { setPlaybackState } from "./playerStore";
import { SHADOW_STYLES } from "./styles";
import { detectMainContent } from "./contentDetection";
import { splitIntoSentences, humanizeText, replaceUrlsWithTitles } from "./textProcessing";
import { HighlightManager } from "./highlighting";
import { ElementPicker } from "./elementPicker";
import { AudioEngine } from "./audioEngine";

// ---------------------------------------------------------------------------
// Extension context invalidation guard
// ---------------------------------------------------------------------------
let extensionContextInvalidated = false;

function safeSendMessage(message: Record<string, unknown>): Promise<unknown> {
  if (extensionContextInvalidated) {
    return Promise.resolve(undefined);
  }
  try {
    return chrome.runtime.sendMessage(message).catch((err: unknown) => {
      if (err instanceof Error && err.message.includes("Extension context invalidated")) {
        extensionContextInvalidated = true;
        return undefined;
      }
      throw err;
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Extension context invalidated")) {
      extensionContextInvalidated = true;
      return Promise.resolve(undefined);
    }
    throw err;
  }
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
let isLoading = false;

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

const audioEngine = new AudioEngine({
  onPlayStateChange(isPlaying: boolean) {
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
    playerState = {
      ...playerState,
      isPlaying: true,
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
      highlightManager.updateHighlight(nextIdx);
      updatePlayer();
    }
  } else {
    isFinished = true;
    playerState = { ...playerState, isPlaying: false, currentIndex: audioEngine.currentSentenceIdx };
    highlightManager.clearCurrentHighlight();
    updatePlayer();
  }
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
    highlightManager.updateHighlight(idx);
    updatePlayer();
  }
}

function handleLocalSetSpeed(speed: number) {
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
      body.unmute-reading p,
      body.unmute-reading li,
      body.unmute-reading h1, body.unmute-reading h2, body.unmute-reading h3,
      body.unmute-reading h4, body.unmute-reading h5, body.unmute-reading h6,
      body.unmute-reading blockquote,
      body.unmute-reading td, body.unmute-reading th,
      body.unmute-reading figcaption,
      body.unmute-reading dt, body.unmute-reading dd {
        cursor: pointer !important;
      }
    `;
    document.head.appendChild(seekCursorStyle);
    document.body.classList.add("unmute-reading");
  } else if (!hasAudio && seekCursorStyle) {
    document.body.classList.remove("unmute-reading");
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
// Stable callback refs for <FloatingPlayer>
// ---------------------------------------------------------------------------
function handlePlayCallback() {
  const idle = !isLoading && playerState.queueLength === 0 && !isFinished;
  if (idle) {
    const sel = window.getSelection()?.toString().trim();
    if (sel) {
      selectedText = sel;
      handleRead();
      return;
    }
    const main = detectMainContent(sitePrefs.contentSelector);
    if (main) {
      selectedText = main;
      handleRead();
      return;
    }
  }
  audioEngine.play();
}

function handlePauseCallback() {
  audioEngine.pause();
}

function handleSettingsOpenedCallback() {
  openSettingsRequested = false;
}

function handlePositionChangeCallback(pos: { x: number; y: number }) {
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
function showSelectionButton(x: number, y: number) {
  if (!selectionButtonContainer) {
    const { container, renderTarget } = createShadowContainer("unmute-selection-button");
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
    const { container, renderTarget } = createShadowContainer("unmute-player");
    playerContainer = container;
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
}

function stopPlayback() {
  closedManually = true;
  isFinished = false;
  safeSendMessage({ type: "PLAYER_RESET" });
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
async function handleRead() {
  if (!selectedText || isLoading) {return;}
  closedManually = false;

  const settings = await getSettings();
  currentSpeed = settings.speed;
  audioEngine.setCurrentSpeed(settings.speed);
  highlightingEnabled = settings.highlightSentences;
  highlightColor = settings.highlightColor || "#fef08a";
  autoScrollEnabled = settings.autoScroll !== false;
  currentTheme = settings.theme || "dark";

  // Split raw text into sentences (matches page DOM for window.find highlighting),
  // then process each sentence individually for TTS.
  highlightManager.sentences = splitIntoSentences(selectedText);
  highlightManager.highlightingEnabled = highlightingEnabled;
  highlightManager.autoScrollEnabled = autoScrollEnabled;
  highlightManager.highlightColor = highlightColor;

  const processedSentences = await Promise.all(
    highlightManager.sentences.map(async (s) => humanizeText(await replaceUrlsWithTitles(s, safeSendMessage), settings.textReplacements))
  );

  // Pre-compute all sentence rects in a single sequential window.find() pass.
  highlightManager.precomputeAllSentenceRects();

  if (highlightingEnabled) {
    highlightManager.createHighlightOverlay();
  }

  audioEngine.cleanup();
  audioEngine.ensurePlayerIframe();

  isFinished = false;
  isLoading = true;
  isStreaming = true;
  totalChunks = 0;
  totalElapsedTime = 0;
  const CHARS_PER_SEC = 14;
  totalEstimatedDuration = selectedText.length / CHARS_PER_SEC;
  initialEstimatedDuration = totalEstimatedDuration;
  playerState = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    currentIndex: 0,
    queueLength: 0,
  };

  hideSelectionButton();
  showPlayer();

  try {
    const response = await safeSendMessage({
      type: "GENERATE_TTS",
      sentences: processedSentences,
      settings,
    }) as { success?: boolean; error?: string } | undefined;

    if (!response || !response.success) {
      throw new Error(response?.error || "TTS generation failed");
    }

    isLoading = false;
    updatePlayer();
  } catch (error) {
    console.error("TTS generation failed:", error);
    isLoading = false;
    if (!closedManually) {
      stopPlayback();
      alert(
        `TTS generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Settings change handling
// ---------------------------------------------------------------------------
function applySettingsChange(newSettings: TTSSettings) {
  if (newSettings.speed !== undefined && newSettings.speed !== currentSpeed) {
    currentSpeed = newSettings.speed;
    audioEngine.setSpeed(currentSpeed);
    updatePlayer();
  }
  if (newSettings.highlightSentences !== undefined) {
    highlightingEnabled = newSettings.highlightSentences;
    highlightManager.highlightingEnabled = highlightingEnabled;
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
chrome.runtime.onMessage.addListener((message) => {
  if (closedManually && [
    "TTS_PROGRESS", "TTS_STREAM_START", "TTS_AUDIO_CHUNK",
    "TTS_STREAM_END", "TTS_SENTENCE_WAV",
    "MODEL_DOWNLOAD_PROGRESS", "MODEL_DOWNLOAD_COMPLETE",
  ].includes(message.type)) {
    return;
  }

  if (message.type === "MODEL_DOWNLOAD_PROGRESS") {
    downloadProgress = { downloaded: message.downloaded, total: message.total };
    updatePlayer();
  }

  if (message.type === "MODEL_DOWNLOAD_COMPLETE") {
    downloadProgress = null;
    updatePlayer();
  }

  if (message.type === "TTS_PROGRESS") {
    if (message.totalChunks) {totalChunks = message.totalChunks;}
    updatePlayer();
  }

  if (message.type === "TTS_STREAM_START") {
    totalChunks = message.totalChunks;
    if (message.sentences) {
      audioEngine.generationSentences = message.sentences as string[];
      audioEngine.sentenceWavData = new Array(totalChunks).fill(null);
      audioEngine.sentenceDurations = new Array(totalChunks).fill(0);
      const CHARS_PER_SEC = 14;
      const PAUSE_SEC = 0.3;
      const totalChars = audioEngine.generationSentences.reduce((sum, s) => sum + s.length, 0);
      initialEstimatedDuration = totalChars / CHARS_PER_SEC + audioEngine.generationSentences.length * PAUSE_SEC;
      totalEstimatedDuration = initialEstimatedDuration;
    }
    updatePlayer();
  }

  if (message.type === "TTS_SENTENCE_WAV") {
    const idx = message.index as number;
    const wavData = new Uint8Array(message.wavBytes as number[]).buffer;
    const duration = message.duration as number;

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

    // Auto-play sentence 0 when it arrives
    if (idx === 0 && audioEngine.currentSentenceIdx === 0 && !playerState.isPlaying) {
      audioEngine.playCurrentSentence();
      highlightManager.updateHighlight(0);
    }

    // If we were waiting for this sentence (user seeked to it), play it
    if (idx === audioEngine.currentSentenceIdx && !playerState.isPlaying && idx > 0) {
      audioEngine.playCurrentSentence();
    }

    updatePlayer();
  }

  if (message.type === "TTS_AUDIO_CHUNK") {
    updatePlayer();
  }

  if (message.type === "TTS_STREAM_END") {
    isStreaming = false;
    isLoading = false;
    updatePlayer();
  }

  if (message.type === "PLAYBACK_INTERRUPTED") {
    closedManually = true;
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

  if (message.type === "OPEN_SETTINGS") {
    openSettingsRequested = true;
    showPlayer();
  }

  if (message.type === "EXTENSION_TOGGLE") {
    extensionEnabled = message.enabled;
    saveSitePrefs({ enabled: message.enabled });
    if (!extensionEnabled) {
      hideSelectionButton();
      destroyPlayer();
    } else {
      showPlayer();
    }
  }
});

// ---------------------------------------------------------------------------
// DOM event listeners
// ---------------------------------------------------------------------------
document.addEventListener("mouseup", (e) => {
  if (!extensionEnabled) {return;}

  const target = e.target as HTMLElement;
  if (
    target.closest("#unmute-selection-button") ||
    target.closest("#unmute-player") ||
    target.closest("#unmute-highlight-overlay")
  ) {
    return;
  }

  const selection = window.getSelection();
  const text = selection?.toString().trim();

  if (text && text.length > 0) {
    selectedText = text;
    showSelectionButton(e.clientX, e.clientY);
  } else {
    hideSelectionButton();
  }
});

document.addEventListener("mousedown", (e) => {
  const target = e.target as HTMLElement;
  if (
    !target.closest("#unmute-selection-button") &&
    !target.closest("#unmute-player") &&
    !target.closest("#unmute-highlight-overlay")
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
  if (target.closest("#unmute-player, #unmute-selection-button")) {return;}
  if (target.closest("a, button, input, select, textarea, [role='button']")) {return;}

  const idx = highlightManager.getSentenceIndexAtPoint(e.clientX, e.clientY);
  if (idx >= 0) {
    if (!audioEngine.sentenceWavData[idx]) {
      highlightManager.showLoadingHighlight(idx);
    }
    handleSeekToSentence(idx);
  }
});

// Keyboard shortcuts
const SPEED_OPTIONS = [0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2];

document.addEventListener("keydown", (e) => {
  if (!extensionEnabled) {return;}

  const realTarget = e.composedPath()[0] as HTMLElement;
  if (realTarget) {
    const rtTag = realTarget.tagName;
    if (rtTag === "INPUT" || rtTag === "TEXTAREA" || rtTag === "SELECT" ||
        realTarget.isContentEditable) {
      return;
    }
  }

  const hasAudio = playerState.queueLength > 0 || isLoading || isStreaming;
  const capture = () => { e.preventDefault(); e.stopPropagation(); };

  // Alt+R — start reading
  if (e.key === "r" && e.altKey && !hasAudio) {
    capture();
    const sel = window.getSelection()?.toString().trim();
    if (sel) {
      selectedText = sel;
      handleRead();
    } else {
      const main = detectMainContent(sitePrefs.contentSelector);
      if (main) {
        selectedText = main;
        handleRead();
      }
    }
    return;
  }

  if (e.key === "Escape" && hasAudio) {
    capture();
    stopPlayback();
    return;
  }

  if (e.key === " " && hasAudio) {
    capture();
    if (playerState.isPlaying) {
      audioEngine.pause();
    } else {
      audioEngine.play();
    }
    return;
  }

  if (e.key === "ArrowLeft" && hasAudio) {
    capture();
    handleSkipBack();
    return;
  }

  if (e.key === "ArrowRight" && hasAudio) {
    capture();
    handleSkipForward();
    return;
  }

  if (e.key === "ArrowUp" && hasAudio) {
    capture();
    let idx = SPEED_OPTIONS.findIndex(s => s >= currentSpeed);
    if (idx === -1) {idx = SPEED_OPTIONS.length - 1;}
    else if (SPEED_OPTIONS[idx] === currentSpeed && idx < SPEED_OPTIONS.length - 1) {idx++;}
    handleLocalSetSpeed(SPEED_OPTIONS[idx]);
    return;
  }

  if (e.key === "ArrowDown" && hasAudio) {
    capture();
    let idx = SPEED_OPTIONS.length - 1;
    while (idx > 0 && SPEED_OPTIONS[idx] > currentSpeed) {idx--;}
    if (SPEED_OPTIONS[idx] === currentSpeed && idx > 0) {idx--;}
    handleLocalSetSpeed(SPEED_OPTIONS[idx]);
    return;
  }

});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function estimatePageDuration() {
  const CHARS_PER_SEC = 14;
  const text = detectMainContent(sitePrefs.contentSelector);
  if (text && text.length > 0) {
    totalEstimatedDuration = text.length / CHARS_PER_SEC;
  }
}

async function init() {
  if (document.contentType && !document.contentType.startsWith("text/html")) {return;}

  const settings = await getSettings();
  currentTheme = settings.theme || "dark";
  currentSpeed = settings.speed;
  audioEngine.setCurrentSpeed(settings.speed);

  const result = await chrome.storage.local.get(SITE_KEY);
  sitePrefs = result[SITE_KEY] || {};

  if (sitePrefs.enabled === false) {
    extensionEnabled = false;
    return;
  }

  estimatePageDuration();
  showPlayer();

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
console.log("unmute.page content script loaded");
