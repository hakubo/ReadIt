import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  hasNoiseAncestor,
  extractTextFromContainer,
  detectMainContent,
  detectContentElement,
  getReadableText,
  setNoiseSelector,
  computeSubtreeTextStats,
  scoreContentLength,
} from "../content/contentDetection";
import { DEFAULT_NOISE_SELECTORS } from "@/shared/types";

function words(label: string, count: number): string {
  return `${label} sentence with readable words. `.repeat(count);
}

function paragraphs(label: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `<p>${words(`${label} ${index}`, 3)}</p>`).join("");
}

// Characterization tests: pin which element the heuristics pick so the
// scoring implementation can change without changing the result.
describe("detectContentElement", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    setNoiseSelector(DEFAULT_NOISE_SELECTORS);
  });

  afterEach(() => {
    setNoiseSelector(DEFAULT_NOISE_SELECTORS);
  });

  it("returns null when no element has enough text", () => {
    document.body.innerHTML = `<div id="tiny"><p>Short.</p></div>`;
    expect(detectContentElement()).toBeNull();
  });

  it("prefers <main> when it has enough text", () => {
    document.body.innerHTML = `
      <div id="wrapper">
        <main id="main">${paragraphs("main", 2)}</main>
        <article id="article">${paragraphs("article", 6)}</article>
      </div>
    `;
    expect(detectContentElement()?.id).toBe("main");
  });

  it("picks the longest article on an article page", () => {
    document.body.innerHTML = `
      <header><nav>${'<a href="#">Home link</a>'.repeat(20)}</nav></header>
      <article id="teaser">${paragraphs("teaser", 1)}</article>
      <article id="story">${paragraphs("story", 5)}</article>
      <article id="other">${paragraphs("other", 2)}</article>
      <footer>${words("footer", 10)}</footer>
    `;
    expect(detectContentElement()?.id).toBe("story");
  });

  it("ignores noise inside articles when comparing their length", () => {
    document.body.innerHTML = `
      <article id="with-comments">${paragraphs("short", 1)}<div class="comments">${paragraphs("comment", 10)}</div></article>
      <article id="real">${paragraphs("real", 3)}</article>
    `;
    expect(detectContentElement()?.id).toBe("real");
  });

  it("falls through to block scoring when articles are too short", () => {
    document.body.innerHTML = `
      <article id="stub">Tiny</article>
      <div id="content">${paragraphs("content", 4)}</div>
    `;
    expect(detectContentElement()?.id).toBe("content");
  });

  it("skips a wrapper whose nav links dominate on a page with big nav, sidebar and footer", () => {
    document.body.innerHTML = `
      <div id="page">
        <div id="top"><nav>${'<a href="#">Section link text</a>'.repeat(30)}</nav></div>
        <div id="layout">
          <section id="content">${paragraphs("content", 6)}</section>
          <div class="sidebar" id="sidebar">${paragraphs("sidebar", 3)}</div>
        </div>
        <footer>${words("footer", 20)}</footer>
      </div>
    `;
    // #page counts raw nav link text against only the readable (non-noise) text
    expect(detectContentElement()?.id).toBe("layout");
  });

  it("can pick a noise-classed element because its own text still counts", () => {
    document.body.innerHTML = `
      <div id="content">${paragraphs("content", 2)}</div>
      <div class="sidebar" id="sidebar">${paragraphs("sidebar", 8)}</div>
    `;
    expect(detectContentElement()?.id).toBe("sidebar");
  });

  it("skips link-heavy lists and picks the text block", () => {
    const links = Array.from(
      { length: 30 },
      (_, index) => `<li><a href="/post-${index}">Link to some interesting post number ${index}</a></li>`,
    ).join("");
    document.body.innerHTML = `
      <div id="links"><ul>${links}</ul></div>
      <div id="text">${words("text", 8)}</div>
    `;
    expect(detectContentElement()?.id).toBe("text");
  });

  it("counts raw link text, including noise inside links, toward the link ratio", () => {
    document.body.innerHTML = `
      <div id="tricky">${words("readable", 8)}<a href="#"><span class="share">${words("share", 12)}</span></a></div>
      <div id="plain">${words("plain", 6)}</div>
    `;
    expect(detectContentElement()?.id).toBe("plain");
  });

  it("keeps the first element in document order when nested wrappers tie", () => {
    document.body.innerHTML = `
      <div id="outer"><div id="middle"><div id="inner">${paragraphs("nested", 4)}</div></div></div>
    `;
    expect(detectContentElement()?.id).toBe("outer");
  });

  it("lets paragraph count outweigh slightly longer text", () => {
    document.body.innerHTML = `
      <div id="long">${words("long", 12)}</div>
      <div id="structured">${paragraphs("structured", 3)}</div>
    `;
    expect(detectContentElement()?.id).toBe("structured");
  });

  it("does not count script or style text", () => {
    document.body.innerHTML = `
      <div id="scripted">${words("visible", 2)}<script>${"var x = 1; ".repeat(100)}</script><style>${".a{b:c}".repeat(100)}</style></div>
      <div id="readable">${words("readable", 8)}</div>
    `;
    expect(detectContentElement()?.id).toBe("readable");
  });

  it("never picks the extension's own player UI", () => {
    document.body.innerHTML = `
      <div id="readit-player"><div id="player-inner">${paragraphs("player", 10)}</div></div>
      <div id="content">${paragraphs("content", 3)}</div>
    `;
    expect(detectContentElement()?.id).toBe("content");
  });

  it("respects a custom noise selector", () => {
    const page = `
      <div id="wrapper"><span class="promo">${words("promo", 30)}</span><p>${words("body", 3)}</p></div>
      <div id="rival">${paragraphs("rival", 3)}</div>
    `;
    document.body.innerHTML = page;
    expect(detectContentElement()?.id).toBe("wrapper");

    setNoiseSelector([".promo"]);
    document.body.innerHTML = page;
    expect(detectContentElement()?.id).toBe("rival");
  });
});

describe("computeSubtreeTextStats", () => {
  it("matches per-element subtree walks for every element", () => {
    document.body.innerHTML = `
      <header id="site-header"><nav><a href="/">Home</a> <a href="/about">About <b>us</b></a></nav></header>
      <div id="page" class="nav">
        Leading text
        <section id="body">
          ${paragraphs("body", 3)}
          <p>Inline <a href="#">link <span class="share">share</span></a> <style>.x{}</style> done.</p>
          <div class="comments"><p>Comment <a href="#">reply</a></p></div>
          <svg><a href="#"><text>svg link</text></a></svg>
          <!-- a comment node -->
          <template><p>template text</p></template>
          <a href="#"><a href="#">nested anchors</a></a>
        </section>
        <aside id="aside">${words("aside", 3)}</aside>
      </div>
    `;
    const statsByElement = computeSubtreeTextStats(document.documentElement);
    for (const element of [document.documentElement, ...document.documentElement.querySelectorAll("*")]) {
      const stats = statsByElement.get(element)!;
      const linkText = Array.from(element.querySelectorAll("a")).reduce(
        (sum, anchor) => sum + (anchor.textContent || "").length,
        0,
      );
      expect(stats.readableLength).toBe(scoreContentLength(element));
      expect(stats.rawLength).toBe((element.textContent || "").length);
      expect(stats.linkTextLength).toBe(linkText);
      expect(stats.paragraphCount).toBe(element.querySelectorAll("p").length);
    }
  });
});

describe("getReadableText", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("skips style, script, noscript and template nested inside text", () => {
    document.body.innerHTML = `
      <p id="target">Hello <style>.x { color: red; }</style>world<script>track()</script><noscript>Enable JS</noscript><template>tpl</template>!</p>
    `;
    expect(getReadableText(document.getElementById("target")!)).toBe("Hello world!");
  });

  it("skips noise subtrees nested inside text", () => {
    document.body.innerHTML = `<p id="target">Story <span class="share">Share this</span>text</p>`;
    expect(getReadableText(document.getElementById("target")!)).toBe("Story text");
  });
});

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
});

describe("detectMainContent", () => {
  it("does not read <style> tags nested in paragraphs", () => {
    document.body.innerHTML = `
      <article>
        <p>${"First paragraph of the article body. ".repeat(4)}<style>.css-1abc { margin: 0 }</style></p>
        <p>${"Second paragraph with more readable text. ".repeat(4)}</p>
      </article>
    `;
    const text = detectMainContent();
    expect(text).not.toBeNull();
    expect(text).not.toContain("css-1abc");
    expect(text).not.toContain("margin");
  });

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
