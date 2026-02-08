// Sentence highlighting: overlay creation, rect computation, highlight boxes, and auto-scroll.
// All state is encapsulated in a HighlightManager instance.

import { NOISE_SELECTOR } from "./contentDetection";

export interface HighlightState {
  sentences: string[];
  sentenceRectsCache: DOMRect[][];
  currentHighlightIndex: number;
}

export class HighlightManager {
  private highlightOverlay: HTMLDivElement | null = null;
  private currentHighlightBoxes: HTMLDivElement[] = [];
  private highlightScrollHandler: (() => void) | null = null;
  private highlightResizeHandler: (() => void) | null = null;
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private highlightStyleEl: HTMLStyleElement | null = null;

  sentences: string[] = [];
  sentenceRectsCache: DOMRect[][] = [];
  currentHighlightIndex = -1;
  highlightingEnabled = true;
  autoScrollEnabled = true;
  highlightColor = "rgba(254, 240, 138, 0.55)";

  /** Create the fixed overlay and attach scroll/resize handlers. */
  createHighlightOverlay(): void {
    this.highlightOverlay = document.createElement("div");
    this.highlightOverlay.id = "unmute-highlight-overlay";
    this.highlightOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 10000;
    `;
    document.documentElement.appendChild(this.highlightOverlay);

    // Inject keyframe for pulse animation into the main document
    this.highlightStyleEl = document.createElement("style");
    this.highlightStyleEl.textContent = `
      @keyframes unmute-pulse-opacity {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 0.15; }
      }
    `;
    document.head.appendChild(this.highlightStyleEl);

    this.highlightScrollHandler = () => this.repositionHighlightBoxes();
    window.addEventListener("scroll", this.highlightScrollHandler, { passive: true });

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

    selection.removeAllRanges();

    const windowFind = (window as unknown as { find: (str: string, caseSensitive?: boolean, backwards?: boolean, wrapAround?: boolean, wholeWord?: boolean, searchInFrames?: boolean, showDialog?: boolean) => boolean }).find;

    this.sentenceRectsCache = [];

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

        if (el && el.closest(NOISE_SELECTOR)) {
          continue;
        }

        const clientRects = this.mergeRects(range.getClientRects());
        rects = clientRects.map(r => new DOMRect(
          r.left + window.scrollX,
          r.top + window.scrollY,
          r.width,
          r.height
        ));
        break;
      }

      this.sentenceRectsCache.push(rects);
    }

    window.scrollTo(savedX, savedY);
    selection.removeAllRanges();
  }

  /**
   * Apply highlight boxes for a sentence from cached absolute coords,
   * converting to viewport-relative coords for the fixed overlay.
   */
  applyHighlightForSentence(index: number): void {
    if (!this.highlightOverlay) {return;}

    this.currentHighlightBoxes.forEach(box => box.remove());
    this.currentHighlightBoxes = [];
    this.currentHighlightIndex = index;

    const rects = this.sentenceRectsCache[index];
    if (!rects) {return;}

    const sx = window.scrollX;
    const sy = window.scrollY;

    for (const r of rects) {
      const box = document.createElement("div");
      box.style.cssText = `
        position: absolute;
        left: ${r.x - sx}px;
        top: ${r.y - sy}px;
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

  /** Reposition existing highlight boxes on scroll. */
  private repositionHighlightBoxes(): void {
    if (this.currentHighlightIndex < 0) {return;}
    const rects = this.sentenceRectsCache[this.currentHighlightIndex];
    if (!rects || rects.length !== this.currentHighlightBoxes.length) {return;}

    const sx = window.scrollX;
    const sy = window.scrollY;

    for (let i = 0; i < rects.length; i++) {
      this.currentHighlightBoxes[i].style.left = `${rects[i].x - sx}px`;
      this.currentHighlightBoxes[i].style.top = `${rects[i].y - sy}px`;
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

  /** Show a pulsing loading highlight for a sentence that hasn't been generated yet. */
  showLoadingHighlight(index: number): void {
    if (!this.highlightingEnabled || !this.highlightOverlay) {return;}

    const rects = this.sentenceRectsCache[index];
    if (!rects || rects.length === 0) {return;}

    this.currentHighlightBoxes.forEach(box => box.remove());
    this.currentHighlightBoxes = [];
    this.currentHighlightIndex = index;

    const sx = window.scrollX;
    const sy = window.scrollY;

    for (const r of rects) {
      const box = document.createElement("div");
      box.style.cssText = `
        position: absolute;
        left: ${r.x - sx}px;
        top: ${r.y - sy}px;
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

    const pageX = clientX + window.scrollX;
    const pageY = clientY + window.scrollY;

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
    if (this.highlightScrollHandler) {
      window.removeEventListener("scroll", this.highlightScrollHandler);
      this.highlightScrollHandler = null;
    }
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
  }
}
