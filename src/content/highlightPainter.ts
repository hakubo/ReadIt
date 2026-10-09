// Paints the current sentence as rounded boxes in a fixed, full-viewport
// overlay. Box positions come straight from the sentence's live Range on every
// frame that needs it (scroll in any container, resize, layout change), so they
// follow nested scrollers, fixed/sticky content and late layout shifts without
// touching the page's own styles.
//
// Why not the CSS Custom Highlight API: ::highlight() can't round corners and
// paints only each font's glyph box, so a sentence with an inline <code> span
// gets uneven heights. Here every line of the sentence is one uniform box.

export const HIGHLIGHT_OVERLAY_ID = "readit-highlight-overlay";

const LINE_OVERLAP_RATIO = 0.5;
const HORIZONTAL_PADDING_PX = 2;
const VERTICAL_PADDING_PX = 1;
const BORDER_RADIUS_PX = 4;
const PULSE_ANIMATION = "readit-highlight-pulse";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function verticalOverlap(a: Box, b: Box): number {
  return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
}

/** True when `rect` sits on the same text line as `line` (they share most of their height). */
function isSameLine(line: Box, rect: Box): boolean {
  const smallerHeight = Math.min(line.bottom - line.top, rect.bottom - rect.top);
  return verticalOverlap(line, rect) >= smallerHeight * LINE_OVERLAP_RATIO;
}

/**
 * Merge a Range's client rects into one box per text line. Inline elements
 * (code, links, bold) produce several rects per line with different heights;
 * one box spanning all of them keeps the highlight even.
 */
export function lineBoxes(rects: ArrayLike<DOMRectReadOnly>): Box[] {
  const sorted = Array.from(rects)
    .filter(rect => rect.width > 0 && rect.height > 0)
    .map(rect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }))
    .sort((a, b) => a.top - b.top || a.left - b.left);

  const lines: Box[] = [];
  for (const rect of sorted) {
    const line = lines.find(candidate => isSameLine(candidate, rect));
    if (!line) {
      lines.push({ ...rect });
      continue;
    }
    line.left = Math.min(line.left, rect.left);
    line.top = Math.min(line.top, rect.top);
    line.right = Math.max(line.right, rect.right);
    line.bottom = Math.max(line.bottom, rect.bottom);
  }
  return lines;
}

/** Intersection of two boxes, or null when they don't overlap. */
export function intersectBoxes(a: Box, b: Box): Box | null {
  const box = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return box.right > box.left && box.bottom > box.top ? box : null;
}

const CLIPPING_OVERFLOW = new Set(["hidden", "clip", "auto", "scroll"]);

function clipsOverflow(element: Element): boolean {
  const style = getComputedStyle(element);
  return CLIPPING_OVERFLOW.has(style.overflowX) || CLIPPING_OVERFLOW.has(style.overflowY);
}

/**
 * The part of the viewport where the sentence is actually visible: the
 * viewport intersected with every ancestor that clips its overflow. Without
 * this, a sentence scrolled out of a nested scroller would still be painted
 * on top of whatever is next to that scroller.
 */
export function visibleArea(element: Element | null): Box | null {
  let area: Box | null = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  let current = element;
  while (current && area && current !== document.body && current !== document.documentElement) {
    if (clipsOverflow(current)) {
      area = intersectBoxes(area, current.getBoundingClientRect());
    }
    current = current.parentElement;
  }
  return area;
}

function padBox(box: Box): Box {
  return {
    left: box.left - HORIZONTAL_PADDING_PX,
    top: box.top - VERTICAL_PADDING_PX,
    right: box.right + HORIZONTAL_PADDING_PX,
    bottom: box.bottom + VERTICAL_PADDING_PX,
  };
}

/** Element the Range starts in (its parent for a text node; the container itself around a spoken element). */
export function rangeStartElement(range: Range): Element | null {
  const container = range.startContainer;
  return container.nodeType === Node.ELEMENT_NODE ? container as Element : container.parentElement;
}

/** Boxes to paint for a Range: one per line, padded, clipped to where the text is visible. */
export function highlightBoxes(range: Range): Box[] {
  const area = visibleArea(rangeStartElement(range));
  if (!area) {
    return [];
  }
  return lineBoxes(range.getClientRects())
    .map(box => intersectBoxes(padBox(box), area))
    .filter((box): box is Box => box !== null);
}

export class HighlightPainter {
  private overlay: HTMLDivElement | null = null;
  private range: Range | null = null;
  private color = "transparent";
  private loading = false;
  private frame: number | null = null;
  private layoutObserver: ResizeObserver | null = null;
  private readonly scheduleDraw = () => this.schedule();

  /** Create the overlay and start following scroll, resize and layout changes. Idempotent. */
  mount(): void {
    if (this.overlay) {
      return;
    }
    this.overlay = createOverlay();
    document.documentElement.appendChild(this.overlay);
    // Scroll doesn't bubble, but a capturing listener sees every scroller's scroll
    document.addEventListener("scroll", this.scheduleDraw, { capture: true, passive: true });
    window.addEventListener("resize", this.scheduleDraw, { passive: true });
    if (typeof ResizeObserver !== "undefined" && document.body) {
      this.layoutObserver = new ResizeObserver(this.scheduleDraw);
      this.layoutObserver.observe(document.body);
    }
  }

  unmount(): void {
    document.removeEventListener("scroll", this.scheduleDraw, { capture: true });
    window.removeEventListener("resize", this.scheduleDraw);
    this.layoutObserver?.disconnect();
    this.layoutObserver = null;
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.overlay?.remove();
    this.overlay = null;
    this.range = null;
  }

  /** Paint `range` now and keep it painted as the page moves. */
  paint(range: Range, color: string, loading: boolean): void {
    this.range = range;
    this.color = color;
    this.loading = loading;
    this.draw();
  }

  clear(): void {
    this.range = null;
    this.draw();
  }

  get currentRange(): Range | null {
    return this.range;
  }

  get isLoading(): boolean {
    return this.range !== null && this.loading;
  }

  /** Redraw on the next frame (coalesces bursts of scroll and mutation events). */
  schedule(): void {
    if (this.frame !== null || !this.overlay) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.draw();
    });
  }

  private draw(): void {
    if (!this.overlay) {
      return;
    }
    this.overlay.querySelectorAll("div").forEach(box => box.remove());
    if (!this.range) {
      return;
    }
    for (const box of highlightBoxes(this.range)) {
      this.overlay.appendChild(this.createBox(box));
    }
  }

  private createBox(box: Box): HTMLDivElement {
    const element = document.createElement("div");
    const pulse = this.loading ? `animation: ${PULSE_ANIMATION} 1.5s ease-in-out infinite;` : "";
    element.style.cssText = `
      position: absolute;
      left: ${box.left}px;
      top: ${box.top}px;
      width: ${box.right - box.left}px;
      height: ${box.bottom - box.top}px;
      background-color: ${this.color};
      border-radius: ${BORDER_RADIUS_PX}px;
      ${pulse}
    `;
    return element;
  }
}

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = HIGHLIGHT_OVERLAY_ID;
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = `
    all: initial;
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2147483000;
    overflow: hidden;
  `;
  const keyframes = document.createElement("style");
  keyframes.textContent = `@keyframes ${PULSE_ANIMATION} { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`;
  overlay.appendChild(keyframes);
  return overlay;
}
