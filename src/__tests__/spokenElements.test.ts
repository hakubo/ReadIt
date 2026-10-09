import { afterEach, describe, expect, it } from "vitest";
import { extractTextFromContainer, getReadableText } from "../content/contentDetection";
import { DEFAULT_READING_OPTIONS, setReadingOptions } from "../content/spokenElements";
import { buildTextIndex, elementBoundedRanges, findSentenceRange, getRangeReadableText } from "../content/textLocator";

function render(html: string): HTMLElement {
  document.body.innerHTML = `<main>${html}</main>`;
  return document.querySelector("main")!;
}

function readable(html: string): string {
  return getReadableText(render(html)).replace(/\s+/g, " ").trim();
}

afterEach(() => {
  setReadingOptions(DEFAULT_READING_OPTIONS);
  document.body.innerHTML = "";
});

describe("images", () => {
  it("reads a large image's alt text as its own sentence", () => {
    const main = render(`<p>Before.</p><img alt="A cat on a sofa" width="400" height="300"><p>After.</p>`);
    expect(getReadableText(main)).toContain("\nImage: A cat on a sofa.\n");
  });

  it("reads a small image inline, skips empty alt and alt that repeats the caption", () => {
    expect(readable(`<p>I <img alt="love" width="16" height="16"> it<img alt="" width="400" height="300"></p>`)).toBe("I love it");
    expect(readable(`<figure><img alt="A dog" width="400" height="300"><figcaption>A dog</figcaption></figure>`)).toBe("A dog");
  });

  it("reads nothing for images when the option is off", () => {
    setReadingOptions({ readAltText: false });
    expect(readable(`<p>Before.</p><img alt="A cat" width="400" height="300">`)).toBe("Before.");
  });

  it("collects an image outside text blocks during extraction", () => {
    const main = render(`<p>Intro text here.</p><figure><img alt="A chart of sales" width="400" height="300"></figure><p>More text.</p>`);
    expect(extractTextFromContainer(main).split("\n")).toEqual(["Intro text here.", "Image: A chart of sales.", "More text."]);
  });
});

describe("other elements read by their meaning", () => {
  it.each([
    [`<p>Due <time datetime="2024-01-15">15/01/24</time>.</p>`, "Due 2024-01-15."],
    [`<p>Posted <time datetime="2024-01-15">3 days ago</time>.</p>`, "Posted 3 days ago."],
    [`<p>Press <kbd><kbd>Ctrl</kbd>+<kbd>C</kbd></kbd> or <kbd>⌘</kbd>.</p>`, "Press Control+C or Command."],
    [`<p>An area of 5 m<sup>2</sup> and 10<sup>6</sup> and x<sup>4</sup>.</p>`, "An area of 5 m squared and 10 to the power of 6 and x to the power of 4."],
    [`<p>As shown<sup>3</sup> on the 1<sup>st</sup> day.</p>`, "As shown on the 1st day."],
    [`<p>Battery <meter value="0.6">60%</meter>, done <progress value="3" max="4"></progress>.</p>`, "Battery 60 percent, done 75 percent."],
    [`<p>So <math alttext="x squared"><mi>x</mi><mn>2</mn></math> holds, and <math><mi>y</mi></math>.</p>`, "So x squared holds, and formula."],
  ])("%s", (html, expected) => {
    expect(readable(html)).toBe(expected);
  });
});

describe("skip options", () => {
  it("skips code blocks and struck-out text by default, keeps inline code", () => {
    expect(readable(`<p>Run <code>npm i</code> first.</p><pre>const a = 1;</pre><p>Was <del>$99</del> <s>$79</s> $49.</p>`))
      .toBe("Run npm i first. Was $49.");
  });

  it("reads them when the options are off", () => {
    setReadingOptions({ skipCode: false, skipStrikethrough: false });
    expect(readable(`<pre>const a = 1;</pre><p>Was <del>$99</del> $49.</p>`)).toBe("const a = 1; Was $99 $49.");
  });

  it("skips a code block during extraction", () => {
    const main = render(`<p>Intro text here.</p><pre>const a = 1;</pre><p>More text.</p>`);
    expect(extractTextFromContainer(main)).toBe("Intro text here.\nMore text.");
  });
});

describe("highlighting spoken elements", () => {
  it("finds a sentence that is an image's alt text and covers the image", () => {
    const main = render(`<p>Before.</p><img alt="A cat" width="400" height="300"><p>After.</p>`);
    const index = buildTextIndex(main, { skipNoise: true });
    const match = findSentenceRange(index, "Image: A cat.", 0)!;
    expect(match).not.toBeNull();
    expect(elementBoundedRanges.has(match.range)).toBe(true);
    expect(match.range.intersectsNode(main.querySelector("img")!)).toBe(true);
  });

  it("finds a sentence running through a spoken element", () => {
    const main = render(`<p>Press <kbd>Ctrl</kbd> now.</p>`);
    const index = buildTextIndex(main, { skipNoise: true });
    const match = findSentenceRange(index, "Press Control now.", 0)!;
    expect(match.range.startContainer.nodeType).toBe(Node.TEXT_NODE);
    expect(match.range.toString()).toBe("Press Ctrl now.");
  });

  it("includes a selected spoken element in the selection text", () => {
    const main = render(`<p>Press <kbd>Ctrl</kbd> now.</p>`);
    const range = document.createRange();
    range.selectNodeContents(main.querySelector("p")!);
    expect(getRangeReadableText(range)).toBe("Press Control now.");
  });
});
