import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ElementPicker } from "../content/elementPicker";

// jsdom rejects cssText containing `background: rgba(...)` with decimals,
// so we can't inspect style properties. Instead, tests verify DOM structure:
// overlays are appended to the correct parent and removed on cleanup.

/** Count direct div children of a parent, excluding specific elements. */
function countDivChildren(parent: Element, exclude: Element[] = []): number {
  return Array.from(parent.querySelectorAll<HTMLDivElement>(":scope > div"))
    .filter(el => !exclude.includes(el)).length;
}

describe("ElementPicker", () => {
  let picker: ElementPicker;

  beforeEach(() => {
    document.body.innerHTML = "";
    picker = new ElementPicker();
  });

  afterEach(() => {
    picker.stop();
    vi.restoreAllMocks();
  });

  function makeScrollContainer(): HTMLDivElement {
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
    Object.defineProperty(scroller, "scrollLeft", { value: 0, configurable: true });
    Object.defineProperty(scroller, "scrollTop", { value: 100, configurable: true });
    scroller.getBoundingClientRect = () => new DOMRect(0, 50, 800, 600);
    return scroller;
  }

  describe("showSelectorPreview with scroll container", () => {
    it("appends preview overlay inside scroll container, not document.documentElement", () => {
      const scroller = makeScrollContainer();
      const target = document.createElement("div");
      target.id = "target";
      scroller.appendChild(target);
      target.getBoundingClientRect = () => new DOMRect(10, 200, 300, 40);

      const beforeScroller = countDivChildren(scroller, [target]);
      const beforeHtml = countDivChildren(document.documentElement, [document.body]);

      picker.showSelectorPreview("#target");

      const afterScroller = countDivChildren(scroller, [target]);
      const afterHtml = countDivChildren(document.documentElement, [document.body]);

      // Overlay was appended to scroller, not documentElement
      expect(afterScroller - beforeScroller).toBe(1);
      expect(afterHtml - beforeHtml).toBe(0);
    });

    it("appends preview to document.documentElement when no scroll container", () => {
      const target = document.createElement("div");
      target.id = "fallback-target";
      document.body.appendChild(target);
      target.getBoundingClientRect = () => new DOMRect(10, 20, 300, 40);

      const before = countDivChildren(document.documentElement, [document.body]);

      picker.showSelectorPreview("#fallback-target");

      const after = countDivChildren(document.documentElement, [document.body]);
      expect(after - before).toBe(1);
    });

    it("places extra highlights (duplicates) inside scroll container", () => {
      const scroller = document.createElement("div");
      document.body.appendChild(scroller);
      const originalGCS = window.getComputedStyle;
      vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
        if (el === scroller) {
          return { overflowY: "scroll" } as CSSStyleDeclaration;
        }
        return originalGCS(el);
      });
      Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
      Object.defineProperty(scroller, "clientHeight", { value: 800, configurable: true });
      Object.defineProperty(scroller, "scrollLeft", { value: 0, configurable: true });
      Object.defineProperty(scroller, "scrollTop", { value: 0, configurable: true });
      scroller.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);

      const t1 = document.createElement("div");
      t1.className = "dup";
      scroller.appendChild(t1);
      const t2 = document.createElement("div");
      t2.className = "dup";
      scroller.appendChild(t2);
      t1.getBoundingClientRect = () => new DOMRect(10, 100, 200, 30);
      t2.getBoundingClientRect = () => new DOMRect(10, 200, 200, 30);

      picker.showSelectorPreview("div.dup");

      // Extra highlight (for duplicate match) should be in scroller
      const extras = scroller.querySelectorAll(".selector-preview-extra");
      expect(extras.length).toBe(1);
    });
  });

  describe("showNoisePreview with scroll container", () => {
    it("appends content area and noise highlights inside scroll container", () => {
      const scroller = makeScrollContainer();

      const content = document.createElement("article");
      scroller.appendChild(content);
      const noiseEl = document.createElement("nav");
      content.appendChild(noiseEl);

      content.getBoundingClientRect = () => new DOMRect(10, 10, 780, 500);
      noiseEl.getBoundingClientRect = () => new DOMRect(20, 400, 200, 30);

      const beforeScroller = countDivChildren(scroller, [content]);
      const beforeHtml = countDivChildren(document.documentElement, [document.body]);

      picker.showNoisePreview("nav", "article");

      const afterScroller = countDivChildren(scroller, [content]);
      const afterHtml = countDivChildren(document.documentElement, [document.body]);

      // Content area highlight + noise element highlight = 2 new children in scroller
      expect(afterScroller - beforeScroller).toBe(2);
      // Nothing added to documentElement
      expect(afterHtml - beforeHtml).toBe(0);
    });

    it("appends overlays to document.documentElement when no scroll container", () => {
      const content = document.createElement("article");
      document.body.appendChild(content);
      const noiseEl = document.createElement("nav");
      content.appendChild(noiseEl);

      content.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
      noiseEl.getBoundingClientRect = () => new DOMRect(10, 10, 100, 30);

      const before = countDivChildren(document.documentElement, [document.body]);

      picker.showNoisePreview("nav", "article");

      const after = countDivChildren(document.documentElement, [document.body]);
      expect(after - before).toBeGreaterThanOrEqual(1);
    });
  });

  describe("hideSelectorPreview", () => {
    it("removes preview elements from DOM", () => {
      const target = document.createElement("div");
      target.id = "preview-target";
      document.body.appendChild(target);
      target.getBoundingClientRect = () => new DOMRect(0, 0, 100, 20);

      const before = countDivChildren(document.documentElement, [document.body]);
      picker.showSelectorPreview("#preview-target");
      expect(countDivChildren(document.documentElement, [document.body])).toBeGreaterThan(before);

      picker.hideSelectorPreview();
      expect(countDivChildren(document.documentElement, [document.body])).toBe(before);
    });
  });

  describe("picked selectors", () => {
    /** Run the picker and click `target`; returns the selector it reports. */
    function pick(target: Element, purpose: "content" | "noise" = "content"): string | null {
      let picked: string | null = null;
      document.elementFromPoint = () => target;
      picker.start((selector) => { picked = selector; }, () => {}, purpose);
      const overlay = (picker as unknown as { overlay: HTMLDivElement }).overlay;
      overlay.dispatchEvent(new MouseEvent("click", { clientX: 1, clientY: 1, bubbles: true }));
      return picked;
    }

    function expectUniqueMatch(selector: string | null, target: Element) {
      expect(selector).not.toBeNull();
      const matches = document.querySelectorAll(selector!);
      expect(matches.length).toBe(1);
      expect(matches[0]).toBe(target);
    }

    it("escapes ids instead of producing an invalid selector", () => {
      document.body.innerHTML = `<div><section id="main-content"><p>Text</p></section></div>`;
      const target = document.getElementById("main-content")!;
      expect(pick(target)).toBe("#main-content");
    });

    it.each([":r1:", "ember123", "123", "radix-:R2:"])("skips generated id %s", (id) => {
      document.body.innerHTML = `<div class="page"><div class="body-text">Text</div><div class="body-text">Other</div></div>`;
      const target = document.querySelector(".body-text")!;
      target.id = id;
      const selector = pick(target);
      expect(selector).not.toContain(id);
      expectUniqueMatch(selector, target);
    });

    it("never returns a bare tag for a noise selector", () => {
      document.body.innerHTML = `<div><section><p>Promo text</p></section><p>Body</p></div>`;
      const target = document.querySelector("section")!;
      const selector = pick(target, "noise");
      expect(selector).not.toBe("section");
      expectUniqueMatch(selector, target);
    });

    it("still accepts a unique semantic tag as the content area", () => {
      document.body.innerHTML = `<div><section><p>Story text</p></section></div>`;
      expect(pick(document.querySelector("section")!)).toBe("section");
    });

    it("falls back to a unique path when tag, class and parent don't identify the element", () => {
      document.body.innerHTML = `<div><div><span>a</span><span>b</span></div><div><span>c</span><span>d</span></div></div>`;
      const target = document.querySelectorAll("span")[3];
      expectUniqueMatch(pick(target, "noise"), target);
    });
  });

  describe("countNoiseMatches", () => {
    it("detects the content area once for many selectors in the same task", async () => {
      document.body.innerHTML = `<main><nav>Menu</nav><p>${"Readable words here. ".repeat(10)}</p><aside>Side</aside></main>`;
      const querySpy = vi.spyOn(document, "querySelectorAll");
      const detectionCalls = () => querySpy.mock.calls.filter(([selector]) => selector === "main, [role='main']").length;

      expect(picker.countNoiseMatches("nav")).toBe(1);
      expect(picker.countNoiseMatches("aside")).toBe(1);
      expect(picker.countNoiseMatches(".missing")).toBe(0);
      expect(detectionCalls()).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 0));
      picker.countNoiseMatches("nav");
      expect(detectionCalls()).toBe(2);
    });

    it("returns 0 for an invalid selector", () => {
      document.body.innerHTML = `<main><p>${"Readable words here. ".repeat(10)}</p></main>`;
      expect(picker.countNoiseMatches("a[")).toBe(0);
    });
  });

  describe("hideNoisePreview", () => {
    it("removes content area and noise highlights from DOM", () => {
      const content = document.createElement("article");
      document.body.appendChild(content);
      const noiseEl = document.createElement("nav");
      content.appendChild(noiseEl);

      content.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
      noiseEl.getBoundingClientRect = () => new DOMRect(10, 10, 100, 30);

      const before = countDivChildren(document.documentElement, [document.body]);
      picker.showNoisePreview("nav", "article");
      expect(countDivChildren(document.documentElement, [document.body])).toBeGreaterThan(before);

      picker.hideNoisePreview();
      expect(countDivChildren(document.documentElement, [document.body])).toBe(before);
    });
  });
});
