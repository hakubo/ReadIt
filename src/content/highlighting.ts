// Sentence highlighting: overlay creation, rect computation, highlight boxes, and auto-scroll.
// All state is encapsulated in a HighlightManager instance.

import { hasNoiseAncestor } from "./contentDetection";

export interface HighlightState {
  sentences: string[];
  sentenceRectsCache: DOMRect[][];
  currentHighlightIndex: number;
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
    offsetLeft: rect.left,
    offsetTop: rect.top,
  };
}

export class HighlightManager {
  private highlightOverlay: HTMLDivElement | null = null;
  private currentHighlightBoxes: HTMLDivElement[] = [];
  private highlightResizeHandler: (() => void) | null = null;
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private highlightStyleEl: HTMLStyleElement | null = null;
  private scrollContainer: Element | null = null;

  sentences: string[] = [];
  sentenceRectsCache: DOMRect[][] = [];
  currentHighlightIndex = -1;
  highlightingEnabled = true;
  autoScrollEnabled = true;
  highlightColor = "rgba(254, 240, 138, 0.55)";

  /** Create the absolute overlay and attach resize handler. */
  createHighlightOverlay(): void {
    this.highlightOverlay = document.createElement("div");
    this.highlightOverlay.id = "unmute-highlight-overlay";
    this.highlightOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10000;
    `;
    (this.scrollContainer ?? document.documentElement).appendChild(this.highlightOverlay);

    // Inject keyframe for pulse animation into the main document
    this.highlightStyleEl = document.createElement("style");
    this.highlightStyleEl.textContent = `
      @keyframes unmute-pulse-opacity {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 0.15; }
      }
    `;
    document.head.appendChild(this.highlightStyleEl);

    this.highlightResizeHandler = () => {
      if (this.resizeDebounceTimer) {clearTimeout(this.resizeDebounceTimer);}
      this.resizeDebounceTimer = setTimeout(() => {
        this.precomputeAllSentenceRects();
        if (this.currentHighlightIndex >= 0) {
          this.applyHighlightForSentence(this.currentHighlightIndex);
        }
      }, 200);
    };
    window.addEventListener("resize", this.highlightResizeHandler);
  }

  /** Merge overlapping or adjacent rectangles on the same line. */
  private mergeRects(rects: DOMRectList): DOMRect[] {
    if (rects.length === 0) {return [];}

    const rectArray = Array.from(rects).sort((a, b) => {
      if (Math.abs(a.top - b.top) < 5) {return a.left - b.left;}
      return a.top - b.top;
    });

    const merged: DOMRect[] = [];
    let current = rectArray[0];

    for (let i = 1; i < rectArray.length; i++) {
      const next = rectArray[i];
      const sameLine = Math.abs(current.top - next.top) < 5;
      const overlaps = next.left <= current.right + 2;

      if (sameLine && overlaps) {
        const newRight = Math.max(current.right, next.right);
        const newBottom = Math.max(current.bottom, next.bottom);
        current = new DOMRect(
          current.left,
          Math.min(current.top, next.top),
          newRight - current.left,
          newBottom - Math.min(current.top, next.top)
        );
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);

    return merged;
  }

  /**
   * Pre-compute rects for ALL sentences in a single sequential window.find() pass.
   * Sequential calls naturally find the correct occurrence in DOM order.
   */
  precomputeAllSentenceRects(): void {
    const selection = window.getSelection();
    if (!selection || this.sentences.length === 0) {return;}

    const savedX = window.scrollX;
    const savedY = window.scrollY;
    const savedContainerX = this.scrollContainer?.scrollLeft ?? 0;
    const savedContainerY = this.scrollContainer?.scrollTop ?? 0;

    selection.removeAllRanges();

    const windowFind = (window as unknown as { find: (str: string, caseSensitive?: boolean, backwards?: boolean, wrapAround?: boolean, wholeWord?: boolean, searchInFrames?: boolean, showDialog?: boolean) => boolean }).find;

    this.sentenceRectsCache = [];
    let scrollContainerDetected = false;

    for (let s = 0; s < this.sentences.length; s++) {
      let rects: DOMRect[] = [];

      for (let attempt = 0; attempt < 10; attempt++) {
        const found = windowFind.call(window, this.sentences[s], true, false, false, false, true, false);
        if (!found || selection.rangeCount === 0) {break;}

        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const el = container.nodeType === Node.ELEMENT_NODE
          ? container as Element
          : container.parentElement;

        // Detect scroll container from the first matched sentence
        if (!scrollContainerDetected && el) {
          this.scrollContainer = findScrollContainer(el);
          scrollContainerDetected = true;
        }

        const boundary = this.scrollContainer ?? document.documentElement;
        if (el && hasNoiseAncestor(el, boundary)) {
          continue;
        }

        const offset = getScrollOffset(this.scrollContainer);
        const clientRects = this.mergeRects(range.getClientRects());
        rects = clientRects.map(r => new DOMRect(
          r.left - offset.offsetLeft + offset.scrollLeft,
          r.top - offset.offsetTop + offset.scrollTop,
          r.width,
          r.height
        ));
        break;
      }

      this.sentenceRectsCache.push(rects);
    }

    if (this.scrollContainer) {
      this.scrollContainer.scrollTo(savedContainerX, savedContainerY);
    }
    window.scrollTo(savedX, savedY);
    selection.removeAllRanges();
  }

  /** Apply highlight boxes for a sentence using cached absolute document coords. */
  applyHighlightForSentence(index: number): void {
    if (!this.highlightOverlay) {return;}

    this.currentHighlightBoxes.forEach(box => box.remove());
    this.currentHighlightBoxes = [];
    this.currentHighlightIndex = index;

    const rects = this.sentenceRectsCache[index];
    if (!rects) {return;}

    for (const r of rects) {
      const box = document.createElement("div");
      box.style.cssText = `
        position: absolute;
        left: ${r.x}px;
        top: ${r.y}px;
        width: ${r.width}px;
        height: ${r.height}px;
        background-color: ${this.highlightColor};
        border-radius: 3px;
        pointer-events: none;
      `;
      this.highlightOverlay.appendChild(box);
      this.currentHighlightBoxes.push(box);
    }
  }

  /** Update sentence highlighting and auto-scroll based on current playing index. */
  updateHighlight(index: number): void {
    if (index < 0 || index >= this.sentences.length) {return;}

    if (this.highlightingEnabled && this.highlightOverlay) {
      this.applyHighlightForSentence(index);
    }

    const rects = this.sentenceRectsCache[index];
    if (this.autoScrollEnabled && rects && rects.length > 0) {
      const absY = rects[0].y;
      const absBottom = rects[0].y + rects[0].height;

      if (this.scrollContainer) {
        const viewportTop = this.scrollContainer.scrollTop;
        const viewportBottom = viewportTop + this.scrollContainer.clientHeight;
        if (absBottom > viewportBottom) {
          this.scrollContainer.scrollTo({
            top: absY - this.scrollContainer.clientHeight / 3,
            behavior: "smooth",
          });
        }
      } else {
        const viewportTop = window.scrollY;
        const viewportBottom = viewportTop + window.innerHeight;
        if (absBottom > viewportBottom) {
          window.scrollTo({
            top: absY - window.innerHeight / 3,
            behavior: "smooth",
          });
        }
      }
    }
  }

  /** Show a pulsing loading highlight for a sentence that hasn't been generated yet. */
  showLoadingHighlight(index: number): void {
    if (!this.highlightingEnabled || !this.highlightOverlay) {return;}

    const rects = this.sentenceRectsCache[index];
    if (!rects || rects.length === 0) {return;}

    this.currentHighlightBoxes.forEach(box => box.remove());
    this.currentHighlightBoxes = [];
    this.currentHighlightIndex = index;

    for (const r of rects) {
      const box = document.createElement("div");
      box.style.cssText = `
        position: absolute;
        left: ${r.x}px;
        top: ${r.y}px;
        width: ${r.width}px;
        height: ${r.height}px;
        background-color: ${this.highlightColor};
        border-radius: 3px;
        pointer-events: none;
        animation: unmute-pulse-opacity 1.5s ease-in-out infinite;
      `;
      this.highlightOverlay.appendChild(box);
      this.currentHighlightBoxes.push(box);
    }
  }

  /** Look up which sentence (if any) is at a viewport click point. */
  getSentenceIndexAtPoint(clientX: number, clientY: number): number {
    if (this.sentenceRectsCache.length === 0) {return -1;}

    const offset = getScrollOffset(this.scrollContainer);
    const pageX = clientX - offset.offsetLeft + offset.scrollLeft;
    const pageY = clientY - offset.offsetTop + offset.scrollTop;

    for (let i = 0; i < this.sentenceRectsCache.length; i++) {
      const rects = this.sentenceRectsCache[i];
      for (const r of rects) {
        if (pageX >= r.x && pageX <= r.x + r.width &&
            pageY >= r.y && pageY <= r.y + r.height) {
          return i;
        }
      }
    }
    return -1;
  }

  /** Clear the current highlight without destroying the overlay. */
  clearCurrentHighlight(): void {
    this.currentHighlightBoxes.forEach(box => box.remove());
    this.currentHighlightBoxes = [];
    this.currentHighlightIndex = -1;
  }

  /** Clean up all highlighting state and DOM elements. */
  cleanup(): void {
    if (this.highlightResizeHandler) {
      window.removeEventListener("resize", this.highlightResizeHandler);
      this.highlightResizeHandler = null;
    }
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = null;
    }
    if (this.highlightStyleEl) {
      this.highlightStyleEl.remove();
      this.highlightStyleEl = null;
    }
    if (this.highlightOverlay) {
      this.highlightOverlay.remove();
      this.highlightOverlay = null;
    }
    this.currentHighlightBoxes = [];
    this.sentenceRectsCache = [];
    this.currentHighlightIndex = -1;
    this.sentences = [];
    this.scrollContainer = null;
  }
}
