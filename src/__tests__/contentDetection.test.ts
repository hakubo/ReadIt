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

  it("returns empty string for container with no block elements", () => {
    document.body.innerHTML = `<div id="container"><span>Inline only</span></div>`;
    const container = document.getElementById("container")!;
    expect(extractTextFromContainer(container)).toBe("");
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
});
