// Content detection: finds the main readable content on a page.
// Exports pure functions that accept dependencies via parameters.

export const NOISE_SELECTORS = [
  "nav", "footer", "header", "aside",
  "[role='navigation']", "[role='banner']", "[role='contentinfo']", "[role='complementary']",
  ".sidebar", ".nav", ".menu", ".footer", ".header", ".ad", ".ads", ".advertisement",
  ".comment", ".comments", ".widget", ".social", ".share", ".related",
  "script", "style", "noscript", "iframe", "svg", "form",
];

export const NOISE_SELECTOR = NOISE_SELECTORS.join(",");
export const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, dt, dd, th, td, pre";

/** Check if an element has a noise ancestor within a given boundary. */
export function hasNoiseAncestor(el: Element, boundary: Element): boolean {
  let cur: Element | null = el;
  while (cur && cur !== boundary) {
    if (cur.matches(NOISE_SELECTOR)) {return true;}
    cur = cur.parentElement;
  }
  return false;
}

/** Extract readable text from an element's block children. */
export function extractTextFromContainer(container: Element): string {
  const blocks = container.querySelectorAll(BLOCK_SELECTOR);
  const texts: string[] = [];
  for (const block of blocks) {
    if (hasNoiseAncestor(block, container)) {continue;}
    if (block.querySelector(BLOCK_SELECTOR)) {continue;}
    const t = (block.textContent || "").trim();
    if (t.length > 0) {texts.push(t);}
  }
  return texts.join("\n");
}

/**
 * Score an element by its clean text length (for comparison only).
 * Uses a TreeWalker to skip noise subtrees without cloning the DOM.
 */
export function scoreContentLength(el: Element): number {
  let length = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ALL, {
    acceptNode(node: Node) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches(NOISE_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_SKIP;
    },
  });
  while (walker.nextNode()) {
    length += (walker.currentNode as Text).data.length;
  }
  return length;
}

/** Detect the best container element for main page content using heuristics. */
export function detectContentElement(): Element | null {
  let target: Element | null = null;

  // 1. Try <main> or [role="main"]
  const main = document.querySelector("main, [role='main']");
  if (main && scoreContentLength(main) > 100) {
    target = main;
  }

  // 2. Try <article> — pick the longest one
  if (!target) {
    const articles = document.querySelectorAll("article");
    let bestLen = 0;
    for (const article of articles) {
      const len = scoreContentLength(article);
      if (len > bestLen) {
        bestLen = len;
        target = article;
      }
    }
    if (target && bestLen < 100) {target = null;}
  }

  // 3. Score block containers by text density
  if (!target) {
    const candidates = document.querySelectorAll("div, section");
    let bestScore = 0;

    for (const el of candidates) {
      if (el.closest("#unmute-player, #unmute-selection-button")) {continue;}

      const len = scoreContentLength(el);
      if (len < 200) {continue;}

      const linkText = Array.from(el.querySelectorAll("a"))
        .reduce((sum, a) => sum + (a.textContent || "").length, 0);
      if (len > 0 && linkText / len > 0.5) {continue;}

      const pCount = el.querySelectorAll("p").length;
      const score = len + pCount * 100;

      if (score > bestScore) {
        bestScore = score;
        target = el;
      }
    }
  }

  return target;
}

/**
 * Best-effort extraction of a page's main readable content.
 * 1. Try saved contentSelector (if matches exactly 1 element)
 * 2. Try semantic elements: <article>, <main>, [role="main"]
 * 3. Fall back to scoring visible block elements by text density
 */
export function detectMainContent(contentSelector?: string): string | null {
  // Use saved content selector only if it matches exactly one element
  if (contentSelector) {
    try {
      const matches = document.querySelectorAll(contentSelector);
      if (matches.length === 1) {
        const el = matches[0];
        const text = extractTextFromContainer(el);
        if (text.length > 0) {return text;}
        // Fallback: use element's own textContent (e.g., no block-level children)
        const raw = (el.textContent || "").trim();
        if (raw.length > 0) {return raw;}
      }
    } catch { /* invalid selector — fall through */ }
    // Selector matches 0 or >1 elements — fall through to heuristics
  }

  const target = detectContentElement();
  if (target) {
    const text = extractTextFromContainer(target);
    if (text.length > 100) {return text;}
  }

  // Last resort: all <p> tags on the page
  const paragraphs = Array.from(document.querySelectorAll("p"))
    .filter((p) => !p.closest(NOISE_SELECTOR))
    .map((p) => (p.textContent || "").trim())
    .filter((t) => t.length > 20);
  if (paragraphs.length > 0) {
    return paragraphs.join("\n");
  }

  return null;
}
