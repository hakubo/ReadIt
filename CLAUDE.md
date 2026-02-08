# Kokoro TTS Chrome Extension

A Chrome extension that adds text-to-speech to any webpage. Select text, click "Read", and listen.

## Quick Start

```bash
npm install
npm run build
# Load dist/ folder as unpacked extension in chrome://extensions
```

## Linting

Run `npm run lint` before committing. Fix errors with `npm run lint:fix`. The codebase should have **0 errors**; warnings are acceptable.

## Rules

- always wrap ifs in curly braces, even if single-line (enforced by ESLint `curly` rule)
- use early returns to avoid deep nesting
- use descriptive variable/function names, avoid abbreviations
- keep functions focused, ideally under 30 lines
- use consistent formatting (prettier)
- comment non-obvious logic, especially around extension APIs and async flows but avoid redundant comments

## Architecture

```
Content Script (page) ←→ Background (service worker) ←→ Offscreen Document (TTS/Audio)
         ↓                                                        ↓
   Floating UI                                              ONNX inference
   (Shadow DOM)                                             Audio playback
```

### Key Files

- `src/content/index.tsx` - Selection button, floating player, sentence highlighting, element picker, keyboard shortcuts, text extraction
- `src/content/FloatingPlayer.tsx` - Pill-shaped player UI (play/pause, speed, progress ring, settings cog)
- `src/content/SettingsPanel.tsx` - Settings panel: voice selection, speed, highlight options, content selector, cache diagnostics
- `src/background/index.ts` - Message routing, offscreen lifecycle, URL title fetching, cache status check
- `src/offscreen/index.ts` - TTS generation (windowed), audio WAV creation, voice preview
- `src/shared/types.ts` - TTSSettings, SitePrefs, HIGHLIGHT_COLORS, DEFAULT_SETTINGS
- `src/shared/settings.ts` - Settings get/save helpers (global + per-domain)
- `src/lib/kokoro/` - ONNX model loading, voice generation, text processing
- `src/lib/resources/` - Model/voice file fetching with Cache API, voice/model metadata

## Important Patterns

### Chrome Extension Message Routing

**Critical**: `chrome.runtime.sendMessage()` broadcasts to ALL extension contexts (background, offscreen, popup). Don't forward messages that offscreen already receives directly.

```typescript
// BAD - causes double execution
if (message.type === "PLAYER_SKIP_FORWARD") {
  chrome.runtime.sendMessage(message); // Offscreen already received this!
}

// GOOD - let offscreen handle directly
// Player commands are received directly by offscreen, no forwarding needed
```

### Binary Data in Chrome Messaging

`chrome.runtime.sendMessage()` and `chrome.tabs.sendMessage()` are **JSON-serialized** — `ArrayBuffer` and typed arrays are silently dropped. Convert to a plain number array for transit, reconstruct on the receiving end:

```typescript
// Sender (offscreen)
const wavData = createWavBuffer(waveform, sampleRate);
chrome.runtime.sendMessage({
  wavBytes: Array.from(new Uint8Array(wavData)),
});

// Receiver (content script)
const wavData = new Uint8Array(message.wavBytes).buffer;
```

`window.postMessage()` (content script ↔ player iframe) uses structured cloning and handles `ArrayBuffer` natively — no conversion needed there.

### Audio Playback Speed

Use `audio.playbackRate` instead of ffmpeg for speed control. FFmpeg blob workers are blocked by CSP in extensions.

```typescript
// Generate at 1.0x, then adjust playback rate
const result = await generateVoice({ ...options, speed: 1 });
audioElement.playbackRate = userSpeed;
```

### Skip Navigation (Prev/Next)

Use a flag to prevent "ended" event from firing during manual navigation:

```typescript
let isManuallyNavigating = false;

function handleSkipForward() {
  isManuallyNavigating = true;
  audio.pause();
  currentIndex++;
  playCurrentChunk(); // Clear flag in play() promise callback
}

function handleAudioEnded() {
  if (isManuallyNavigating) return; // Don't auto-advance
  currentIndex++;
  playCurrentChunk();
}
```

### Sentence Highlighting

Use overlay with absolute positioning (not fixed) so highlights scroll with content:

```typescript
// Overlay container
highlightOverlay.style.cssText = `
  position: absolute;  /* NOT fixed - must scroll with page */
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
`;

// Highlight boxes - use document coordinates
box.style.cssText = `
  position: absolute;
  left: ${rect.left + window.scrollX}px;
  top: ${rect.top + window.scrollY}px;
  ...
`;
```

### Merging Overlapping Rects

When sentences contain inline elements (`<span>`, `<code>`), `getClientRects()` returns overlapping rectangles. Merge them:

```typescript
function mergeRects(rects: DOMRectList): DOMRect[] {
  // Sort by line (top), then position (left)
  // Merge rects on same line (within 5px) that overlap/touch
}
```

### URL Title Fetching

Fetch via background script (has host_permissions), not offscreen:

```typescript
// offscreen/index.ts
const response = await chrome.runtime.sendMessage({
  type: "FETCH_PAGE_TITLE",
  url,
});

// background/index.ts - has host_permissions: ["<all_urls>"]
if (message.type === "FETCH_PAGE_TITLE") {
  fetchPageTitle(message.url).then((title) => sendResponse({ title }));
  return true;
}
```

### Sentence Segmentation

Use `Intl.Segmenter` for proper sentence boundary detection:

```typescript
const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
const sentences = Array.from(segmenter.segment(text), (s) => s.segment.trim());
```

### Shadow DOM for UI Isolation

Floating UI uses Shadow DOM to avoid CSS conflicts with host page:

```typescript
const container = document.createElement("div");
const shadow = container.attachShadow({ mode: "open" });
const style = document.createElement("style");
style.textContent = SHADOW_STYLES;
shadow.appendChild(style);
```

## Settings

Global TTS settings stored in `chrome.storage.sync` (key: `"settings"`):

- `voices` - Array of voice IDs (e.g., ["af_heart"])
- `speed` - Playback speed (0.6-2.0)
- `highlightSentences` - Enable sentence highlighting
- `highlightColor` - RGBA color with transparency
- `autoScroll` - Auto-scroll to current sentence
- `theme` - "light" or "dark"

Per-domain overrides stored in `chrome.storage.local` (key: `"site:{hostname}"`):

- `playerPosition` - Floating player position
- `enabled` - Extension on/off for this domain
- `settings` - TTSSettings override
- `contentSelector` - CSS selector for main content area

## Build Outputs

```
dist/
├── manifest.json
├── popup.html/js/css
├── content.js
├── background.js
├── offscreen.html/js
├── *.wasm (ONNX runtime, espeak)
└── assets/
```

## Windowed Generation

Offscreen generates 15 sentences ahead. Content script sends `ADVANCE_GENERATION { upTo }` as playback advances. User seeking to an ungenerated sentence sends `REGENERATE_SENTENCE { index }` which sets `priorityIndex` in the offscreen loop. A `generated` Set tracks completed sentences to skip duplicates on backward seek.

## Content Detection

`detectMainContent()` priority: saved `contentSelector` (if matches exactly 1 element) → `detectContentElement()` heuristics → all `<p>` tags fallback.

`extractTextFromContainer()` uses `hasNoiseAncestor(el, boundary)` for bounded noise filtering — `closest(NOISE_SELECTOR)` alone would walk past the container to ancestors.

## Resource Caching

- Cache name: `"kokoro-tts-resources"` (Browser Cache API)
- Model: `{HF_BASE}/onnx/model.onnx` (~326 MB)
- Voices: `{HF_BASE}/voices/{voiceId}.bin` (54 voices, downloaded on first use)
- **Critical**: Content scripts use the page's origin for `caches` API. Check cache from background service worker via `CHECK_CACHE_STATUS` message.

## Common Issues

1. **"Extension context invalidated"** - Extension was reloaded while content script running. Reload the page.

2. **Double skip on prev/next** - Check message routing. Don't forward messages offscreen already receives.

3. **Highlights don't scroll** - Use `position: absolute` with `scrollX/Y` offsets, not `position: fixed`.

4. **Double highlighting on inline elements** - Merge overlapping rects from `getClientRects()`.

5. **CORS on URL fetch** - Fetch via background script which has host permissions.

6. **Shadow DOM keyboard shortcuts** - Use `e.composedPath()[0]` to detect focus inside Shadow DOM, not `document.activeElement?.shadowRoot?.activeElement`.

7. **Sentence count mismatch** - Process text per-sentence AFTER splitting (not before), to maintain 1:1 mapping between highlight indices and audio indices.

8. **Cache check returns wrong results** - `caches` API in content script uses page origin. Always check via background service worker.

9. **ArrayBuffer lost in Chrome messaging** - `chrome.runtime.sendMessage` is JSON-serialized. Use `Array.from(new Uint8Array(buffer))` to send, `new Uint8Array(arr).buffer` to receive. `window.postMessage` (to player iframe) handles `ArrayBuffer` natively.
