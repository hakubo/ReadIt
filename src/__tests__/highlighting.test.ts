import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HighlightManager, findScrollContainer, getScrollOffset } from "../content/highlighting";

describe("HighlightManager", () => {
  let hm: HighlightManager;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.querySelectorAll("#unmute-highlight-overlay").forEach(el => el.remove());
    hm = new HighlightManager();
  });

  afterEach(() => {
    hm.cleanup();
  });

  describe("createHighlightOverlay", () => {
    it("creates an overlay with position: absolute", () => {
      hm.createHighlightOverlay();
      const overlay = document.getElementById("unmute-highlight-overlay");
      expect(overlay).not.toBeNull();
      expect(overlay!.style.position).toBe("absolute");
    });

    it("overlay is not position: fixed", () => {
      hm.createHighlightOverlay();
      const overlay = document.getElementById("unmute-highlight-overlay");
      expect(overlay!.style.position).not.toBe("fixed");
    });

    it("overlay has pointer-events: none", () => {
      hm.createHighlightOverlay();
      const overlay = document.getElementById("unmute-highlight-overlay");
      expect(overlay!.style.pointerEvents).toBe("none");
    });

    it("appends overlay to document.documentElement", () => {
      hm.createHighlightOverlay();
      const overlay = document.getElementById("unmute-highlight-overlay");
      expect(overlay!.parentElement).toBe(document.documentElement);
    });

    it("injects pulse animation stylesheet", () => {
      hm.createHighlightOverlay();
      const styles = document.head.querySelectorAll("style");
      const pulseStyle = Array.from(styles).find(s =>
        s.textContent?.includes("unmute-pulse-opacity")
      );
      expect(pulseStyle).not.toBeUndefined();
    });
  });

  describe("applyHighlightForSentence", () => {
    it("creates highlight boxes with absolute document coordinates", () => {
      hm.createHighlightOverlay();
      hm.sentenceRectsCache = [
        [new DOMRect(100, 200, 300, 20)],
      ];

      hm.applyHighlightForSentence(0);

      const overlay = document.getElementById("unmute-highlight-overlay")!;
      const boxes = overlay.querySelectorAll("div");
      expect(boxes.length).toBe(1);
      expect(boxes[0].style.left).toBe("100px");
      expect(boxes[0].style.top).toBe("200px");
      expect(boxes[0].style.width).toBe("300px");
      expect(boxes[0].style.height).toBe("20px");
    });

    it("uses absolute coords without scroll subtraction", () => {
      hm.createHighlightOverlay();
      // Rect at absolute position (500, 1000) — should stay there regardless of scroll
      hm.sentenceRectsCache = [
        [new DOMRect(500, 1000, 200, 18)],
      ];

      hm.applyHighlightForSentence(0);

      const overlay = document.getElementById("unmute-highlight-overlay")!;
      const box = overlay.querySelector("div")!;
      // Coordinates should be the raw absolute values, not adjusted by scroll
      expect(box.style.left).toBe("500px");
      expect(box.style.top).toBe("1000px");
    });

    it("creates multiple boxes for multi-line sentences", () => {
      hm.createHighlightOverlay();
      hm.sentenceRectsCache = [
        [
          new DOMRect(10, 100, 500, 20),
          new DOMRect(10, 120, 300, 20),
        ],
      ];

      hm.applyHighlightForSentence(0);

      const overlay = document.getElementById("unmute-highlight-overlay")!;
      const boxes = overlay.querySelectorAll("div");
      expect(boxes.length).toBe(2);
      expect(boxes[0].style.top).toBe("100px");
      expect(boxes[1].style.top).toBe("120px");
    });

    it("clears previous boxes when highlighting a new sentence", () => {
      hm.createHighlightOverlay();
      hm.sentenceRectsCache = [
        [new DOMRect(0, 0, 100, 20)],
        [new DOMRect(0, 50, 100, 20)],
      ];

      hm.applyHighlightForSentence(0);
      const overlay = document.getElementById("unmute-highlight-overlay")!;
      expect(overlay.querySelectorAll("div").length).toBe(1);

      hm.applyHighlightForSentence(1);
      expect(overlay.querySelectorAll("div").length).toBe(1);
      expect(overlay.querySelector("div")!.style.top).toBe("50px");
    });

    it("does nothing without overlay", () => {
      hm.sentenceRectsCache = [[new DOMRect(0, 0, 100, 20)]];
      // No createHighlightOverlay() call
      hm.applyHighlightForSentence(0);
      expect(document.getElementById("unmute-highlight-overlay")).toBeNull();
    });

    it("applies custom highlight color", () => {
      hm.highlightColor = "rgba(255, 0, 0, 0.5)";
      hm.createHighlightOverlay();
      hm.sentenceRectsCache = [[new DOMRect(0, 0, 100, 20)]];

      hm.applyHighlightForSentence(0);

      const overlay = document.getElementById("unmute-highlight-overlay")!;
      const box = overlay.querySelector("div")!;
      expect(box.style.backgroundColor).toBe("rgba(255, 0, 0, 0.5)");
    });
  });

  describe("showLoadingHighlight", () => {
    it("creates boxes with absolute coords and pulse animation", () => {
      hm.createHighlightOverlay();
      hm.sentenceRectsCache = [
        [new DOMRect(50, 300, 400, 22)],
      ];

      hm.showLoadingHighlight(0);

      const overlay = document.getElementById("unmute-highlight-overlay")!;
      const box = overlay.querySelector("div")!;
      expect(box.style.left).toBe("50px");
      expect(box.style.top).toBe("300px");
      expect(box.style.animation).toContain("unmute-pulse-opacity");
    });

    it("does nothing when highlighting is disabled", () => {
      hm.createHighlightOverlay();
      hm.highlightingEnabled = false;
      hm.sentenceRectsCache = [[new DOMRect(0, 0, 100, 20)]];

      hm.showLoadingHighlight(0);

      const overlay = document.getElementById("unmute-highlight-overlay")!;
      expect(overlay.querySelectorAll("div").length).toBe(0);
    });
  });

  describe("clearCurrentHighlight", () => {
    it("removes all highlight boxes", () => {
      hm.createHighlightOverlay();
      hm.sentenceRectsCache = [[new DOMRect(0, 0, 100, 20)]];
      hm.applyHighlightForSentence(0);

      const overlay = document.getElementById("unmute-highlight-overlay")!;
      expect(overlay.querySelectorAll("div").length).toBe(1);

      hm.clearCurrentHighlight();
      expect(overlay.querySelectorAll("div").length).toBe(0);
      expect(hm.currentHighlightIndex).toBe(-1);
    });
  });

  describe("getSentenceIndexAtPoint", () => {
    it("returns sentence index for a point inside cached rects", () => {
      hm.sentenceRectsCache = [
        [new DOMRect(0, 0, 100, 20)],
        [new DOMRect(0, 50, 200, 20)],
      ];

      // Point inside sentence 1
      expect(hm.getSentenceIndexAtPoint(50, 55)).toBe(1);
    });

    it("returns -1 for a point outside all rects", () => {
      hm.sentenceRectsCache = [
        [new DOMRect(0, 0, 100, 20)],
      ];

      expect(hm.getSentenceIndexAtPoint(500, 500)).toBe(-1);
    });

    it("returns -1 when no rects cached", () => {
      expect(hm.getSentenceIndexAtPoint(50, 50)).toBe(-1);
    });
  });

  describe("cleanup", () => {
    it("removes overlay and style elements from DOM", () => {
      hm.createHighlightOverlay();
      expect(document.getElementById("unmute-highlight-overlay")).not.toBeNull();

      hm.cleanup();
      expect(document.getElementById("unmute-highlight-overlay")).toBeNull();
    });

    it("resets all state", () => {
      hm.createHighlightOverlay();
      hm.sentences = ["test"];
      hm.sentenceRectsCache = [[new DOMRect(0, 0, 100, 20)]];
      hm.currentHighlightIndex = 0;

      hm.cleanup();
      expect(hm.sentences).toEqual([]);
      expect(hm.sentenceRectsCache).toEqual([]);
      expect(hm.currentHighlightIndex).toBe(-1);
    });
  });

  describe("updateHighlight", () => {
    it("ignores out-of-range indices", () => {
      hm.createHighlightOverlay();
      hm.sentences = ["Hello"];
      hm.sentenceRectsCache = [[new DOMRect(0, 0, 100, 20)]];

      hm.updateHighlight(-1);
      expect(hm.currentHighlightIndex).toBe(-1);

      hm.updateHighlight(5);
      expect(hm.currentHighlightIndex).toBe(-1);
    });

    it("applies highlight for valid index", () => {
      hm.createHighlightOverlay();
      hm.sentences = ["Hello", "World"];
      hm.sentenceRectsCache = [
        [new DOMRect(0, 0, 100, 20)],
        [new DOMRect(0, 30, 100, 20)],
      ];

      hm.updateHighlight(1);
      expect(hm.currentHighlightIndex).toBe(1);

      const overlay = document.getElementById("unmute-highlight-overlay")!;
      expect(overlay.querySelectorAll("div").length).toBe(1);
    });

    it("skips highlight when highlighting is disabled", () => {
      hm.createHighlightOverlay();
      hm.highlightingEnabled = false;
      hm.sentences = ["Hello"];
      hm.sentenceRectsCache = [[new DOMRect(0, 0, 100, 20)]];

      hm.updateHighlight(0);

      const overlay = document.getElementById("unmute-highlight-overlay")!;
      expect(overlay.querySelectorAll("div").length).toBe(0);
    });

    it("auto-scrolls using scrollContainer when present", () => {
      const scroller = document.createElement("div");
      document.body.appendChild(scroller);
      const scrollToSpy = vi.fn();
      scroller.scrollTo = scrollToSpy;
      Object.defineProperty(scroller, "scrollTop", { value: 0, writable: true });
      Object.defineProperty(scroller, "clientHeight", { value: 400, writable: true });

      // Set scrollContainer via the private field using type cast
      (hm as unknown as { scrollContainer: Element | null }).scrollContainer = scroller;
      hm.createHighlightOverlay();
      hm.sentences = ["Hello"];
      // Rect below the scroller's visible area (y=500, height=20 → bottom=520 > 400)
      hm.sentenceRectsCache = [[new DOMRect(0, 500, 100, 20)]];

      hm.updateHighlight(0);

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: expect.any(Number),
        behavior: "smooth",
      });
    });

    it("auto-scrolls using window when no scrollContainer", () => {
      const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
      hm.createHighlightOverlay();
      hm.sentences = ["Hello"];
      // Rect well below window viewport
      hm.sentenceRectsCache = [[new DOMRect(0, 5000, 100, 20)]];

      hm.updateHighlight(0);

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: expect.any(Number),
        behavior: "smooth",
      });
      scrollToSpy.mockRestore();
    });
  });

  describe("findScrollContainer", () => {
    it("returns null when no scrollable ancestor exists", () => {
      const child = document.createElement("div");
      document.body.appendChild(child);

      expect(findScrollContainer(child)).toBeNull();
    });

    it("finds an ancestor with overflow-y: auto and scrollHeight > clientHeight", () => {
      const scroller = document.createElement("div");
      document.body.appendChild(scroller);

      // Mock getComputedStyle to return overflow-y: auto
      const originalGetComputedStyle = window.getComputedStyle;
      vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
        if (el === scroller) {
          return { overflowY: "auto" } as CSSStyleDeclaration;
        }
        return originalGetComputedStyle(el);
      });

      // Make scrollHeight > clientHeight
      Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
      Object.defineProperty(scroller, "clientHeight", { value: 800, configurable: true });

      const child = document.createElement("div");
      scroller.appendChild(child);

      expect(findScrollContainer(child)).toBe(scroller);
      vi.restoreAllMocks();
    });

    it("skips ancestors that are not scrollable", () => {
      const nonScroller = document.createElement("div");
      document.body.appendChild(nonScroller);

      const child = document.createElement("div");
      nonScroller.appendChild(child);

      // nonScroller has default overflow (visible), so it should not be detected
      expect(findScrollContainer(child)).toBeNull();
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
      expect(offset.scrollLeft).toBe(10);
      expect(offset.scrollTop).toBe(50);
      expect(offset.offsetLeft).toBe(20);
      expect(offset.offsetTop).toBe(30);
    });
  });

  describe("scroll container overlay placement", () => {
    it("appends overlay to scrollContainer when one is set", () => {
      const scroller = document.createElement("div");
      document.body.appendChild(scroller);
      (hm as unknown as { scrollContainer: Element | null }).scrollContainer = scroller;

      hm.createHighlightOverlay();

      const overlay = document.getElementById("unmute-highlight-overlay");
      expect(overlay).not.toBeNull();
      expect(overlay!.parentElement).toBe(scroller);
    });

    it("appends overlay to document.documentElement when no scrollContainer", () => {
      hm.createHighlightOverlay();
      const overlay = document.getElementById("unmute-highlight-overlay");
      expect(overlay!.parentElement).toBe(document.documentElement);
    });
  });

  describe("getSentenceIndexAtPoint with scroll container", () => {
    it("converts viewport coords using scroll container offset", () => {
      const scroller = document.createElement("div");
      document.body.appendChild(scroller);
      Object.defineProperty(scroller, "scrollLeft", { value: 0, configurable: true });
      Object.defineProperty(scroller, "scrollTop", { value: 100, configurable: true });
      scroller.getBoundingClientRect = () => new DOMRect(50, 60, 600, 400);

      (hm as unknown as { scrollContainer: Element | null }).scrollContainer = scroller;
      // Sentence rect in content-space: x=10, y=200
      hm.sentenceRectsCache = [[new DOMRect(10, 200, 100, 20)]];

      // Viewport click at (65, 165) → content-space: (65-50+0=15, 165-60+100=205)
      // That falls inside the rect (10..110, 200..220)
      expect(hm.getSentenceIndexAtPoint(65, 165)).toBe(0);
    });

    it("returns -1 for click outside rect with scroll container", () => {
      const scroller = document.createElement("div");
      document.body.appendChild(scroller);
      Object.defineProperty(scroller, "scrollLeft", { value: 0, configurable: true });
      Object.defineProperty(scroller, "scrollTop", { value: 0, configurable: true });
      scroller.getBoundingClientRect = () => new DOMRect(50, 60, 600, 400);

      (hm as unknown as { scrollContainer: Element | null }).scrollContainer = scroller;
      hm.sentenceRectsCache = [[new DOMRect(10, 200, 100, 20)]];

      // Viewport click at (55, 65) → content-space: (55-50+0=5, 65-60+0=5) — outside rect
      expect(hm.getSentenceIndexAtPoint(55, 65)).toBe(-1);
    });
  });

  describe("cleanup with scroll container", () => {
    it("resets scrollContainer to null", () => {
      const scroller = document.createElement("div");
      document.body.appendChild(scroller);
      (hm as unknown as { scrollContainer: Element | null }).scrollContainer = scroller;
      hm.createHighlightOverlay();

      hm.cleanup();
      expect((hm as unknown as { scrollContainer: Element | null }).scrollContainer).toBeNull();
    });
  });
});
