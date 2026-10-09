# Performance TODO

Findings from a performance review (2026-10-08). Nothing here has been measured yet. Profile before and after each change.

Suggested order: 1, 2, 5 (quick, low risk), then 9 and 10, then the rest.

## Faster time to first audio

- [x] **1. Keep the model warm between reads** (tiny effort, saves about 1–5 s on every read after the first)
  - The offscreen document closes 10 s after `TTS_STREAM_END` (`OFFSCREEN_IDLE_MS` in `src/background/index.ts`). Aborts also call `releaseModel()` (`freeMemory()` in `src/offscreen/index.ts`).
  - So almost every read re-reads 326 MB from the Cache API, rebuilds the `InferenceSession` and, on WebGPU, recompiles shaders.
  - Raise the idle timeout to 2–5 min. Release the model only on the idle close, not on abort. This trades RAM for latency.

- [x] **2. Start generation before preprocessing finishes** (small effort, first audio sooner)
  - `handleRead()` in `src/content/index.tsx` awaits all URL→title fetches (5 s timeout each) and the synchronous `precomputeAllSentenceRects()` (`window.find()` plus `getComputedStyle` per sentence) before it sends `GENERATE_TTS`.
  - Send `GENERATE_TTS` first. Run the highlight precompute afterwards, in `requestIdleCallback` chunks.
  - Don't let title lookups block the first window. Lower the timeout to about 1–1.5 s.

- [~] **3. Use a quantized model** — rejected 2026-10-08: tried, voice quality was worse. Keep fp32. (small effort, needs a listening test; 2–4× less download and RAM)
  - `model.onnx` is fp32, 326 MB. The HF repo should also ship `model_fp16.onnx` (~163 MB) and `model_quantized.onnx` (q8, ~92 MB). Verify the file names.
  - Use q8 on the CPU/WASM path. Try fp16 on WebGPU and compare quality.
  - Update `getModel()` in `src/lib/resources/index.ts` and `CHECK_CACHE_STATUS` in the background to use the selected file.
  - Findings (2026-10-08, from `https://huggingface.co/api/models/onnx-community/Kokoro-82M-v1.0-ONNX/tree/1939ad2a8e416c0acfeecc08a694d14ef25f2231/onnx`, the revision pinned in `src/lib/resources/index.ts` and `DL_BASE` in `src/background/index.ts`):
    - `onnx/model.onnx`: fp32, 325,532,232 bytes (what we use today)
    - `onnx/model_fp16.onnx`: fp16, 163,234,740 bytes
    - `onnx/model_quantized.onnx`: 8-bit (transformers.js / kokoro-js `dtype: "q8"`), 92,361,116 bytes
    - `onnx/model_q8f16.onnx`: 8-bit + fp16 mixed, 86,033,585 bytes (smallest)
    - `onnx/model_uint8.onnx`: 177,464,632 bytes; `onnx/model_uint8f16.onnx`: 114,209,226 bytes
    - `onnx/model_q4.onnx`: 4-bit matmul, 305,215,966 bytes (barely smaller than fp32, not worth it)
    - `onnx/model_q4f16.onnx`: 4-bit matmul + fp16, 154,586,422 bytes
    - The model card has an audio sample for each variant, which is useful for a first listening comparison.
    - kokoro-js (same ONNX files) recommends `dtype: "q8"` with `device: "wasm"`, and says "If using webgpu, we recommend using dtype=fp32". Its WebGPU demo picks `device === "wasm" ? "q8" : "fp32"`.
    - So the expected split is `model_quantized.onnx` (or `model_q8f16.onnx`) on WASM and fp32 kept on WebGPU. The 8-bit files use integer ops (`MatMulInteger` / `DynamicQuantizeLinear`) that the WebGPU EP may not run natively and may hand back to CPU. fp16 on WebGPU needs the `shader-f16` feature and has had quality problems with Kokoro. Both are untested here; profile and listen before choosing.

- [ ] **4. Multi-threaded WASM** (medium effort, CPU path only)
  - Without cross-origin isolation, ORT WASM runs single-threaded.
  - Add `cross_origin_opener_policy` / `cross_origin_embedder_policy` to `public/manifest.json`, then set `ort.env.wasm.numThreads`.
  - This doesn't matter on WebGPU.

## Less memory

- [x] **5. 16-bit PCM WAV instead of 32-bit float** (tiny effort, halves audio memory)
  - `createWavBuffer()` (`src/lib/kokoro/createWavBuffer.ts`) writes `"32f"`, about 96 KB per second of audio. A 10-minute article is about 57 MB in `sentenceWavData`, plus base64 copies in transit and blob copies in the player iframe.
  - Write 16-bit instead (`"16"`, converting float to int16). There's no audible difference for TTS.
  - Optional: drop WAVs more than N sentences behind playback. Seeking back then needs a regenerate, and the offscreen `generated` set must allow it.

- [x] **6. Stream the first model download into the cache** (small effort, about 650 MB lower peak for fp32)
  - `getFileFromUrl()` (`src/lib/resources/getFileFromUrl.ts`) holds the stream chunks, the combined `buf`, and an `arrayBuffer.slice(0)` copy for `cache.put` at the same time. That's about 3× the model size.
  - Use `res.body.tee()`: one branch goes to `cache.put(url, new Response(branch))`, the other is written into a buffer pre-allocated from `Content-Length`. Peak drops to about 1×.

- [ ] **7. Send audio from offscreen straight to the player iframe** (medium effort, verify first)
  - Today each sentence goes offscreen → background → tab as JSON+base64, and the content script keeps a copy.
  - `player.html` is an extension page, so it may receive `chrome.runtime` messages directly. That would skip the background hop and keep audio out of the page's memory.
  - Check that this works for an extension iframe inside a third-party page (storage partitioning). Content would then only send indexes (play/preload N).

- [x] **8. Stop creating an espeak WASM instance per segment** (medium effort, profile first)
  - `phonemize()` (`src/lib/phonemizer/index.ts`) creates a new Emscripten instance on every call, with new memory and file-system setup.
  - `preprocessText()` calls it once per punctuation-separated segment, so a sentence with 3 commas means 4 instantiations.
  - Reuse one instance, or phonemize the whole sentence in one call and split afterwards.
  - Done: one instance is created with `noInitialRun`. Its linear memory is snapshotted after init and restored before each `main()` call. Calling `main()` twice without the restore breaks: every later call returns the first call's output, most likely because global CLI state such as getopt's `optind` persists between calls. Output is byte-identical to the old per-call instances (`src/__tests__/phonemizer.test.ts`). In Node this is about 6 ms per call instead of about 36 ms. The cost is a 32 MB snapshot kept in the offscreen document.

## Lighter cost on every page (content script runs on `<all_urls>`)

- [x] **9. Score content candidates in O(n)** (medium effort, lighter on every page load)
  - In `detectContentElement()` (`src/content/contentDetection.ts`), every `div`/`section` walks its whole subtree (`scoreContentLength`) and runs `querySelectorAll("a")`. That's roughly O(n²) in page size.
  - It runs on page load, on up to 15 MutationObserver ticks (`setupContentObserver`), and on every SPA route change.
  - Make one bottom-up pass that adds each text node's length (and link-text length) to its ancestors, then score from that map.

- [x] **10. Use the Navigation API for SPA route detection** (small effort, removes idle cost on every tab)
  - `observeRouteChanges()` (`src/content/routeObserver.ts`) keeps a `MutationObserver` on the whole `body` subtree for the life of the tab and resets a timer on every mutation. That's constant churn on chat apps, feeds and tickers.
  - Use `navigation.addEventListener("navigate" | "currententrychange")` (Chrome 102+), with the current approach or `popstate` as the fallback.

- [ ] **11. Lazy-load the player UI** (large effort)
  - React, lucide icons and about 900 lines of CSS (`src/content/styles.ts`) are injected into every page, but most pages never show the player.
  - Keep a tiny bootstrap content script. Load the UI on demand with `import(chrome.runtime.getURL("ui.js"))` (an ES module listed in `web_accessible_resources`).

- [x] **12. Cache background colours per element** (tiny effort, minor)
  - `getEffectiveBackgroundColor()` (`src/content/highlighting.ts`) walks ancestors with `getComputedStyle` for every sentence during precompute. Many sentences share a paragraph, so cache the result per element (`WeakMap`).

## Highlighting accuracy

- [x] **13. Search only the content area when locating sentences** (small effort, fewer wrong matches and a smaller index)
  - `precomputeAllSentenceRects()` (`src/content/highlighting.ts`) builds its text index from `document.body`, then falls back to an unfiltered `document.body` index. A sentence that also appears in a sidebar, nav or comment preview can be highlighted in the wrong place, and the whole page is indexed on every read.
  - When the text came from `detectMainContent()`, index only that element: the saved `contentSelector` match or the `detectContentElement()` result. Today `detectMainContent()` returns only text, so also return (or cache) the element it used.
  - Selected text: index the selection's `commonAncestorContainer` (or its closest block) instead of the body.
  - Keep `document.body` only for the last-resort `<p>` fallback, which has no single container.
  - Drop the unfiltered fallback inside the content root, or keep it scoped to the same root.

# Robustness TODO

Findings from a robustness review (2026-10-08). Grouped by owner area so they can be fixed in parallel with few file conflicts. IDs: **L** = read lifecycle, **U** = player UI/input, **C** = content detection/noise, **T** = text and highlighting.

## L. Read lifecycle (offscreen, background, `handleRead` in `src/content/index.tsx`)

Any of L1–L6 ends in a read that stalls forever.

- [x] **L1. A reset from one tab aborts another tab's read.** `stopPlayback()` broadcasts `PLAYER_RESET`. Offscreen aborts without checking the sender (`src/offscreen/index.ts` PLAYER_RESET). Triggers: toolbar toggle in another tab, or an SPA route change there. Fix: a `readId` per read (see L7) and only the owning tab may stop it.
- [x] **L2. Voice preview hijacks another tab's audio.** `PREVIEW_VOICE` calls `setActiveTabId(sender.tab.id)` (`src/background/index.ts`), so the rest of tab A's WAVs go to tab B. Fix: don't change `activeTabId` for previews; reply to the sender directly.
- [x] **L3. A failed sentence stalls playback forever.** The generation loop's catch only logs. Sentence 0 → spinner forever; sentence k → waits forever. Fix: on error send silence (or `TTS_SENTENCE_FAILED`) so the content script skips it.
- [x] **L4. Abort during the first model download is lost.** `abortGeneration = false` runs after `preloadModel`, wiping the abort. The old read then plays inside the new one. Fix: reset the flag at the start; return aborted if set after the model loads; use `readId`.
- [x] **L5. `beforeunload` mutes the read when the page doesn't leave.** A link that becomes a download, or Cancel on "Leave site?", sets `closedManually = true` and every later TTS message is dropped. Fix: use `pagehide`.
- [x] **L6. Sentences skipped by a forward seek can't be generated after the loop ends.** `REGENERATE_SENTENCE` only sets `priorityIndex`, which nothing reads once the loop exits. Fix: keep the loop waiting while sentences are missing, or start a one-off generation.
- [x] **L7. Stale audio from an aborted read plays in the next one.** Messages carry no read id. Fix: `readId` on `GENERATE_TTS`, echoed in every `TTS_*` message; drop mismatches.
- [x] **L8. Offscreen idle-close timer is unreliable.** It can close offscreen during a new read's model download (not cleared on `GENERATE_TTS`), and an MV3 `setTimeout` is lost when the service worker sleeps, keeping the model in memory forever. Fix: `chrome.alarms`; clear on `GENERATE_TTS`, `PREVIEW_VOICE`, `MODEL_DOWNLOAD_PROGRESS`.
- [x] **L9. Keep-awake updates can race** (`src/background/keepAwake.ts` read-modify-write) and leave the screen on forever. It also reacts to every tab load in the browser. Fix: serialise updates on a promise chain; `onUpdated` only for tabs already in the set.
- [x] **L10. `isLoading` stays true for almost the whole read**, so a new selection can't be read without closing the player. Fix: clear it when the first WAV arrives (separate `generating` flag); a new `handleRead` stops the current read first.
- [x] **L11. `handleRead` can run twice** before `isLoading` is set (after two awaits). Fix: a synchronous in-flight guard; re-check `closedManually` after each await.
- [x] **L12. A new read without closing leaks the old overlay, style element, resize handler and ResizeObserver.** Fix: `highlightManager.cleanup()` before `createHighlightOverlay()` (or make it idempotent).
- [x] **L13. URL title lookups for all sentences delay the first audio** (up to 1.5 s). Fix: resolve titles per generation window, or send sentence 0 first.

## U. Player UI and input (`public/player.js`, `audioEngine.ts`, keyboard and seek handlers in `index.tsx`)

- [x] **U1. Space while waiting for an ungenerated sentence replays the previous one and skips the awaited one.** The Space handler calls `audioEngine.play()` directly. Fix: route through `handlePlayCallback` / `handlePauseCallback`.
- [x] **U2. OS media keys and Chrome media controls desync the UI.** `player.js` only forwards `timeupdate`/`ended`; `PLAYER_ERROR` is ignored; `onSentencePlay` sets `isPlaying` before playback is confirmed. Pill shows Pause and the screen stays on. Fix: forward `play`/`pause` from the active element (ignore during the swap); treat `PLAYER_ERROR` as paused.
- [x] **U3. Keyboard shortcuts.** Alt+R never works on macOS (`e.key` is "®", use `e.code === "KeyR"`). Modifiers aren't checked (Cmd/Alt+Arrow hijacked). Space/arrows are taken on focused buttons, sliders, media. Escape stops the read while the element picker is open. Active for the whole session while `queueLength > 0`.
- [x] **U4. After an extension update the player stays but is dead.** Only `sendMessage` is guarded; `chrome.storage` and `chrome.runtime.getURL` throw. Fix: check `chrome.runtime?.id` at entry points; remove the UI and show "Extension updated — reload page".
- [x] **U5. Loading pulse for an ungenerated sentence is overwritten at once** (click-seek and `handleAudioEnded` call `updateHighlight`, which draws a normal highlight). Fix: call `showLoadingHighlight` in those branches.
- [x] **U6. Turning highlighting on mid-read does nothing** (overlay only created at read start).
- [ ] **U7. All WAVs stay in page memory for the whole read** (~170 MB/hour). Needs offscreen's `generated` set to allow regenerating dropped sentences. Lower priority.

## C. Content area and noise (`contentDetection.ts` detection/extraction, `elementPicker.ts`, `SettingsPanel.tsx`, `routeObserver.ts`, content observer in `index.tsx`, noise defaults in `shared/types.ts`)

- [x] **C1. One invalid noise selector breaks the extension on every site.** Input saves any string; `setNoiseSelector` joins them; `matches()` throws everywhere. Fix: validate before saving; drop invalid entries in `setNoiseSelector`.
- [x] **C2. Element picker builds invalid or unstable selectors.** `#${el.id}` isn't escaped (`:r1:`, `123`); generated ids (`ember123`) go stale. Fix: `CSS.escape`; skip generated-looking ids.
- [x] **C3. Picked noise selectors are global and can be a bare tag** (`section`, `div`), hiding that tag on every site. Fix: never accept a bare tag; store picked noise per domain.
- [x] **C4. Densest-block picks the outermost wrapper** (`#app`, `#__next`) on div-soup pages, including top bars and related posts. Fix: drill down while one child holds most of the text, or score by density.
- [x] **C5. `<main>` always wins**, even with an inner `<article>` (GitHub README reads the file table first). No visibility check. Fix: prefer the dominant `<article>`/`[itemprop=articleBody]` inside main; skip hidden mains.
- [x] **C6. A container with direct text and no block children returns null** (Hacker News comments). Fix: fall back to `getReadableText(target)` in the heuristic branch.
- [x] **C7. Thread pages read only one post** (HN, forums, many `<article>`s). Fix: when several sibling candidates score similarly, use their common parent.
- [x] **C8. Nested lists drop the outer item's own text** in `extractTextFromContainer`.
- [x] **C9. A page without real content returns a cookie banner or teaser** via the `<p>` fallback, which also stops the late-content observer. Fix: minimum total length; cookie/consent selectors in noise defaults.
- [x] **C10. Late-render observer gives up too early.** Not set up if any text exists; disconnects at duration > 0; pure debounce never fires on busy pages; not re-armed after SPA route changes.
- [x] **C11. SPA re-detection runs once after 500 ms and keeps a stale estimate** (`totalEstimatedDuration` not reset when detection returns null).
- [x] **C12. `replaceState` stops playback mid-read** (infinite-scroll news, UTM stripping). Hash-routed apps never re-detect. Fix: ignore `navigationType === "replace"` or only stop when the content root is detached; treat `#/` and `#!` as routes.
- [x] **C13. Default noise list.** `header` hides the headline `<header>` inside `<article>`; `form` hides pages wrapped in a form; `aside` hides in-article callouts. Missing: `#disqus_thread`, `.comments-area`, `.comment-respond`, newsletter/subscribe, cookie banners, breadcrumbs, `.byline`, footnote back-links, copy buttons.
- [x] **C14. Settings panel runs full-page detection once per noise pill per render.** Compute the boundary once.

## T. Text and highlighting (`textLocator.ts`, `highlighting.ts`, `textProcessing.ts`, `readableTextNodes`/`getReadableText`/`NON_READABLE_SELECTOR` in `contentDetection.ts`)

- [x] **T1. `display:contents` subtrees are never highlighted.** `checkVisibility()` is false for them, so the walker rejects the subtree. Also shadow DOM text isn't indexed. Fix: walk into `display:contents`.
- [x] **T2. Extraction and the index filter hidden elements differently.** Hidden text is spoken, and its sentence can't be found. Fix: one shared node filter for both (hidden, `[hidden]`, `aria-hidden`, closed `<details>`, but not `display:contents`).
- [x] **T3. Ranges go stale on re-render** (React, comments loading) and the highlight disappears for good. Fix: if a Range is collapsed or detached, drop the indexes and re-locate from that sentence.
- [x] **T4. Selected text doesn't match DOM text** (`text-transform: uppercase`, table cells joined with tabs). Fix: build the selected text from the selection Range's text nodes with the same walker as the index.
- [x] **T5. Words glued at `<br>` and between block siblings** ("ends.Para two"). Fix: emit `\n` at `<br>` and block edges in `getReadableText`.
- [x] **T6. Auto-scroll never scrolls up and fights manual scrolling.** Fix: scroll when above the viewport too; pause auto-scroll for a few seconds after user scroll.
- [x] **T7. Scroll container detected once, from the first sentence** (wrong if it's a nested `pre`/table scroller or content isn't overflowing yet; horizontal scrollers ignored; `position: relative` patch can shift site popovers). Consider the CSS Custom Highlight API (also fixes T3, T9 partly).
- [x] **T8. Text index memory on huge pages** (one object per character, ~150 MB per index, up to 3). Resize re-locates everything and clears the user's selection. Fix: per-node offsets with binary search; on resize re-measure only the current sentence.
- [x] **T9. Highlights drift on fixed/sticky content, are invisible in top-layer dialogs, and paint over site menus** (`z-index: 10000`). CSS Custom Highlight API fixes this.
- [x] **T10. A miss can rewind the search pointer**, so repeated sentences hit earlier copies. Fix: never move `searchFrom` backward; seed it from the selection start.
- [x] **T11. Icon ligatures and footnote markers are spoken** (`material-icons` "arrow_forward", `<sup>12</sup>`). Fix: add `[aria-hidden='true']`, icon-font classes and footnote links to the non-readable filter.
- [x] **T12. Abbreviation merge over-joins** ("Main St. Then…", "my ex. She…"), and URLs keep trailing punctuation so title lookup fails. Fix: move `st`/`ex` to context rules (keep "(ex. Twitter)" working); strip trailing `.,;:!?` from URLs; replace by match position.
