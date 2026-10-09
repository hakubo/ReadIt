import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildTextIndex,
  findSentenceRange,
  getRangeReadableText,
  positionAt,
  textIndexAtBoundary,
} from "../content/textLocator";
import { extractTextFromContainer, getReadableText } from "../content/contentDetection";
import { splitIntoSentences } from "../content/textProcessing";
import { stubCheckVisibility } from "./highlightTestUtils";

const MENTION_STYLE = `<style>span[data-type="mention"] { padding: 2px; }</style>`;

describe("textLocator", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("matches a sentence across <style> elements between mentions", () => {
    document.body.innerHTML = `
      <p><strong>Release labels:</strong><span> </span>${MENTION_STYLE}<span>@Andrew Yates</span><span> </span>${MENTION_STYLE}<span>@Joe Birch</span><span> for visibility)</span></p>
    `;
    const index = buildTextIndex(document.body, { skipNoise: true });
    const match = findSentenceRange(index, "Release labels: @Andrew Yates @Joe Birch for visibility)", 0);
    expect(match).not.toBeNull();
    expect(match!.range.toString()).toContain("Release labels:");
    expect(match!.range.toString()).toContain("for visibility)");
    // The range spans the <style> node in the DOM, but the searchable text excludes it
    expect(index.text).not.toContain("padding");
  });

  it("collapses whitespace differences between the sentence and the DOM", () => {
    document.body.innerHTML = `<p>Hello,\n      <em>wide</em>   world.</p>`;
    const index = buildTextIndex(document.body, { skipNoise: true });
    const match = findSentenceRange(index, "Hello, wide world.", 0);
    expect(match!.range.toString()).toBe("Hello,\n      wide   world.");
  });

  it("searches forward from the previous match so repeated sentences map in order", () => {
    document.body.innerHTML = `<p id="a">Same text.</p><p id="b">Same text.</p>`;
    const index = buildTextIndex(document.body, { skipNoise: true });
    const first = findSentenceRange(index, "Same text.", 0)!;
    const second = findSentenceRange(index, "Same text.", first.endIndex)!;
    expect(first.range.startContainer.parentElement!.id).toBe("a");
    expect(second.range.startContainer.parentElement!.id).toBe("b");
  });

  it("skips noise subtrees only when asked", () => {
    document.body.innerHTML = `<nav><p>Menu item text.</p></nav>`;
    expect(findSentenceRange(buildTextIndex(document.body, { skipNoise: true }), "Menu item text.", 0)).toBeNull();
    expect(findSentenceRange(buildTextIndex(document.body, { skipNoise: false }), "Menu item text.", 0)).not.toBeNull();
  });

  it("returns null for text not on the page", () => {
    document.body.innerHTML = `<p>Something else.</p>`;
    expect(findSentenceRange(buildTextIndex(document.body, { skipNoise: true }), "Missing.", 0)).toBeNull();
  });
});

describe("shared readable-text filter (spoken text == indexed text)", () => {
  let restoreVisibility: () => void;

  beforeEach(() => {
    document.body.innerHTML = "";
    restoreVisibility = stubCheckVisibility();
  });

  afterEach(() => {
    restoreVisibility();
  });

  /** Every sentence spoken from `root` must be found, in order, in the highlight index of `root`. */
  function expectEverySpokenSentenceFound(root: Element): string[] {
    const sentences = splitIntoSentences(extractTextFromContainer(root));
    const index = buildTextIndex(root, { skipNoise: true });
    let from = 0;
    for (const sentence of sentences) {
      const match = findSentenceRange(index, sentence, from);
      expect(match, `"${sentence}" not found`).not.toBeNull();
      from = match!.endIndex;
    }
    return sentences;
  }

  it("walks into display:contents subtrees", () => {
    document.body.innerHTML = `<main id="root"><div style="display: contents"><p>Inside contents.</p></div></main>`;
    const root = document.getElementById("root")!;
    expect(getReadableText(root)).toContain("Inside contents.");
    expect(buildTextIndex(root, { skipNoise: true }).text).toBe("Inside contents.");
  });

  it("skips hidden, [hidden], aria-hidden and collapsed <details> text in both", () => {
    document.body.innerHTML = `
      <main id="root">
        <p>Visible one.<span style="display: none"> Hidden span.</span></p>
        <p hidden>Hidden attribute.</p>
        <p>Next <span aria-hidden="true">decor</span>sentence.</p>
        <details><summary>Summary text.</summary><p>Collapsed body.</p></details>
      </main>`;
    const root = document.getElementById("root")!;
    const spoken = getReadableText(root);
    const indexed = buildTextIndex(root, { skipNoise: true }).text;
    for (const hidden of ["Hidden span", "Hidden attribute", "decor", "Collapsed body"]) {
      expect(spoken).not.toContain(hidden);
      expect(indexed).not.toContain(hidden);
    }
    expect(expectEverySpokenSentenceFound(root)).toEqual(["Visible one.", "Next sentence.", "Summary text."]);
  });

  it("still reads a long aria-hidden subtree (modal libraries hide the whole app)", () => {
    const long = "This paragraph is long enough that it is clearly real content and not an icon or a label. ".repeat(2);
    document.body.innerHTML = `<div id="root"><div aria-hidden="true"><p>${long}</p></div></div>`;
    expect(getReadableText(document.getElementById("root")!)).toContain("clearly real content");
  });

  it("skips icon ligatures and footnote markers", () => {
    document.body.innerHTML = `
      <main id="root"><p>Read more<span class="material-icons">arrow_forward</span> here.<sup class="reference"><a href="#cite-1">[1]</a></sup> Next<sup><a href="#fn2">2</a></sup> one.</p></main>`;
    const root = document.getElementById("root")!;
    expect(getReadableText(root).trim()).toBe("Read more here. Next one.");
    expectEverySpokenSentenceFound(root);
  });

  it("separates <br> lines and block siblings instead of gluing words", () => {
    document.body.innerHTML = `<div id="root"><div>Line one<br>line two</div><div>ends.</div><div>Para two</div></div>`;
    const root = document.getElementById("root")!;
    expect(getReadableText(root).trim().split(/\n+/)).toEqual(["Line one", "line two", "ends.", "Para two"]);
    expect(buildTextIndex(root, { skipNoise: true }).text).toBe("Line one line two ends. Para two");
    expectEverySpokenSentenceFound(root);
  });
});

describe("TextIndex run map", () => {
  it("maps collapsed whitespace back to the right DOM offsets", () => {
    document.body.innerHTML = `<p id="p">A   b\n\n c. <b>Bold</b>   tail.</p>`;
    const index = buildTextIndex(document.getElementById("p")!, { skipNoise: true });
    expect(index.text).toBe("A b c. Bold tail.");
    const match = findSentenceRange(index, "b c. Bold tail.", 0)!;
    expect(match.range.toString()).toBe("b\n\n c. Bold   tail.");
  });

  it("stores one run per node and whitespace gap, not one entry per character", () => {
    const words = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(" ");
    document.body.innerHTML = `<p id="p">${words}</p>`;
    const index = buildTextIndex(document.getElementById("p")!, { skipNoise: true });
    expect(index.runStarts.length).toBe(1);
    expect(positionAt(index, index.text.indexOf("word1999")).offset).toBe(words.indexOf("word1999"));
  });

  it("finds the text index at a DOM boundary", () => {
    document.body.innerHTML = `<p id="p">One. <em>Two.</em>  Three.</p>`;
    const paragraph = document.getElementById("p")!;
    const index = buildTextIndex(paragraph, { skipNoise: true });
    const boundary = document.createRange();
    boundary.setStart(paragraph.querySelector("em")!.firstChild!, 0);
    boundary.collapse(true);
    expect(index.text.slice(textIndexAtBoundary(index, boundary))).toBe("Two. Three.");
  });
});

describe("getRangeReadableText", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("builds selected text from DOM text with the shared filter", () => {
    document.body.innerHTML = `
      <table id="t"><tr><td>Cell one.</td><td>Cell <style>.x{}</style>two.</td></tr></table>`;
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("t")!);
    expect(getRangeReadableText(range).split(/\n+/)).toEqual(["Cell one.", "Cell two."]);
  });

  it("clips partially selected text nodes and keeps sentences findable", () => {
    document.body.innerHTML = `<p id="p">Before text. Selected part one. Selected part two. After.</p>`;
    const textNode = document.getElementById("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, "Before text. ".length);
    range.setEnd(textNode, "Before text. Selected part one. Selected part two.".length);
    const text = getRangeReadableText(range);
    expect(text).toBe("Selected part one. Selected part two.");

    const index = buildTextIndex(document.getElementById("p")!, { skipNoise: true });
    for (const sentence of splitIntoSentences(text)) {
      expect(findSentenceRange(index, sentence, 0)).not.toBeNull();
    }
  });

  it("collapses source newlines inside text so a sentence isn't split mid-way", () => {
    document.body.innerHTML = `<p id="p">A sentence wrapped
      across source lines.</p>`;
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("p")!);
    expect(splitIntoSentences(getRangeReadableText(range))).toEqual(["A sentence wrapped across source lines."]);
  });
});
