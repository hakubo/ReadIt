// Sentence highlighting: sentence location, CSS Custom Highlight API painting,
// contrast-aware colours, click-to-seek lookup and auto-scroll.
// All state is encapsulated in a HighlightManager instance.

import { buildTextIndex, elementBoundedRanges, findSentenceRange, textIndexAtBoundary, type TextIndex } from "./textLocator";
import { HighlightPainter, rangeStartElement } from "./highlightPainter";

// --- Contrast utilities ---

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface RGBA extends RGB {
  a: number;
}

export interface SentenceColors {
  bg: RGB;
  text: RGB;
}

/** Parse a CSS color string (rgb, rgba, hex) into RGBA components (0-255 for RGB, 0-1 for A). */
export function parseColor(color: string): RGBA {
  const rgbaMatch = color.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/
  );
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]),
      g: parseFloat(rgbaMatch[2]),
      b: parseFloat(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }
  const hexMatch = color.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

/** WCAG 2.0 relative luminance (0-1). */
export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** WCAG contrast ratio between two relative luminance values. */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Alpha-blend a foreground channel value over a background channel value. */
export function blendChannel(fg: number, bg: number, alpha: number): number {
  return fg * alpha + bg * (1 - alpha);
}

// Many sentences share a paragraph, so the ancestor walk is cached per element.
// Cleared at the start of every precompute because page styles can change
// between reads (e.g. a site's dark-mode toggle).
let backgroundColorCache = new WeakMap<Element, RGB>();

export function clearBackgroundColorCache(): void {
  backgroundColorCache = new WeakMap();
}

/**
 * Effective opaque background color behind an element (cached per element).
 * Falls back to white if no opaque ancestor found.
 */
export function getEffectiveBackgroundColor(el: Element): RGB {
  const cached = backgroundColorCache.get(el);
  if (cached) {
    return cached;
  }
  const color = computeEffectiveBackgroundColor(el);
  backgroundColorCache.set(el, color);
  return color;
}

/**
 * Walk up from an element to compute the effective opaque background color,
 * compositing semi-transparent layers.
 */
function computeEffectiveBackgroundColor(el: Element): RGB {
  let current: Element | null = el;
  const layers: RGBA[] = [];
  while (current && current !== document.documentElement) {
    const bg = getComputedStyle(current).backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
      const parsed = parseColor(bg);
      layers.unshift(parsed);
      if (parsed.a >= 1) { break; }
    }
    current = current.parentElement;
  }
  if (!layers.length || layers[0].a < 1) {
    const docBg = getComputedStyle(document.documentElement).backgroundColor;
    if (docBg && docBg !== "transparent" && docBg !== "rgba(0, 0, 0, 0)") {
      layers.unshift(parseColor(docBg));
    }
  }
  let result: RGB = { r: 255, g: 255, b: 255 };
  for (const layer of layers) {
    result = {
      r: blendChannel(layer.r, result.r, layer.a),
      g: blendChannel(layer.g, result.g, layer.a),
      b: blendChannel(layer.b, result.b, layer.a),
    };
  }
  return result;
}

export interface ScrollOffset {
  scrollLeft: number;
  scrollTop: number;
  offsetLeft: number;
  offsetTop: number;
}

/**
 * Walk up from an element to find the first scrollable ancestor.
 * Returns null if the page uses window-level scrolling.
 */
export function findScrollContainer(startEl: Element): Element | null {
  let el: Element | null = startEl.parentElement;
  while (el && el !== document.documentElement) {
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Get scroll offsets for converting viewport coords to content-space coords.
 * When container is null (window scrolling), returns window.scrollX/Y with zero offsets.
 */
export function getScrollOffset(container: Element | null): ScrollOffset {
  if (!container) {
    return {
      scrollLeft: window.scrollX,
      scrollTop: window.scrollY,
      offsetLeft: 0,
      offsetTop: 0,
    };
  }
  const rect = container.getBoundingClientRect();
  return {
    scrollLeft: container.scrollLeft,
    scrollTop: container.scrollTop,
    // Absolute children are placed from the padding edge, inside the border
    offsetLeft: rect.left + container.clientLeft,
    offsetTop: rect.top + container.clientTop,
  };
}

/** Sample bg/text colours for contrast-aware highlight adjustment. */
function sampleColors(el: Element): SentenceColors {
  const textParsed = parseColor(getComputedStyle(el).color);
  return {
    bg: getEffectiveBackgroundColor(el),
    text: { r: textParsed.r, g: textParsed.g, b: textParsed.b },
  };
}

type SentenceMatch = { range: Range; endIndex: number };

// Sentences located per setTimeout chunk when requestIdleCallback is unavailable.
const FALLBACK_CHUNK_SIZE = 10;
// Upper bound before an idle callback runs anyway on a page that is never idle.
const IDLE_CALLBACK_TIMEOUT_MS = 500;

/**
 * Run `work` when the main thread is idle. `hasTimeLeft` tells it when to yield.
 * Returns a cancel function.
 */
function scheduleIdleWork(work: (hasTimeLeft: () => boolean) => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(
      (deadline) => work(() => deadline.timeRemaining() > 1),
      { timeout: IDLE_CALLBACK_TIMEOUT_MS },
    );
    return () => cancelIdleCallback(handle);
  }
  let processedCount = 0;
  const handle = setTimeout(() => work(() => ++processedCount < FALLBACK_CHUNK_SIZE), 0);
  return () => clearTimeout(handle);
}

// --- Contrast-safe highlight colour ---

const MIN_CONTRAST = 4.5;
const MIN_HIGHLIGHT_OPACITY = 0.15;

/** Text/background contrast once a highlight colour is laid over both at `alpha`. */
function contrastUnderHighlight(highlight: RGB, colors: SentenceColors, alpha: number): number {
  const blendedLuminance = (base: RGB) => relativeLuminance(
    blendChannel(highlight.r, base.r, alpha),
    blendChannel(highlight.g, base.g, alpha),
    blendChannel(highlight.b, base.b, alpha),
  );
  return contrastRatio(blendedLuminance(colors.bg), blendedLuminance(colors.text));
}

/**
 * The highlight colour with its opacity lowered, if needed, so text under it
 * keeps WCAG AA contrast (4.5:1). Without colour data, the colour is unchanged.
 */
export function contrastSafeHighlightColor(highlightColor: string, colors: SentenceColors | null): string {
  if (!colors) {
    return highlightColor;
  }
  const highlight = parseColor(highlightColor);
  if (contrastUnderHighlight(highlight, colors, highlight.a) >= MIN_CONTRAST) {
    return highlightColor;
  }

  // Binary search for the highest opacity that keeps contrast >= 4.5:1
  let low = MIN_HIGHLIGHT_OPACITY;
  let high = highlight.a;
  let best = low;
  for (let step = 0; step < 16; step++) {
    const middle = (low + high) / 2;
    if (contrastUnderHighlight(highlight, colors, middle) >= MIN_CONTRAST) {
      best = middle;
      low = middle;
    } else {
      high = middle;
    }
  }

  // Floor to 2 decimal places so rounding never increases opacity above what the search validated
  const safeOpacity = Math.floor(best * 100) / 100;
  return `rgba(${Math.round(highlight.r)}, ${Math.round(highlight.g)}, ${Math.round(highlight.b)}, ${safeOpacity})`;
}

// --- Range helpers ---

/**
 * Ranges start and end in text nodes (or around a spoken element such as an
 * image, see elementBoundedRanges). When the page re-renders (React,
 * comments loading), a removed node moves the boundary to its parent element
 * or collapses the Range, and the highlight silently disappears.
 */
function isStaleRange(range: Range): boolean {
  const start = range.startContainer;
  const end = range.endContainer;
  if (range.collapsed || !start.isConnected || !end.isConnected) {
    return true;
  }
  if (elementBoundedRanges.has(range)) {
    return false;
  }
  return start.nodeType !== Node.TEXT_NODE || end.nodeType !== Node.TEXT_NODE;
}

function rangeElement(range: Range): Element | null {
  return rangeStartElement(range);
}

function rectsContainPoint(rects: DOMRectList, x: number, y: number): boolean {
  for (const rect of Array.from(rects)) {
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return true;
    }
  }
  return false;
}

// --- Auto-scroll ---

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const HORIZONTAL_SCROLL_MARGIN = 24;

/** Scroll needed so [start, end] shows inside [viewStart, viewEnd]: 0 when visible, else put it a third down. */
function verticalScrollDelta(box: Box, viewTop: number, viewBottom: number): number {
  if (box.top >= viewTop && box.bottom <= viewBottom) {
    return 0;
  }
  return box.top - (viewTop + (viewBottom - viewTop) / 3);
}

function horizontalScrollDelta(box: Box, viewLeft: number, viewRight: number): number {
  if (box.left >= viewLeft && box.right <= viewRight) {
    return 0;
  }
  return box.left - viewLeft - HORIZONTAL_SCROLL_MARGIN;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isScrollableOverflow(overflow: string): boolean {
  return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
}

/**
 * Scroll `element` (if it is a scroller on either axis) so `box` shows inside
 * it. Returns the scroll actually applied, so outer scrollers can aim at
 * where the text will end up.
 */
function scrollElementToShow(element: Element, box: Box): { x: number; y: number } {
  const style = getComputedStyle(element);
  const canScrollY = isScrollableOverflow(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
  const canScrollX = isScrollableOverflow(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
  if (!canScrollX && !canScrollY) {
    return { x: 0, y: 0 };
  }
  const bounds = element.getBoundingClientRect();
  const viewTop = bounds.top + element.clientTop;
  const viewLeft = bounds.left + element.clientLeft;
  const y = canScrollY
    ? clamp(verticalScrollDelta(box, viewTop, viewTop + element.clientHeight),
      -element.scrollTop, element.scrollHeight - element.clientHeight - element.scrollTop)
    : 0;
  const x = canScrollX
    ? clamp(horizontalScrollDelta(box, viewLeft, viewLeft + element.clientWidth),
      -element.scrollLeft, element.scrollWidth - element.clientWidth - element.scrollLeft)
    : 0;
  if (x !== 0 || y !== 0) {
    element.scrollBy({ left: x, top: y, behavior: "smooth" });
  }
  return { x, y };
}

/**
 * Bring a range into view: every scrollable ancestor (found now, not cached,
 * so nested <pre>/table scrollers and late-overflowing containers work), then
 * the window. Scrolls up as well as down.
 */
function scrollRangeIntoView(range: Range): void {
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  let box: Box = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  let element = rangeElement(range);
  while (element && element !== document.body && element !== document.documentElement) {
    const applied = scrollElementToShow(element, box);
    box = {
      top: box.top - applied.y, bottom: box.bottom - applied.y,
      left: box.left - applied.x, right: box.right - applied.x,
    };
    element = element.parentElement;
  }
  const windowDelta = verticalScrollDelta(box, 0, window.innerHeight);
  if (windowDelta !== 0) {
    window.scrollBy({ top: windowDelta, behavior: "smooth" });
  }
}

// --- CSS Custom Highlight API ---

const USER_SCROLL_PAUSE_MS = 4000;
// Arrow keys and Space are player shortcuts while reading, so they don't count.
const USER_SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End"]);

/**
 * Sentence highlighting: locates each sentence as a live Range and paints the
 * current one with HighlightPainter (rounded boxes in a fixed overlay,
 * re-measured from the Range whenever the page scrolls or changes layout).
 */
export class HighlightManager {
  /** Draws the current sentence; exposed for tests. */
  readonly painter = new HighlightPainter();
  private currentHighlightIsLoading = false;
  private mutationObserver: MutationObserver | null = null;
  private mutationFrame: number | null = null;
  private removeUserScrollListeners: (() => void) | null = null;
  private autoScrollPausedUntil = 0;

  // Sentence location state. Sentences are located in order (so repeated
  // sentences map to successive occurrences), lazily: in idle chunks after
  // generation starts, or on demand when a highlight needs one early.
  private filteredIndex: TextIndex | null = null;
  private rootFullIndex: TextIndex | null = null;
  private bodyFullIndex: TextIndex | null = null;
  private nextSentenceToLocate = 0;
  // Live Range per located sentence (null = not found on the page)
  private sentenceRanges: (Range | null)[] = [];
  // Only moves forward, so a fallback match on an earlier copy can't rewind it
  private searchFrom = 0;
  // Collapsed Range where the search starts (selection start, or the end of
  // the last good sentence after a re-render). Seeds searchFrom per index.
  private searchAnchor: Range | null = null;
  private cancelScheduledPrecompute: (() => void) | null = null;

  /** Element the text was read from; sentences are searched here first. Null = whole body. */
  contentRoot: Element | null = null;
  sentences: string[] = [];
  sentenceColorsCache: (SentenceColors | null)[] = [];
  currentHighlightIndex = -1;
  highlightingEnabled = true;
  autoScrollEnabled = true;
  highlightColor = "rgba(254, 240, 138, 0.55)";

  /** Prepare highlighting for a read: mount the overlay, watch re-renders and manual scrolling. Idempotent. */
  createHighlightOverlay(): void {
    this.painter.mount();
    this.observeDomChanges();
    this.listenForUserScroll();
  }

  /**
   * On DOM changes, re-locate the current sentence if a re-render detached its
   * Range, otherwise just repaint (text may have moved).
   */
  private observeDomChanges(): void {
    if (this.mutationObserver || typeof MutationObserver === "undefined" || !document.body) {
      return;
    }
    this.mutationObserver = new MutationObserver(() => {
      if (this.mutationFrame !== null || this.currentHighlightIndex < 0) {
        return;
      }
      this.mutationFrame = requestAnimationFrame(() => {
        this.mutationFrame = null;
        this.redrawIfStale();
      });
    });
    this.mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  private redrawIfStale(): void {
    const index = this.currentHighlightIndex;
    const range = this.sentenceRanges[index];
    if (index < 0 || !range) {
      return;
    }
    if (isStaleRange(range)) {
      this.drawHighlight(index, this.currentHighlightIsLoading);
    } else {
      this.painter.schedule();
    }
  }

  /** Pause auto-scroll for a while when the user scrolls by hand, so it doesn't fight them. */
  private listenForUserScroll(): void {
    if (this.removeUserScrollListeners) {
      return;
    }
    const pause = () => {
      this.autoScrollPausedUntil = Date.now() + USER_SCROLL_PAUSE_MS;
    };
    const pauseOnScrollKey = (event: KeyboardEvent) => {
      if (USER_SCROLL_KEYS.has(event.key)) {
        pause();
      }
    };
    const options: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("wheel", pause, options);
    window.addEventListener("touchmove", pause, options);
    window.addEventListener("keydown", pauseOnScrollKey, options);
    this.removeUserScrollListeners = () => {
      window.removeEventListener("wheel", pause, options);
      window.removeEventListener("touchmove", pause, options);
      window.removeEventListener("keydown", pauseOnScrollKey, options);
    };
  }

  /**
   * Forget all located sentences so they are located again from scratch.
   * Cheap: text indexes are built lazily on the first lookup. Remembers where
   * the user's selection starts (so repeated sentences match from there),
   * then clears the selection so its colour doesn't cover the highlight.
   */
  resetSentenceRects(): void {
    this.cancelScheduledPrecompute?.();
    this.cancelScheduledPrecompute = null;
    this.sentenceColorsCache = [];
    this.sentenceRanges = [];
    this.dropTextIndexes();
    this.nextSentenceToLocate = 0;
    this.searchAnchor = null;
    clearBackgroundColorCache();
    // An SPA may have replaced the content element since it was detected.
    if (this.contentRoot && !this.contentRoot.isConnected) {
      this.contentRoot = null;
    }
    if (this.sentences.length === 0) {return;}

    this.searchAnchor = this.selectionStartInContentRoot();
    window.getSelection()?.removeAllRanges();
  }

  private dropTextIndexes(): void {
    this.filteredIndex = null;
    this.rootFullIndex = null;
    this.bodyFullIndex = null;
    this.searchFrom = 0;
  }

  private selectionStartInContentRoot(): Range | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !this.contentRoot) {
      return null;
    }
    const range = selection.getRangeAt(0);
    if (!this.contentRoot.contains(range.startContainer)) {
      return null;
    }
    const anchor = range.cloneRange();
    anchor.collapse(true);
    return anchor;
  }

  /** Locate every sentence synchronously. */
  locateAllSentences(): void {
    this.resetSentenceRects();
    this.ensureSentencesLocated(this.sentences.length - 1);
  }

  /** Locate the remaining sentences in idle-time chunks, off the critical path. */
  schedulePrecompute(): void {
    this.cancelScheduledPrecompute?.();
    const runChunk = (hasTimeLeft: () => boolean) => {
      this.cancelScheduledPrecompute = null;
      // do-while: always make progress, even when the idle deadline has passed.
      do {
        if (this.nextSentenceToLocate >= this.sentences.length) {return;}
        this.locateNextSentence();
      } while (hasTimeLeft());
      this.cancelScheduledPrecompute = scheduleIdleWork(runChunk);
    };
    this.cancelScheduledPrecompute = scheduleIdleWork(runChunk);
  }

  /** Make sure sentences 0..index are located (no-op when already done). */
  ensureSentencesLocated(index: number): void {
    const lastIndex = Math.min(index, this.sentences.length - 1);
    while (this.nextSentenceToLocate <= lastIndex) {
      this.locateNextSentence();
    }
  }

  /** Number of sentences located so far (in order from 0). */
  get locatedSentenceCount(): number {
    return this.nextSentenceToLocate;
  }

  /** Whether a sentence was found on the page, without locating it (debug panel). */
  locationState(index: number): "pending" | "found" | "missing" {
    if (index >= this.nextSentenceToLocate) {
      return "pending";
    }
    return this.sentenceRanges[index] ? "found" : "missing";
  }

  private locateNextSentence(): void {
    const sentenceIndex = this.nextSentenceToLocate++;
    const match = this.findSentence(this.sentences[sentenceIndex]);
    const element = match ? rangeElement(match.range) : null;
    this.sentenceRanges[sentenceIndex] = match?.range ?? null;
    this.sentenceColorsCache[sentenceIndex] = element ? sampleColors(element) : null;
  }

  /** The sentence's live Range, re-locating it (and those after it) if a re-render detached it. */
  getSentenceRange(index: number): Range | null {
    this.ensureSentencesLocated(index);
    const range = this.sentenceRanges[index] ?? null;
    if (!range || !isStaleRange(range)) {
      return range;
    }
    this.relocateFrom(index);
    this.ensureSentencesLocated(index);
    return this.sentenceRanges[index] ?? null;
  }

  /** Drop the (now stale) indexes and locate again from `index`, searching after the previous sentence. */
  private relocateFrom(index: number): void {
    const previous = index > 0 ? this.sentenceRanges[index - 1] : null;
    if (previous && !isStaleRange(previous)) {
      this.searchAnchor = previous.cloneRange();
      this.searchAnchor.collapse(false);
    }
    this.sentenceRanges.length = index;
    this.sentenceColorsCache.length = index;
    this.nextSentenceToLocate = index;
    this.dropTextIndexes();
    if (this.contentRoot && !this.contentRoot.isConnected) {
      this.contentRoot = null;
    }
  }

  private getFilteredIndex(): TextIndex {
    if (this.filteredIndex) {
      return this.filteredIndex;
    }
    const index = buildTextIndex(this.contentRoot ?? document.body, { skipNoise: true });
    this.filteredIndex = index;
    if (this.searchAnchor) {
      this.searchFrom = Math.max(this.searchFrom, textIndexAtBoundary(index, this.searchAnchor));
    }
    return index;
  }

  /**
   * Search the content root's noise-filtered text in reading order; then its
   * unfiltered text (for a selection inside a noise area, e.g. an <aside>);
   * then, only if a content root is set, the whole body as a last resort.
   */
  private findSentence(sentence: string): SentenceMatch | null {
    const match = findSentenceRange(this.getFilteredIndex(), sentence, this.searchFrom);
    if (match) {
      this.searchFrom = Math.max(this.searchFrom, match.endIndex);
      return match;
    }
    const searchRoot = this.contentRoot ?? document.body;
    this.rootFullIndex ??= buildTextIndex(searchRoot, { skipNoise: false });
    const unfilteredMatch = findSentenceRange(this.rootFullIndex, sentence, 0);
    if (unfilteredMatch || !this.contentRoot) {
      return unfilteredMatch;
    }
    this.bodyFullIndex ??= buildTextIndex(document.body, { skipNoise: false });
    return findSentenceRange(this.bodyFullIndex, sentence, 0);
  }

  /** Highlight colour for a sentence, with opacity lowered when needed to keep text readable. */
  getContrastSafeColor(sentenceIndex: number): string {
    return contrastSafeHighlightColor(this.highlightColor, this.sentenceColorsCache[sentenceIndex] ?? null);
  }

  private drawHighlight(index: number, loading: boolean): void {
    this.painter.mount();
    const range = this.getSentenceRange(index);
    this.currentHighlightIndex = index;
    this.currentHighlightIsLoading = loading;
    if (!range) {
      this.painter.clear();
      return;
    }
    this.painter.paint(range, this.getContrastSafeColor(index), loading);
  }

  /** Highlight a sentence (replacing the current highlight). */
  applyHighlightForSentence(index: number): void {
    this.drawHighlight(index, false);
  }

  /** Update sentence highlighting and auto-scroll based on current playing index. */
  updateHighlight(index: number): void {
    if (index < 0 || index >= this.sentences.length) {return;}

    if (this.highlightingEnabled) {
      this.applyHighlightForSentence(index);
    } else {
      this.clearCurrentHighlight();
    }
    if (!this.autoScrollEnabled || Date.now() < this.autoScrollPausedUntil) {
      return;
    }
    const range = this.getSentenceRange(index);
    if (range) {
      scrollRangeIntoView(range);
    }
  }

  /** Show a pulsing loading highlight for a sentence that hasn't been generated yet. */
  showLoadingHighlight(index: number): void {
    if (!this.highlightingEnabled) {return;}
    this.drawHighlight(index, true);
  }

  /** Look up which sentence (if any) is at a viewport click point. */
  getSentenceIndexAtPoint(clientX: number, clientY: number): number {
    this.ensureSentencesLocated(this.sentences.length - 1);
    for (let index = 0; index < this.sentences.length; index++) {
      const range = this.getSentenceRange(index);
      if (range && rectsContainPoint(range.getClientRects(), clientX, clientY)) {
        return index;
      }
    }
    return -1;
  }

  /** Clear the current highlight but keep the overlay mounted. */
  clearCurrentHighlight(): void {
    this.painter.clear();
    this.currentHighlightIndex = -1;
    this.currentHighlightIsLoading = false;
  }

  /** Clean up all highlighting state, listeners and the overlay. */
  cleanup(): void {
    this.clearCurrentHighlight();
    this.painter.unmount();
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    if (this.mutationFrame !== null) {
      cancelAnimationFrame(this.mutationFrame);
      this.mutationFrame = null;
    }
    this.removeUserScrollListeners?.();
    this.removeUserScrollListeners = null;
    this.autoScrollPausedUntil = 0;
    // Empty sentences first so the reset leaves the user's selection alone.
    this.sentences = [];
    this.resetSentenceRects();
    this.contentRoot = null;
  }
}
