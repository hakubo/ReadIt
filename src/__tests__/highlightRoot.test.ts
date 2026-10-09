import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HighlightManager, getEffectiveBackgroundColor, clearBackgroundColorCache } from "../content/highlighting";
import { detectMainContentWithRoot, detectMainContent } from "../content/contentDetection";
import { findBlockAncestor } from "../content/textLocator";
import { stubRangeRects } from "./highlightTestUtils";

const LONG_PARAGRAPH = "This article paragraph has plenty of words so content detection accepts it as the main text of the page.";

describe("detectMainContentWithRoot", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns the saved contentSelector element as root", () => {
    document.body.innerHTML = `<div id="custom"><p>${LONG_PARAGRAPH}</p></div>`;
    const result = detectMainContentWithRoot("#custom");
    expect(result?.root).toBe(document.getElementById("custom"));
    expect(result?.text).toContain("main text");
  });

  it("returns the detected content element as root", () => {
    document.body.innerHTML = `<nav>Menu</nav><main id="main"><p>${LONG_PARAGRAPH}</p></main>`;
    expect(detectMainContentWithRoot()?.root).toBe(document.getElementById("main"));
  });

  it("returns a null root for the <p> fallback", () => {
    document.body.innerHTML = `<p>Short but long enough paragraph one.</p>`;
    const result = detectMainContentWithRoot();
    expect(result?.root).toBeNull();
    expect(result?.text).toBe("Short but long enough paragraph one.");
  });

  it("detectMainContent still returns only the text", () => {
    document.body.innerHTML = `<main><p>${LONG_PARAGRAPH}</p></main>`;
    expect(detectMainContent()).toBe(detectMainContentWithRoot()?.text);
  });
});

describe("findBlockAncestor", () => {
  it("skips inline ancestors of a text node", () => {
    document.body.innerHTML = `<div><p id="para">Hello <strong><em id="em">world</em></strong></p></div>`;
    const textNode = document.getElementById("em")!.firstChild!;
    expect(findBlockAncestor(textNode)).toBe(document.getElementById("para"));
  });

  it("returns a block element itself", () => {
    document.body.innerHTML = `<section id="section"><p>One</p><p>Two</p></section>`;
    const section = document.getElementById("section")!;
    expect(findBlockAncestor(section)).toBe(section);
  });

  it("returns body when only inline elements sit below it", () => {
    document.body.innerHTML = `<span id="span">text</span>`;
    expect(findBlockAncestor(document.getElementById("span")!)).toBe(document.body);
  });
});

describe("HighlightManager sentence location", () => {
  let manager: HighlightManager;
  let restoreRangeRects: () => void;

  /** data-top of the element holding the start of sentence `index`'s highlighted Range. */
  function highlightedTop(index: number): number {
    manager.applyHighlightForSentence(index);
    const range = manager.painter.currentRange!;
    return Number(range.startContainer.parentElement?.closest("[data-top]")?.getAttribute("data-top"));
  }

  beforeEach(() => {
    document.body.innerHTML = "";
    manager = new HighlightManager();
    restoreRangeRects = stubRangeRects();
  });

  afterEach(() => {
    manager.cleanup();
    restoreRangeRects();
    window.getSelection()?.removeAllRanges();
    vi.useRealTimers();
  });

  it("searches only the content root when one is set", () => {
    document.body.innerHTML = `
      <div data-top="10"><p>Shared sentence.</p></div>
      <article id="root" data-top="500"><p>Shared sentence.</p></article>
    `;
    manager.contentRoot = document.getElementById("root");
    manager.sentences = ["Shared sentence."];
    manager.locateAllSentences();
    expect(highlightedTop(0)).toBe(500);
  });

  it("falls back to the body when a sentence is not in the root", () => {
    document.body.innerHTML = `
      <div data-top="10"><p>Only outside.</p></div>
      <article id="root" data-top="500"><p>Inside.</p></article>
    `;
    manager.contentRoot = document.getElementById("root");
    manager.sentences = ["Inside.", "Only outside."];
    manager.locateAllSentences();
    expect(highlightedTop(0)).toBe(500);
    expect(highlightedTop(1)).toBe(10);
  });

  it("uses the body when the content root was removed from the page", () => {
    document.body.innerHTML = `<div data-top="10"><p>Hello there.</p></div>`;
    manager.contentRoot = document.createElement("article");
    manager.sentences = ["Hello there."];
    manager.locateAllSentences();
    expect(manager.contentRoot).toBeNull();
    expect(highlightedTop(0)).toBe(10);
  });

  it("locates sentence 0 on demand before the deferred precompute runs", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div data-top="40"><p>First one. Second one.</p></div>`;
    manager.sentences = ["First one.", "Second one."];
    manager.createHighlightOverlay();
    manager.resetSentenceRects();
    manager.schedulePrecompute();
    expect(manager.locatedSentenceCount).toBe(0);

    manager.updateHighlight(0);

    expect(manager.locatedSentenceCount).toBe(1);
    expect(manager.painter.currentRange).not.toBeNull();
  });

  it("locates the remaining sentences in deferred chunks", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div data-top="40"><p>One. Two. Three.</p></div>`;
    manager.sentences = ["One.", "Two.", "Three."];
    manager.resetSentenceRects();
    manager.schedulePrecompute();
    vi.runAllTimers();
    expect(manager.locatedSentenceCount).toBe(3);
  });

  it("cancels deferred work on cleanup", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div data-top="40"><p>One. Two.</p></div>`;
    manager.sentences = ["One.", "Two."];
    manager.resetSentenceRects();
    manager.schedulePrecompute();
    manager.cleanup();
    vi.runAllTimers();
    expect(manager.locatedSentenceCount).toBe(0);
  });

  it("never rewinds the search when a sentence only matches an earlier copy", () => {
    document.body.innerHTML = `<p id="para">Alpha. Beta. Gamma. Beta.</p>`;
    // "Alpha." is only found by searching from the start again; the last
    // "Beta." must still map to the second copy, not the first.
    manager.sentences = ["Beta.", "Gamma.", "Alpha.", "Beta."];
    manager.locateAllSentences();
    manager.applyHighlightForSentence(3);
    const range = manager.painter.currentRange!;
    expect(range.startOffset).toBe("Alpha. Beta. Gamma. ".length);
  });

  it("starts the search at the user's selection", () => {
    document.body.innerHTML = `<p id="para">Same text. Middle. Same text. End.</p>`;
    const textNode = document.getElementById("para")!.firstChild!;
    const selected = document.createRange();
    selected.setStart(textNode, "Same text. Middle. ".length);
    selected.setEnd(textNode, textNode.textContent!.length);
    window.getSelection()!.addRange(selected);

    manager.contentRoot = document.getElementById("para");
    manager.sentences = ["Same text.", "End."];
    manager.resetSentenceRects();
    manager.applyHighlightForSentence(0);

    const range = manager.painter.currentRange!;
    expect(range.startOffset).toBe("Same text. Middle. ".length);
    // The selection is cleared so its colour doesn't cover the highlight
    expect(window.getSelection()!.rangeCount).toBe(0);
  });

  it("re-locates from a re-rendered sentence, keeping order after the previous one", () => {
    document.body.innerHTML = `<div id="root"><p>Repeat.</p><p id="second">Repeat.</p></div>`;
    manager.contentRoot = document.getElementById("root");
    manager.sentences = ["Repeat.", "Repeat."];
    manager.locateAllSentences();

    // Re-render the second paragraph's text
    document.getElementById("second")!.textContent = "Repeat.";

    manager.applyHighlightForSentence(1);
    const range = manager.painter.currentRange!;
    expect(range.startContainer.parentElement?.id).toBe("second");
  });
});


describe("getEffectiveBackgroundColor cache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearBackgroundColorCache();
  });

  it("walks ancestors once per element until the cache is cleared", () => {
    document.body.innerHTML = `<div style="background-color: rgb(0, 0, 0)"><p id="para">Text</p></div>`;
    const paragraph = document.getElementById("para")!;
    const styleSpy = vi.spyOn(window, "getComputedStyle");

    const first = getEffectiveBackgroundColor(paragraph);
    const callsAfterFirst = styleSpy.mock.calls.length;
    const second = getEffectiveBackgroundColor(paragraph);

    expect(second).toEqual(first);
    expect(first).toEqual({ r: 0, g: 0, b: 0 });
    expect(styleSpy.mock.calls.length).toBe(callsAfterFirst);

    clearBackgroundColorCache();
    getEffectiveBackgroundColor(paragraph);
    expect(styleSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("is cleared at the start of each precompute", () => {
    document.body.innerHTML = `<div id="box" style="background-color: rgb(0, 0, 0)"><p id="para">Text</p></div>`;
    const paragraph = document.getElementById("para")!;
    expect(getEffectiveBackgroundColor(paragraph)).toEqual({ r: 0, g: 0, b: 0 });

    document.getElementById("box")!.style.backgroundColor = "rgb(255, 0, 0)";
    new HighlightManager().locateAllSentences();
    expect(getEffectiveBackgroundColor(paragraph)).toEqual({ r: 255, g: 0, b: 0 });
  });
});
