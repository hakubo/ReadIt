# Read it! — Kokoro TTS Chrome Extension

A Chrome extension that adds text-to-speech to any webpage. Select text, click "Read", and listen.

## Quick Start

```bash
npm install
npm run build          # local build, includes the debug panel
npm run build:release  # store build, debug panel compiled out
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
Content Script (page) ←→ Background (service worker) ←→ Offscreen Document (TTS)
    ↓            ↕ postMessage                                     ↓
Floating UI   Player iframe (player.html)                    ONNX inference
(Shadow DOM)  Audio playback                                 WAV creation
```

### Key Files

- `src/content/index.tsx` - Selection button, floating player, sentence highlighting, element picker, keyboard shortcuts, text extraction
- `src/content/FloatingPlayer.tsx` - Pill-shaped player UI (play/pause, speed, progress ring, settings cog)
- `src/content/SettingsPanel.tsx` - Settings panel: voice selection, speed, highlight options, content selector, cache diagnostics
- `src/background/index.ts` - Message routing, offscreen lifecycle, warm-up, cache status check
- `src/offscreen/index.ts` - TTS generation (windowed), audio WAV creation, voice preview
- `src/content/audioEngine.ts` - Talks to the hidden `player.html` iframe, which plays audio from the extension origin so page CSP can't block it
- `src/shared/binary.ts` - ArrayBuffer ↔ base64 for JSON-serialized Chrome messaging
- `src/content/textLocator.ts` - Finds sentence Ranges in page text for highlighting (replaces `window.find`)
- `src/shared/types.ts` - TTSSettings, SitePrefs, HIGHLIGHT_COLORS, DEFAULT_SETTINGS
- `src/shared/settings.ts` - Settings get/save helpers (global + per-domain)
- `src/lib/kokoro/` - ONNX model loading, voice generation, text processing
- `src/lib/resources/` - Model/voice file fetching with Cache API, voice/model metadata

## Important Patterns

### Chrome Extension Message Routing

**Critical**: `chrome.runtime.sendMessage()` broadcasts to ALL extension contexts (background, offscreen). Don't forward messages that offscreen already receives directly.

```typescript
// BAD - causes double execution
if (message.type === "PLAYER_SKIP_FORWARD") {
  chrome.runtime.sendMessage(message); // Offscreen already received this!
}

// GOOD - let offscreen handle directly
// Player commands are received directly by offscreen, no forwarding needed
```

### Binary Data in Chrome Messaging

`chrome.runtime.sendMessage()` and `chrome.tabs.sendMessage()` are **JSON-serialized** — `ArrayBuffer` and typed arrays are silently dropped. Encode as base64 for transit, decode on the receiving end:

```typescript
// Sender (offscreen)
const wavData = createWavBuffer(waveform, sampleRate);
chrome.runtime.sendMessage({
  wavBase64: arrayBufferToBase64(wavData), // ~1.33x size; a number array is ~4x
});

// Receiver (content script)
const wavData = base64ToArrayBuffer(message.wavBase64);
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

`HighlightManager` (`src/content/highlighting.ts`) locates each sentence as a live `Range`; `HighlightPainter` (`src/content/highlightPainter.ts`) paints the current one as rounded boxes in a `position: fixed` full-viewport overlay (`#readit-highlight-overlay`) attached to `<html>`. Box positions are read from `range.getClientRects()` (viewport coordinates) on every frame that needs it: a capturing `scroll` listener (sees nested scrollers too), `resize`, a `ResizeObserver` on `<body>` and DOM mutations. Nothing is cached in document coordinates and the page's own styles are never touched.

```typescript
// One box per text line: inline <code>/links make several rects of different
// heights per line, merged so the highlight is even.
for (const box of lineBoxes(range.getClientRects())) {
  // padded, then clipped to the viewport ∩ every overflow-clipping ancestor
}
```

- Why not the CSS Custom Highlight API: `::highlight()` can't round corners and paints only each font's glyph box, so mixed fonts give uneven heights. It was tried and reverted.
- Clipping: `visibleArea()` intersects the viewport with every ancestor whose overflow is `hidden`/`clip`/`auto`/`scroll`, so text scrolled out of a nested scroller isn't painted over its neighbours.
- The loading pulse is a CSS `animation` on the boxes (`readit-highlight-pulse` keyframes live in a `<style>` inside the overlay).
- Contrast: page colours are sampled per sentence when it is located. `contrastSafeHighlightColor()` lowers opacity so the text keeps 4.5:1 contrast.
- Click-to-seek (`getSentenceIndexAtPoint`) tests the click point against each Range's live `getClientRects()` in viewport coordinates.
- Auto-scroll measures the Range when the sentence changes. It scrolls every scrollable ancestor it finds at that moment (vertical or horizontal), then the window, in both directions. It pauses for 4 s after a wheel, touch or PageUp/PageDown/Home/End scroll. Arrows and Space are player shortcuts, so they don't pause it.
- Stale Ranges: a re-render (React, comments loading) moves a Range boundary off its text node or collapses it. `getSentenceRange()` notices this, drops the text indexes and locates again from that sentence, searching after the previous good one. A `MutationObserver` re-checks the current sentence once per frame and otherwise just repaints.
- `createHighlightOverlay()` mounts the painter and starts the observers. Idempotent.

### Spoken Text and Highlight Index Share One Node Filter

`readableTextParts()` (`contentDetection.ts`) is the only walker. It feeds `getReadableText()` (the spoken text), `buildTextIndex()` (the highlight index) and `getRangeReadableText()` (the selected text). It skips `NON_READABLE_SELECTOR` (script/style, `[hidden]`, collapsed `<details>` bodies, icon-font ligatures, footnote markers), short `aria-hidden` subtrees and `checkVisibility()`-hidden elements. It walks into `display: contents` and yields a line break at `<br>` and block edges. If text is filtered in one place and not the other, it is spoken but never highlighted. Change the filter there, never in a single caller.

- Elements read by meaning (`spokenElements.ts`): the walker yields a `SpokenElement` part instead of walking their children: a large image's alt text as its own sentence ("Image: …."), a small one inline, `<time datetime>` when the visible date is numeric (ISO date, then spoken per voice), `<kbd>` key names ("Control"), `<sup>` exponents ("squared"; a number after a word is a footnote and dropped), `<meter>`/`<progress>` as percent, `<math>` as its `alttext` or "formula". The index maps that text to the element, so the Range starts/ends around it (`elementBoundedRanges`, accepted by the stale-Range check) and the highlight covers the element. Extraction also collects `img` outside text blocks (`<figure>`).
- Reading options (`setReadingOptions()`, applied with the noise list in `applyContentFilters()` because text is extracted before a read loads settings): `readAltText`, `skipCode` (`<pre>`; inline `<code>` stays or the sentence breaks), `skipStrikethrough` (`del`, `s`, `strike`). Skips extend `isNonReadableElement()`.
- Selected text is built from the selection Range's DOM text (`getSelectionReadableText`), not `Selection.toString()`. `toString()` applies `text-transform` and joins table cells with tabs, so its sentences don't match the index.
- `TextIndex` maps text back to the DOM per run (one run per text node and collapsed whitespace gap), not per character. Lookups use binary search.
- `searchFrom` only moves forward and starts at the user's selection, so repeated sentences map to successive copies.

### Links Are Spoken as Their Domain

`replaceUrlsWithDomains()` turns `https://www.github.com/a/b` into "github.com" (trailing sentence punctuation stays). Page titles used to be fetched through the background, but it was slow (it delayed sentences up to 1.5 s) and rarely returned a title, so it was removed. Don't bring it back.

### Mentions and Hashtags Are Spoken as Words

`cleanHandles()` runs after `replaceUrlsWithDomains()` (so `medium.com/@user` is already gone): `@jane_doe` → "jane doe", `@JaneDoe2` → "Jane Doe", `@jane@mastodon.social` → "jane", `#MachineLearning` → "Machine Learning". Emails, `C#`, `#12` and a lone `@` are left alone.

### Written Forms Are Spoken the Way People Say Them

espeak reads symbols literally ("euros fifty", "two thousand twenty four dash zero one dash fifteen", "World War roman two", "ten gee bee"). `speakWrittenForms()` (`src/content/spokenForms/`) rewrites them in offscreen, after `cleanHandles()` and before the user's text rules. English voices only (`spokenFormsForVoice()`); the added words would be wrong in other languages.

- `currency.ts`: symbols and codes before or after the amount (`€50`, `50 €`, `12,50 zł`, `PLN 100`, `$2.5M`, `5 mln zł`, `$10-$20`), US/EU/Polish number grouping, minor units ("12 dollars 50 cents"). Runs before the default `$` rule.
- `dates.ts`: ISO, `2024/01/15`, `15.01.2024`, `1/15/2024`, `15-01-24`, `Jan 15`, `21 Sept`. American voices say "January 15th, 2024" and read an ambiguous `02/03/2024` as February 3rd; British voices say "3rd February 2024" and read it as 2 March. A part over 12 decides the order regardless.
- `speakRanges()` (`textProcessing.ts`): `70%-80%`, `2020-2024`, `10–20`.
- `numbers.ts`: `24/7`, `50/50`, `4.5/5`, `1/2`, `½`, `#1`, `1920x1080`, `1990s`, `p.`/`pp.`/`fig.`/`No.`, hyphen ranges only after "pages"-like nouns or before a unit (`10-20 minutes`), since a plain hyphen is also a phone number, score or date.
- `units.ts`: `10GB`, `100ms`, `60 km/h`, `25°C`. Case-sensitive; ambiguous ones (`m`, `g`, `s`, `in`) are skipped.
- `roman.ts`: II and up after a capitalised word: monarchs and popes get ordinals ("Henry the Eighth"), anything else a number ("World War 2", "Final Fantasy 7"). `I` never converts.
- Arrows (`→`, `->`) become a comma.

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
- `readAltText`, `skipCode`, `skipStrikethrough` - What the walker reads (see above)
- `switchVoiceByLanguage` - Read text in another `lang` with a voice for that language. Content sends `hints` with `GENERATE_TTS` (`findReadHints()`: `pageLanguage`, `sentenceLanguages` by index, matched by text like quotes); offscreen resolves a voice per language (`resolveLanguageVoice()`, same gender first; null for the main voice's own language or one no voice speaks, e.g. Polish). Language beats the quote voice.
- `expandAbbreviations` - `<abbr title>`: the first sentence in the read that uses it says "Application Programming Interface (API)" (`firstAbbreviationUses()`, worked out up front because sentences generate out of order). Off by default.
- `quoteVoice` - Voice for `<blockquote>`/`<q>` sentences: `"auto"` (best voice of the other gender in the main voice's language), `"off"` (main voice) or a voice id. Content marks quoted sentence indices (`findQuotedSentences`, matched by text) and sends them as `quotedSentences` with `GENERATE_TTS`; offscreen picks the voice per sentence (`resolveQuoteVoice`).

Per-domain overrides stored in `chrome.storage.local` (key: `"site:{hostname}"`):

- `playerPosition` - Floating player position
- `enabled` - Extension on/off for this domain
- `settings` - TTSSettings override
- `contentSelector` - CSS selector for main content area

## Chrome Web Store

- Product name is **Read it!** (`manifest.json` name/short_name, UI strings, log prefix `[Read it!]`). The old name unmute.page was dropped (domain not owned). Element ids, keyframes and the release env var use the `readit-` / `READIT_` prefix.
- No superlatives ("best", "#1") in the Store name or description: misleading-metadata policy.

- Upload only `npm run build:release` output (`dist/`); plain `build` ships the debug panel.
- Keep permissions minimal: no `activeTab`, no `<all_urls>` host permission (the content script's own `matches` injects it), only `huggingface.co` for model/voice data. `web_accessible_resources` is just `player.html` (anything listed there lets sites detect the extension).
- No remote code: ONNX Runtime and espeak WASM are always loaded from the extension (no CDN fallback).
- `public/THIRD_PARTY_NOTICES.txt` and `public/licenses/GPL-3.0.txt` ship in the package: espeak-ng is GPL-3.0, so its license text and source links must stay. Update the notices when adding a dependency.
- No `console.log` in the content script: page consoles belong to the site.

## Build Outputs

```
dist/
├── manifest.json
├── content.js
├── background.js
├── offscreen.html/js
├── player.html/js (audio playback iframe)
├── *.wasm (ONNX runtime, espeak)
└── assets/
```

## Windowed Generation

Offscreen generates 15 sentences ahead. Content script sends `ADVANCE_GENERATION { upTo }` as playback advances. User seeking to an ungenerated sentence sends `REGENERATE_SENTENCE { index }` which sets `priorityIndex` in the offscreen loop. A `generated` Set tracks completed sentences to skip duplicates on backward seek.

When the loop is parked at the window limit it awaits `generateResolve`. Any abort must go through `requestAbort()`, which also wakes the loop — setting `abortGeneration` alone leaves it parked and the next `OFFSCREEN_GENERATE_TTS` deadlocks on `await activeGeneration`. Voice preview uses its own `isPreviewing` flag; never reuse `isGenerating` for it.

## Start-up Latency

- **Warm-up:** when the selection's Read button appears or the player is hovered, content sends `WARM_UP` (throttled to once per 30 s). Background creates offscreen and forwards `OFFSCREEN_WARM_UP`; offscreen (`src/offscreen/warmUp.ts`) loads the model and runs one tiny sentence ("Hi.") so the phonemizer, voice file and WebGPU shaders are ready. It never starts the first 326 MB download (only a real read shows download progress), and a read waits for a running warm-up (`waitForWarmUp()`) so inference never runs twice at once. The idle-close alarm is re-armed after a warm-up.
- **No title lookups:** links are spoken as their domain, so no sentence waits on a network fetch.
- **Timing:** offscreen sends `TTS_TIMING` (warm-up wait, model load, text prep, synthesis, `webgpu`/`cpu`, plus `Date.now()` stamps for when it received the request and sent the first WAV) with the first audio. Content adds its own stamps (Play, `GENERATE_TTS` sent, first WAV received, audio playing) so `StartTimingTracker` can also show prepare / offscreen (includes creating the document) / deliver / play gaps. `performance.now()` has a different origin per extension context, so cross-context gaps must use `Date.now()`. Local builds log `[Read it!] Start-up: …` and shows it as "Last start" in Settings → Status.
- Rejected on purpose: smaller/quantized models (worse voice quality) and splitting a long first sentence (UX trade-off).

## Debug Panel (local builds)

`npm run build` defines `__DEBUG_TOOLS__ = true` (Vite `define`, declared in `src/globals.d.ts`); `npm run build:release` sets `READIT_RELEASE=1`, which makes it `false` so `installDebugPanel` and the panel are tree-shaken out of `content.js`. Vitest defines it as `true`.

- Toggle with **Alt+Shift+D**, or right-click → **Toggle debug panel** (page, selection or the toolbar icon). Pages that swallow key events can block the shortcut, never the menu item. It shows read flags, position, last start timing, generation speed (generation ms ÷ audio ms; above 1 means playback will stall), a sentence table (state, generation ms, audio length, found-for-highlight ✓/✗, quote ❝; hover for the spoken text and voice; click to seek) an event log (every event since the page loaded) and a Config tab: content area source (selection / saved selector / detected / paragraph fallback) with a Show button that outlines it, text rules with match counts in the current read, and noise selectors with page match counts (invalid ones flagged).
- Data: `DebugRecorder` (`src/content/debug/debugData.ts`) records read messages from the content listener; offscreen attaches a `report` (`synthesisMs`, `spokenText`, `voiceId`, `failed`) to every `TTS_SENTENCE_WAV`. The panel polls `getDebugSnapshot()` every 250 ms.

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

3. **Highlight missing or misplaced** - Boxes must come from the live Range in viewport coordinates and be repainted on scroll/resize/layout change. Don't cache rects in document coordinates or mount the overlay inside the page's scroll container: that drifts on fixed/sticky content and needed a `position: relative` patch on the site's scroller. Known limit: the overlay can't paint above top-layer `<dialog>`s.

4. **Highlight disappears after the page re-renders** - The Range went stale. `getSentenceRange()` re-locates it; keep new Range users going through it rather than reading `sentenceRanges` directly.

5. **CORS on extension fetches** - Fetch from the background service worker, which has host permissions.

6. **Shadow DOM keyboard shortcuts** - Use `e.composedPath()[0]` to detect focus inside Shadow DOM, not `document.activeElement?.shadowRoot?.activeElement`.

7. **Sentence count mismatch** - Process text per-sentence AFTER splitting (not before), to maintain 1:1 mapping between highlight indices and audio indices.

8. **Cache check returns wrong results** - `caches` API in content script uses page origin. Always check via background service worker.

9. **ArrayBuffer lost in Chrome messaging** - `chrome.runtime.sendMessage` is JSON-serialized. Use `arrayBufferToBase64()` to send, `base64ToArrayBuffer()` to receive (`src/shared/binary.ts`). `window.postMessage` (to player iframe) handles `ArrayBuffer` natively.

10. **Sentence not highlighted** - Don't use `window.find()` to locate sentences: in Chrome it can't match across a `<style>`/`<script>` element (Campsite puts one before every @mention). `textLocator.ts` searches a whitespace-collapsed index of readable text nodes instead. If a sentence is still missing, the spoken text and the index probably filtered nodes differently. Both must go through `readableTextParts()`.
