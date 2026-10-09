import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  HighlightManager,
  contrastSafeHighlightColor,
  findScrollContainer,
  getScrollOffset,
  parseColor,
  relativeLuminance,
  contrastRatio,
  blendChannel,
} from "../content/highlighting";
import { stubRangeRects } from "./highlightTestUtils";

function overlay(): HTMLElement | null {
  return document.getElementById("readit-highlight-overlay");
}

function paintedBoxes(): HTMLElement[] {
  return Array.from(overlay()?.querySelectorAll<HTMLElement>("div") ?? []);
}

describe("HighlightManager painting", () => {
  let manager: HighlightManager;
  let restoreRects: () => void;

  beforeEach(() => {
    restoreRects = stubRangeRects();
    document.body.innerHTML = `<p id="para" data-top="100">First sentence. Second sentence.</p>`;
    manager = new HighlightManager();
    manager.sentences = ["First sentence.", "Second sentence."];
  });

  afterEach(() => {
    manager.cleanup();
    restoreRects();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("mounts one fixed overlay outside <body>, idempotently", () => {
    manager.createHighlightOverlay();
    manager.createHighlightOverlay();
    expect(document.querySelectorAll("#readit-highlight-overlay")).toHaveLength(1);
    expect(overlay()?.parentElement).toBe(document.documentElement);
    expect(overlay()?.style.position).toBe("fixed");
  });

  it("paints the sentence's Range as rounded boxes and replaces it on the next sentence", () => {
    manager.createHighlightOverlay();
    manager.applyHighlightForSentence(0);
    expect(manager.painter.currentRange?.toString()).toBe("First sentence.");
    expect(paintedBoxes()).toHaveLength(1);
    expect(paintedBoxes()[0].style.borderRadius).toBe("4px");

    manager.applyHighlightForSentence(1);
    expect(manager.painter.currentRange?.toString()).toBe("Second sentence.");
    expect(paintedBoxes()).toHaveLength(1);
    expect(manager.currentHighlightIndex).toBe(1);
  });

  it("uses the configured colour when there is no colour data", () => {
    manager.highlightColor = "rgba(255, 0, 0, 0.5)";
    manager.applyHighlightForSentence(0);
    expect(paintedBoxes()[0].style.backgroundColor).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("lowers opacity for contrast based on the sentence's sampled colours", () => {
    document.body.innerHTML = `<p style="background-color: rgb(255, 255, 255); color: rgb(0, 0, 0)">Contrast sentence.</p>`;
    manager.sentences = ["Contrast sentence."];
    manager.highlightColor = "rgba(254, 240, 138, 0.55)";
    manager.applyHighlightForSentence(0);
    expect(parseColor(paintedBoxes()[0].style.backgroundColor).a).toBeLessThan(0.55);
  });

  it("shows a pulsing loading highlight", () => {
    manager.showLoadingHighlight(1);
    expect(manager.painter.isLoading).toBe(true);
    expect(manager.painter.currentRange?.toString()).toBe("Second sentence.");
    expect(paintedBoxes()[0].style.animation).toContain("readit-highlight-pulse");
  });

  it("does not show a loading highlight when highlighting is disabled", () => {
    manager.highlightingEnabled = false;
    manager.showLoadingHighlight(0);
    expect(manager.painter.currentRange).toBeNull();
  });

  it("clears the highlight when highlighting is turned off mid-read", () => {
    manager.updateHighlight(0);
    manager.highlightingEnabled = false;
    manager.updateHighlight(1);
    expect(paintedBoxes()).toHaveLength(0);
    expect(manager.currentHighlightIndex).toBe(-1);
  });

  it("ignores out-of-range indices", () => {
    manager.updateHighlight(5);
    manager.updateHighlight(-1);
    expect(manager.currentHighlightIndex).toBe(-1);
  });

  it("clearCurrentHighlight removes the boxes", () => {
    manager.showLoadingHighlight(0);
    manager.clearCurrentHighlight();
    expect(paintedBoxes()).toHaveLength(0);
    expect(manager.currentHighlightIndex).toBe(-1);
  });

  it("cleanup removes the overlay and resets state", () => {
    manager.applyHighlightForSentence(0);
    manager.cleanup();
    expect(overlay()).toBeNull();
    expect(manager.sentences).toEqual([]);
    expect(manager.sentenceColorsCache).toEqual([]);
  });

  it("finds the sentence under a viewport point from its live rects", () => {
    // stubRangeRects: left = start offset, top = data-top
    expect(manager.getSentenceIndexAtPoint(20, 110)).toBe(1);
    expect(manager.getSentenceIndexAtPoint(0, 110)).toBe(0);
    expect(manager.getSentenceIndexAtPoint(0, 500)).toBe(-1);
  });

  it("re-locates a sentence whose nodes were re-rendered", () => {
    manager.applyHighlightForSentence(0);
    // A framework re-render replaces the text node
    document.getElementById("para")!.textContent = "First sentence. Second sentence.";

    manager.applyHighlightForSentence(1);
    const range = manager.painter.currentRange;
    expect(range?.startContainer.isConnected).toBe(true);
    expect(range?.toString()).toBe("Second sentence.");
  });
});

describe("HighlightManager auto-scroll", () => {
  let manager: HighlightManager;
  let restoreRects: () => void;
  let windowScroll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    restoreRects = stubRangeRects();
    windowScroll = vi.fn();
    vi.stubGlobal("scrollBy", windowScroll);
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    manager = new HighlightManager();
    manager.createHighlightOverlay();
  });

  afterEach(() => {
    manager.cleanup();
    restoreRects();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function readAt(top: number): void {
    document.body.innerHTML = `<p data-top="${top}">Scrolled sentence.</p>`;
    manager.sentences = ["Scrolled sentence."];
    manager.resetSentenceRects();
  }

  it("scrolls the window down when the sentence is below the viewport", () => {
    readAt(1200);
    manager.updateHighlight(0);
    expect(windowScroll).toHaveBeenCalledWith({ top: 1200 - 800 / 3, behavior: "smooth" });
  });

  it("scrolls the window up when the sentence is above the viewport", () => {
    readAt(-300);
    manager.updateHighlight(0);
    expect(windowScroll.mock.calls[0][0].top).toBeLessThan(0);
  });

  it("does not scroll when the sentence is visible", () => {
    readAt(300);
    manager.updateHighlight(0);
    expect(windowScroll).not.toHaveBeenCalled();
  });

  it("pauses after the user scrolls with the wheel", () => {
    readAt(1200);
    window.dispatchEvent(new Event("wheel"));
    manager.updateHighlight(0);
    expect(windowScroll).not.toHaveBeenCalled();
  });

  it("scrolls a nested scroll container found at scroll time", () => {
    document.body.innerHTML = `
      <div id="scroller" style="overflow-y: auto"><p data-top="900">Nested sentence.</p></div>
    `;
    const scroller = document.getElementById("scroller")!;
    Object.defineProperty(scroller, "scrollHeight", { value: 3000 });
    Object.defineProperty(scroller, "clientHeight", { value: 600 });
    scroller.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    const scrollerScroll = vi.fn();
    scroller.scrollBy = scrollerScroll as unknown as typeof scroller.scrollBy;
    manager.sentences = ["Nested sentence."];
    manager.resetSentenceRects();

    manager.updateHighlight(0);

    expect(scrollerScroll).toHaveBeenCalledWith({ left: 0, top: 900 - 600 / 3, behavior: "smooth" });
    // The sentence ends up inside the window's viewport, so the window stays put
    expect(windowScroll).not.toHaveBeenCalled();
  });
});

describe("contrastSafeHighlightColor", () => {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };

  function opacityOf(color: string): number {
    return parseColor(color).a;
  }

  it("reduces opacity when highlight over white bg / black text fails contrast", () => {
    const color = contrastSafeHighlightColor("rgba(254, 240, 138, 0.55)", { bg: white, text: black });
    expect(opacityOf(color)).toBeLessThan(0.55);
    expect(opacityOf(color)).toBeGreaterThanOrEqual(0.15);
  });

  it("keeps the colour when contrast is already sufficient", () => {
    expect(contrastSafeHighlightColor("rgba(254, 240, 138, 0.1)", { bg: white, text: black }))
      .toBe("rgba(254, 240, 138, 0.1)");
  });

  it("keeps the colour when there is no colour data", () => {
    expect(contrastSafeHighlightColor("rgba(255, 0, 0, 0.5)", null)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("adjusts opacity for dark backgrounds too", () => {
    const color = contrastSafeHighlightColor("rgba(254, 240, 138, 0.55)", {
      bg: { r: 26, g: 26, b: 26 },
      text: { r: 224, g: 224, b: 224 },
    });
    expect(opacityOf(color)).toBeLessThan(0.55);
  });

  it("keeps >= 4.5:1 contrast with the adjusted colour", () => {
    const applied = parseColor(contrastSafeHighlightColor("rgba(254, 240, 138, 0.55)", { bg: white, text: black }));
    const blend = (base: { r: number; g: number; b: number }) => relativeLuminance(
      blendChannel(applied.r, base.r, applied.a),
      blendChannel(applied.g, base.g, applied.a),
      blendChannel(applied.b, base.b, applied.a),
    );
    expect(contrastRatio(blend(white), blend(black))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("findScrollContainer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when no scrollable ancestor exists", () => {
    const child = document.createElement("div");
    document.body.appendChild(child);
    expect(findScrollContainer(child)).toBeNull();
  });

  it("finds an ancestor with overflow-y: auto and scrollHeight > clientHeight", () => {
    const scroller = document.createElement("div");
    document.body.appendChild(scroller);
    const originalGetComputedStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      if (el === scroller) {
        return { overflowY: "auto" } as CSSStyleDeclaration;
      }
      return originalGetComputedStyle(el);
    });
    Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 800, configurable: true });
    const child = document.createElement("div");
    scroller.appendChild(child);
    expect(findScrollContainer(child)).toBe(scroller);
  });
});

describe("getScrollOffset", () => {
  it("returns window scroll values when container is null", () => {
    const offset = getScrollOffset(null);
    expect(offset.offsetLeft).toBe(0);
    expect(offset.offsetTop).toBe(0);
    expect(offset.scrollLeft).toBe(window.scrollX);
    expect(offset.scrollTop).toBe(window.scrollY);
  });

  it("returns scroller offsets when container is provided", () => {
    const scroller = document.createElement("div");
    document.body.appendChild(scroller);
    Object.defineProperty(scroller, "scrollLeft", { value: 10, configurable: true });
    Object.defineProperty(scroller, "scrollTop", { value: 50, configurable: true });
    scroller.getBoundingClientRect = () => new DOMRect(20, 30, 600, 400);
    const offset = getScrollOffset(scroller);
    expect(offset).toEqual({ scrollLeft: 10, scrollTop: 50, offsetLeft: 20, offsetTop: 30 });
  });
});

describe("contrast utilities", () => {
  describe("parseColor", () => {
    it("parses rgb()", () => {
      expect(parseColor("rgb(255, 128, 0)")).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    });

    it("parses rgba()", () => {
      expect(parseColor("rgba(100, 200, 50, 0.5)")).toEqual({ r: 100, g: 200, b: 50, a: 0.5 });
    });

    it("parses 6-digit hex", () => {
      expect(parseColor("#ff8000")).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    });

    it("parses 3-digit hex", () => {
      expect(parseColor("#f80")).toEqual({ r: 255, g: 136, b: 0, a: 1 });
    });

    it("returns white for unknown format", () => {
      expect(parseColor("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });
  });

  describe("relativeLuminance", () => {
    it("returns 0 for black", () => {
      expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 4);
    });

    it("returns 1 for white", () => {
      expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 4);
    });

    it("returns intermediate value for mid-gray", () => {
      const lum = relativeLuminance(128, 128, 128);
      expect(lum).toBeGreaterThan(0.1);
      expect(lum).toBeLessThan(0.5);
    });
  });

  describe("contrastRatio", () => {
    it("returns 21:1 for black and white", () => {
      const black = relativeLuminance(0, 0, 0);
      const white = relativeLuminance(255, 255, 255);
      expect(contrastRatio(black, white)).toBeCloseTo(21, 0);
    });

    it("returns 1:1 for same color", () => {
      const lum = relativeLuminance(128, 128, 128);
      expect(contrastRatio(lum, lum)).toBeCloseTo(1, 4);
    });

    it("is symmetric", () => {
      const l1 = relativeLuminance(200, 100, 50);
      const l2 = relativeLuminance(50, 100, 200);
      expect(contrastRatio(l1, l2)).toBe(contrastRatio(l2, l1));
    });
  });

  describe("blendChannel", () => {
    it("returns fg at alpha=1", () => {
      expect(blendChannel(100, 200, 1)).toBe(100);
    });

    it("returns bg at alpha=0", () => {
      expect(blendChannel(100, 200, 0)).toBe(200);
    });

    it("returns midpoint at alpha=0.5", () => {
      expect(blendChannel(100, 200, 0.5)).toBe(150);
    });
  });
});
