import { describe, it, expect, beforeEach } from "vitest";
import {
  hasNoiseAncestor,
  extractTextFromContainer,
  detectMainContent,
} from "../content/contentDetection";

describe("hasNoiseAncestor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns false when element has no noise ancestor", () => {
    document.body.innerHTML = `
      <div id="boundary">
        <p id="target">Hello</p>
      </div>
    `;
    const boundary = document.getElementById("boundary")!;
    const target = document.getElementById("target")!;
    expect(hasNoiseAncestor(target, boundary)).toBe(false);
  });

  it("returns true when element is inside a nav", () => {
    document.body.innerHTML = `
      <div id="boundary">
        <nav>
          <p id="target">Hello</p>
        </nav>
      </div>
    `;
    const boundary = document.getElementById("boundary")!;
    const target = document.getElementById("target")!;
    expect(hasNoiseAncestor(target, boundary)).toBe(true);
  });

  it.each(["nav", "footer", "header", "aside"])(
    "returns true for element inside <%s>",
    (tag) => {
      document.body.innerHTML = `
        <div id="boundary">
          <${tag}><p id="target">Hello</p></${tag}>
        </div>
      `;
      const boundary = document.getElementById("boundary")!;
      const target = document.getElementById("target")!;
      expect(hasNoiseAncestor(target, boundary)).toBe(true);
    },
  );

  it("stops at boundary and does not walk past it", () => {
    document.body.innerHTML = `
      <nav>
        <div id="boundary">
          <p id="target">Hello</p>
        </div>
      </nav>
    `;
    const boundary = document.getElementById("boundary")!;
    const target = document.getElementById("target")!;
    expect(hasNoiseAncestor(target, boundary)).toBe(false);
  });
});

describe("extractTextFromContainer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("extracts text from paragraphs", () => {
    document.body.innerHTML = `
      <div id="container">
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    expect(text).toBe("First paragraph.\nSecond paragraph.");
  });

  it("skips noise elements", () => {
    document.body.innerHTML = `
      <div id="container">
        <p>Main content.</p>
        <nav><p>Nav link text</p></nav>
        <p>More content.</p>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    expect(text).toBe("Main content.\nMore content.");
  });

  it("extracts text from multiple block types", () => {
    document.body.innerHTML = `
      <div id="container">
        <h1>Title</h1>
        <p>Paragraph</p>
        <li>List item</li>
        <blockquote>Quote</blockquote>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    expect(text).toContain("Title");
    expect(text).toContain("Paragraph");
    expect(text).toContain("List item");
    expect(text).toContain("Quote");
  });

  it("extracts text from inline-only containers via fallback", () => {
    document.body.innerHTML = `<div id="container"><span>Inline only</span></div>`;
    const container = document.getElementById("container")!;
    expect(extractTextFromContainer(container)).toBe("Inline only");
  });

  it("falls back to direct children when block selectors miss most text (Notion-like DOM)", () => {
    // Notion wraps text in nested divs, not <p> tags
    document.body.innerHTML = `
      <div id="container">
        <div class="text-block"><div><div>First paragraph of content here.</div></div></div>
        <div class="text-block"><div><div>Second paragraph with more text.</div></div></div>
        <div class="text-block"><div><div>Third paragraph to read aloud.</div></div></div>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    expect(text).toContain("First paragraph of content here.");
    expect(text).toContain("Second paragraph with more text.");
    expect(text).toContain("Third paragraph to read aloud.");
  });

  it("drills through wrapper divs to find content container", () => {
    // Simulates Notion's <main> → wrapper → wrapper → .page-content structure
    document.body.innerHTML = `
      <div id="outer-wrapper">
        <div class="inner-wrapper">
          <div class="page-content">
            <div>Block one text content.</div>
            <div>Block two text content.</div>
            <div>Block three text content.</div>
          </div>
        </div>
      </div>
    `;
    const container = document.getElementById("outer-wrapper")!;
    const text = extractTextFromContainer(container);
    expect(text).toBe(
      "Block one text content.\nBlock two text content.\nBlock three text content."
    );
  });

  it("stops drilling when children split text evenly", () => {
    // No single child dominates — should collect from this level
    document.body.innerHTML = `
      <div id="container">
        <div>Alpha block text here.</div>
        <div>Bravo block text here.</div>
        <div>Charlie block text here.</div>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    expect(text).toBe(
      "Alpha block text here.\nBravo block text here.\nCharlie block text here."
    );
  });

  it("prefers block selectors when they capture most text", () => {
    document.body.innerHTML = `
      <div id="container">
        <p>This paragraph has all the important content that we want to read.</p>
        <p>And this second paragraph completes the article nicely.</p>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    // Should use block selector path, result is newline-joined paragraphs
    expect(text).toBe(
      "This paragraph has all the important content that we want to read.\n" +
      "And this second paragraph completes the article nicely."
    );
  });

  it("skips noise children in fallback path", () => {
    document.body.innerHTML = `
      <div id="container">
        <div>Actual content to read aloud.</div>
        <nav><div>Navigation link text here.</div></nav>
        <div>More actual content here.</div>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    expect(text).toContain("Actual content to read aloud.");
    expect(text).toContain("More actual content here.");
    expect(text).not.toContain("Navigation link text");
  });

  it("handles mixed block and non-block content with headers only matching", () => {
    // Headers match BLOCK_SELECTOR but body text is in divs — simulates Notion
    document.body.innerHTML = `
      <div id="container">
        <div class="header-block"><h2>Section Title</h2></div>
        <div class="text-block"><div><div>Body text that is much longer than the header and makes up most of the content on this page.</div></div></div>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    // Block selectors only find "Section Title" (13 chars), way under 50% of total
    // Fallback should get both header and body
    expect(text).toContain("Section Title");
    expect(text).toContain("Body text that is much longer");
  });

  it("preserves non-breaking spaces in extracted text", () => {
    document.body.innerHTML = `
      <div id="container">
        <p>Hello\u00a0world and\u00a0goodbye.</p>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    expect(text).toContain("\u00a0");
    expect(text).toBe("Hello\u00a0world and\u00a0goodbye.");
  });

  it("preserves non-breaking spaces in Notion-like div structure", () => {
    document.body.innerHTML = `
      <div id="container">
        <div>First\u00a0paragraph with\u00a0special spaces.</div>
        <div>Second\u00a0paragraph here.</div>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    expect(text).toContain("First\u00a0paragraph");
    expect(text).toContain("Second\u00a0paragraph");
  });

  it("collapses regular whitespace but preserves non-breaking spaces", () => {
    document.body.innerHTML = `
      <div id="container">
        <p>Multiple   regular   spaces\u00a0and non-breaking.</p>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    // Regular spaces should be collapsed to single space
    expect(text).not.toContain("   ");
    // Non-breaking space should be preserved
    expect(text).toContain("\u00a0");
  });

  it("preserves narrow no-break space (U+202F) and other Unicode whitespace", () => {
    document.body.innerHTML = `
      <div id="container">
        <p>Value: 100\u202F% done.</p>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    expect(text).toContain("\u202f");
  });

  it("separates paragraphs inside a blockquote with div-based content (Notion)", () => {
    // Notion wraps blockquote paragraphs in divs, not <p> tags.
    // Each paragraph must be a separate line so sentence splitting
    // keeps them apart and window.find() can locate each one.
    document.body.innerHTML = `
      <div id="container">
        <blockquote>
          <div class="inner">
            <div class="text-block"><div><div>First paragraph here.</div></div></div>
            <div class="text-block"><div><div>Second paragraph here.</div></div></div>
            <div class="text-block"><div><div>Third paragraph here.</div></div></div>
          </div>
        </blockquote>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    // Paragraphs must be separated by newlines, NOT merged into one line
    expect(text).toContain("First paragraph here.\nSecond paragraph here.");
    expect(text.split("\n").length).toBeGreaterThanOrEqual(3);
  });

  it("separates colon-ending line from bullet content in blockquote", () => {
    // Reproduces the exact Notion blockquote issue: a line ending with ":"
    // followed by bullet items, all inside a <blockquote> with divs.
    document.body.innerHTML = `
      <div id="container">
        <blockquote>
          <div class="inner">
            <div class="para"><div><div>There are a few things that help:</div></div></div>
            <div class="bullet"><div><div>Check out the Q&amp;A document</div></div></div>
            <div class="bullet"><div><div>Try the product yourself</div></div></div>
            <div class="para"><div><div>See you soon!</div></div></div>
          </div>
        </blockquote>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    const lines = text.split("\n");
    // The colon line must NOT be merged with the bullet text
    expect(lines.some(l => l.endsWith("help:"))).toBe(true);
    expect(lines).toContain("See you soon!");
  });

  it("handles blockquote with single wrapper div around paragraphs", () => {
    // Notion blockquote: <blockquote> → single border-div → paragraph divs
    document.body.innerHTML = `
      <div id="container">
        <blockquote>
          <div style="border-left: 3px solid">
            <div>Paragraph one content.</div>
            <div>Paragraph two content.</div>
          </div>
        </blockquote>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    expect(text).toContain("Paragraph one content.\nParagraph two content.");
  });

  it("still works with simple blockquotes without nested divs", () => {
    document.body.innerHTML = `
      <div id="container">
        <blockquote>Just a simple quote.</blockquote>
      </div>
    `;
    const container = document.getElementById("container")!;
    const text = extractTextFromContainer(container);
    expect(text).toBe("Just a simple quote.");
  });
});

describe("detectMainContent", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("uses contentSelector when it matches exactly one element", () => {
    document.body.innerHTML = `
      <div id="custom-content">
        <p>Custom content here that is long enough.</p>
      </div>
    `;
    const text = detectMainContent("#custom-content");
    expect(text).toContain("Custom content here");
  });

  it("falls through when contentSelector matches zero elements", () => {
    document.body.innerHTML = `
      <article>
        <p>${"Long article content. ".repeat(20)}</p>
      </article>
    `;
    const text = detectMainContent("#nonexistent");
    expect(text).toContain("Long article content");
  });

  it("returns null for empty page", () => {
    document.body.innerHTML = "";
    expect(detectMainContent()).toBeNull();
  });

  it("falls back to paragraphs when no semantic elements exist", () => {
    document.body.innerHTML = `
      <div>
        <p>This is a sufficiently long paragraph to pass the filter threshold.</p>
      </div>
    `;
    const text = detectMainContent();
    expect(text).toContain("sufficiently long paragraph");
  });

  it("filters out paragraphs inside noise elements", () => {
    document.body.innerHTML = `
      <div>
        <p>This is main content that is definitely long enough to pass.</p>
        <nav><p>This is navigation text that is long enough too.</p></nav>
      </div>
    `;
    const text = detectMainContent();
    expect(text).toContain("main content");
    expect(text).not.toContain("navigation text");
  });

  it("does not filter paragraphs when noise element is outside body (bounded walk)", () => {
    // Simulates a page where <body> is wrapped in a noise-like structure,
    // but paragraphs inside body should still be found because the walk
    // stops at document.body
    document.body.innerHTML = `
      <div>
        <p>This paragraph should be found even though body might have noise ancestors outside.</p>
      </div>
    `;
    const text = detectMainContent();
    expect(text).toContain("paragraph should be found");
  });
});
