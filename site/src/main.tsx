import { installChromeShim, handleMessage, broadcast, onStorageChanged } from "./chromeShim";
import { createRoot } from "react-dom/client";
import { useSyncExternalStore } from "react";
import { FloatingPlayer } from "@/content/FloatingPlayer";
import { SelectionButton } from "@/content/SelectionButton";
import { setPlaybackState } from "@/content/playerStore";
import { SHADOW_STYLES } from "@/content/styles";
import { isInteractiveTarget, nextSpeedDown, nextSpeedUp } from "@/content/keyboardShortcuts";
import { getEffectiveSettings } from "@/shared/settings";
import { voices } from "@/lib/resources";
import { DemoReader, demoSentences } from "./demo/demoReader";
import manifest from "./demo/audio-manifest.json";
import "./site.css";

installChromeShim();

const article = document.getElementById("demo-article") as HTMLElement;
const toastElement = document.getElementById("demo-toast") as HTMLElement;
const domain = window.location.hostname || "readit.demo";

function showToast(message: string) {
  toastElement.textContent = message;
  toastElement.classList.add("visible");
  clearTimeout(Number(toastElement.dataset.timer));
  toastElement.dataset.timer = String(setTimeout(() => toastElement.classList.remove("visible"), 3800));
}

const voiceName = (voiceId: string) => voices.find((voice) => voice.id === voiceId)?.name ?? voiceId;
let lastSubstitutionNotice = "";
const reader = new DemoReader(article, (requested, used) => {
  if (lastSubstitutionNotice === requested) {
    return;
  }
  lastSubstitutionNotice = requested;
  showToast(`This demo has four recorded voices, so ${voiceName(used)} stands in for ${voiceName(requested)}. The extension has all 54.`);
});

// --- What background/offscreen would answer ---

const recordedVoices = [...Object.keys(manifest.previews), ...Object.keys(manifest.voices)];
handleMessage("CHECK_CACHE_STATUS", () => ({ modelCached: true, cachedVoices: recordedVoices }));

const previewAudio = new Audio();
handleMessage("PREVIEW_VOICE", (message) => {
  const voiceId = String(message.voiceId);
  previewAudio.pause();
  if (!(voiceId in manifest.previews)) {
    broadcast({ type: "PREVIEW_STATE", voiceId, playing: false });
    showToast(`Previews here cover the English voices. ${voiceName(voiceId)} is in the extension.`);
    return;
  }
  previewAudio.src = `./audio/preview/${voiceId}.mp3`;
  previewAudio.onended = () => broadcast({ type: "PREVIEW_STATE", voiceId, playing: false });
  broadcast({ type: "PREVIEW_STATE", voiceId, playing: true });
  void previewAudio.play();
});

async function applyStoredSettings() {
  reader.applySettings(await getEffectiveSettings(domain));
}
onStorageChanged(() => void applyStoredSettings());
void applyStoredSettings();

// --- Shadow DOM UI, exactly as the content script mounts it ---

function createShadowRoot(): HTMLDivElement {
  const host = document.createElement("div");
  host.id = "readit-demo-ui";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = SHADOW_STYLES;
  const mount = document.createElement("div");
  shadow.append(style, mount);
  document.body.appendChild(host);
  return mount;
}

const noop = () => {};
const explainPicker = () => showToast("The element picker lets you click the part of a real page to read, or to skip. Try it once the extension is installed.");

interface UiState {
  playerVisible: boolean;
  selectionButton: { x: number; y: number } | null;
}

// Which demo UI is showing; set from the page's event handlers outside React
let uiState: UiState = { playerVisible: false, selectionButton: null };
const uiListeners = new Set<() => void>();
function setUi(update: Partial<UiState>) {
  uiState = { ...uiState, ...update };
  uiListeners.forEach((listener) => listener());
}
function subscribeUi(listener: () => void) {
  uiListeners.add(listener);
  return () => uiListeners.delete(listener);
}

function DemoUi() {
  const ui = useSyncExternalStore(subscribeUi, () => uiState);
  return (
    <>
      {ui.selectionButton && (
        <SelectionButton position={ui.selectionButton} onRead={readSelection} loading={false} theme="dark" />
      )}
      {ui.playerVisible && (
        <FloatingPlayer
          onPlay={() => reader.play()}
          onPause={() => reader.pause()}
          onRestart={() => reader.restart()}
          onSetSpeed={(speed) => reader.setSpeed(speed)}
          onClose={closePlayer}
          onSettingsOpened={() => setPlaybackState({ forceSettingsOpen: false })}
          initialPosition={{ x: window.innerWidth - 340, y: 84 }}
          onPositionChange={noop}
          onMinimizedChange={noop}
          onPickContent={explainPicker}
          onClearContentSelector={noop}
          onSetContentSelector={noop}
          onSelectorFocus={noop}
          onSelectorBlur={noop}
          onNoisePreview={noop}
          onNoisePreviewHide={noop}
          onPickNoise={explainPicker}
          noiseMatchCount={(selector) => {
            try {
              return article.querySelectorAll(selector).length;
            } catch {
              return 0;
            }
          }}
        />
      )}
    </>
  );
}

setPlaybackState({ domain });
createRoot(createShadowRoot()).render(<DemoUi />);

function closePlayer() {
  reader.stop();
  setUi({ playerVisible: false });
}

// --- Reading: the Read button on a selection, the "Read this page" button, click-to-seek ---

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** First and last demo sentences the selected text touches (a partial sentence counts). */
function selectedSentenceSpan(selectedText: string): [number, number] | null {
  const text = normalize(selectedText);
  const head = text.slice(0, 24);
  const tail = text.slice(-24);
  const first = demoSentences.findIndex((sentence) => sentence.includes(head) || text.includes(sentence));
  if (first < 0) {
    return null;
  }
  let last = first;
  demoSentences.forEach((sentence, index) => {
    if (index > first && (sentence.includes(tail) || text.includes(sentence))) {
      last = index;
    }
  });
  return [first, last];
}

function startRead(from?: number, to?: number) {
  setUi({ playerVisible: true, selectionButton: null });
  reader.start(from, to);
}

function readSelection() {
  const span = selectedSentenceSpan(window.getSelection()?.toString() ?? "");
  window.getSelection()?.removeAllRanges();
  startRead(span?.[0], span?.[1]);
}

function selectionInArticle(): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return null;
  }
  const range = selection.getRangeAt(0);
  return article.contains(range.commonAncestorContainer) ? range : null;
}

document.addEventListener("selectionchange", () => {
  if (!selectionInArticle()) {
    setUi({ selectionButton: null });
  }
});

article.addEventListener("mouseup", () => {
  // Let the click finish updating the selection first
  setTimeout(() => {
    const range = selectionInArticle();
    if (!range) {
      return;
    }
    const rect = range.getBoundingClientRect();
    setUi({ selectionButton: { x: rect.left + rect.width / 2, y: rect.top } });
  });
});

article.addEventListener("click", (event) => {
  if (!window.getSelection()?.isCollapsed) {
    return;
  }
  reader.seekToPoint(event.clientX, event.clientY);
});

window.addEventListener("scroll", () => setUi({ selectionButton: null }), { passive: true });

for (const button of document.querySelectorAll<HTMLElement>("[data-read-demo]")) {
  button.addEventListener("click", () => {
    article.scrollIntoView({ behavior: "smooth", block: "center" });
    startRead();
  });
}

for (const button of document.querySelectorAll<HTMLElement>("[data-open-settings]")) {
  button.addEventListener("click", () => {
    setUi({ playerVisible: true });
    setPlaybackState({ forceSettingsOpen: true });
  });
}

// Player shortcuts, as on a page being read: Space, arrows for sentences and speed
document.addEventListener("keydown", (event) => {
  const target = event.composedPath()[0];
  if (!reader.isReading || event.altKey || event.metaKey || event.ctrlKey || isInteractiveTarget(target)) {
    return;
  }
  const actions: Record<string, () => void> = {
    " ": () => (reader.isPlaying ? reader.pause() : reader.play()),
    ArrowLeft: () => reader.skip(-1),
    ArrowRight: () => reader.skip(1),
    ArrowUp: () => reader.setSpeed(nextSpeedUp(reader.currentSpeed)),
    ArrowDown: () => reader.setSpeed(nextSpeedDown(reader.currentSpeed)),
  };
  const action = actions[event.key];
  if (action) {
    event.preventDefault();
    action();
  }
});
