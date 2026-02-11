// Content detection: finds the main readable content on a page.
// Exports pure functions that accept dependencies via parameters.

import { DEFAULT_NOISE_SELECTORS } from "@/shared/types";

// Collapse runs of ASCII whitespace (space, tab, newline, etc.) into a single space.
// Preserves non-breaking spaces (\u00a0) and other Unicode whitespace so that
// extracted text matches the DOM for window.find() highlighting.
const ASCII_WS = /[ \t\n\r\f\v]+/g;

// Mutable noise selector string, updated via setNoiseSelector() when settings load.
// ES module live bindings ensure importers always see the latest value.
export let NOISE_SELECTOR = DEFAULT_NOISE_SELECTORS.join(",");

/** Replace the active noise selector string from a user-configured list. */
export function setNoiseSelector(selectors: string[]): void {
  NOISE_SELECTOR = selectors.join(",");
}
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

/**
 * Drill through single-child wrapper elements (e.g. Notion's
 * blockquote → border-div → paragraph-divs) to reach the element
 * whose children are actual content blocks.
 */
function drillToSingleChild(el: Element, maxDepth = 5): Element {
  if (maxDepth <= 0) {return el;}
  const children = Array.from(el.children).filter(
    c => c instanceof HTMLElement && (c.textContent || "").trim().length > 0,
  );
  if (children.length === 1 && children[0].children.length > 0) {
    return drillToSingleChild(children[0], maxDepth - 1);
  }
  return el;
}

/**
 * Extract text from a block element, preserving paragraph boundaries.
 * For elements like blockquotes that contain multiple div children
 * (Notion wraps paragraphs in divs, not `<p>` tags), drill through
 * single-child wrappers and extract each child separately with newlines.
 */
function extractBlockText(el: Element): string {
  const inner = drillToSingleChild(el);
  const children = Array.from(inner.children).filter(
    c => c instanceof HTMLElement,
  );

  if (children.length > 1) {
    const parts: string[] = [];
    for (const child of children) {
      const t = (child.textContent || "").trim().replace(ASCII_WS, " ");
      if (t.length > 0) {parts.push(t);}
    }
    if (parts.length > 1) {return parts.join("\n");}
  }

  return (el.textContent || "").trim().replace(ASCII_WS, " ");
}

/** Extract readable text from an element's block children. */
export function extractTextFromContainer(container: Element): string {
  const blocks = container.querySelectorAll(BLOCK_SELECTOR);
  const texts: string[] = [];
  for (const block of blocks) {
    if (hasNoiseAncestor(block, container)) {continue;}
    if (block.querySelector(BLOCK_SELECTOR)) {continue;}
    const t = extractBlockText(block);
    if (t.length > 0) {texts.push(t);}
  }
  const blockText = texts.join("\n");

  // Check if block selectors captured most of the container's readable text.
  // If not, fall back to collecting text from direct children of the innermost
  // content container (handles Notion, Google Docs, and other non-semantic DOMs
  // that wrap text in deeply nested <div> chains instead of <p> tags).
  const totalLen = scoreContentLength(container);
  if (totalLen > 0 && blockText.length >= totalLen * 0.5) {return blockText;}

  const contentEl = drillToContentContainer(container);
  const childTexts: string[] = [];
  for (const child of contentEl.children) {
    if (child instanceof HTMLElement && child.matches(NOISE_SELECTOR)) {continue;}
    if (child instanceof HTMLElement && hasNoiseAncestor(child, contentEl)) {continue;}
    const t = extractBlockText(child);
    if (t.length > 0) {childTexts.push(t);}
  }

  return childTexts.length > 0 ? childTexts.join("\n") : blockText;
}

/**
 * Drill through wrapper divs to find the innermost element whose children
 * are actual content blocks (not a single wrapper). At each level, if one
 * child holds >80% of the text and has its own children, drill into it.
 */
function drillToContentContainer(container: Element, maxDepth = 10): Element {
  if (maxDepth <= 0) {return container;}

  const children = Array.from(container.children).filter(
    c => c instanceof HTMLElement && !(c as HTMLElement).matches(NOISE_SELECTOR)
  );
  if (children.length === 0) {return container;}

  const containerLen = scoreContentLength(container);
  if (containerLen === 0) {return container;}

  let bestChild: Element | null = null;
  let bestLen = 0;
  for (const child of children) {
    const len = scoreContentLength(child);
    if (len > bestLen) {
      bestLen = len;
      bestChild = child;
    }
  }

  // If one child dominates (>80% of text) and has children to drill into, go deeper
  if (bestChild && bestLen > containerLen * 0.8 && bestChild.children.length > 0) {
    return drillToContentContainer(bestChild, maxDepth - 1);
  }

  return container;
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
    .filter((p) => !hasNoiseAncestor(p, document.body))
    .map((p) => (p.textContent || "").trim().replace(ASCII_WS, " "))
    .filter((t) => t.length > 20);
  if (paragraphs.length > 0) {
    return paragraphs.join("\n");
  }

  return null;
}
