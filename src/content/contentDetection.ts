// Content detection: finds the main readable content on a page.
// Exports pure functions that accept dependencies via parameters.

import { DEFAULT_NOISE_SELECTORS } from "@/shared/types";
import { READING_SKIP_SELECTOR, spokenElement, type SpokenElement } from "./spokenElements";

// Mutable noise selector string, updated via setNoiseSelector() when settings load.
// ES module live bindings ensure importers always see the latest value.
export let NOISE_SELECTOR = DEFAULT_NOISE_SELECTORS.join(",");

// Matches nothing; used when the list is empty, since matches("") throws.
const MATCH_NOTHING_SELECTOR = ":not(*)";

/** Whether `selector` parses as a CSS selector (querySelector/matches would not throw). */
export function isValidSelector(selector: string): boolean {
  if (!selector.trim()) {
    return false;
  }
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

/**
 * Replace the active noise selector string from a user-configured list.
 * Invalid entries are dropped: one bad selector in the joined list would make
 * every matches() call throw and break detection on every site.
 */
export function setNoiseSelector(selectors: string[]): void {
  const validSelectors = selectors.filter(isValidSelector);
  NOISE_SELECTOR = validSelectors.length > 0 ? validSelectors.join(",") : MATCH_NOTHING_SELECTOR;
}
// Never spoken, regardless of the user's noise selector list: code, hidden
// elements, collapsed <details> bodies, icon-font ligatures ("arrow_forward")
// and footnote reference markers.
export const NON_READABLE_SELECTOR = [
  "script", "style", "noscript", "template", "[hidden]",
  "details:not([open]) > :not(summary)",
  ".material-icons", ".material-icons-outlined", ".material-icons-round", ".material-icons-sharp",
  ".material-icons-two-tone", ".material-symbols-outlined", ".material-symbols-rounded", ".material-symbols-sharp",
  "sup.reference", "sup > a[href^='#']", "a[role='doc-noteref']", "a.footnote-ref",
].join(", ");

export const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, dt, dd, th, td, pre, summary";

/** Check if an element has a noise ancestor within a given boundary. */
export function hasNoiseAncestor(el: Element, boundary: Element): boolean {
  let cur: Element | null = el;
  while (cur && cur !== boundary) {
    if (cur.matches(NOISE_SELECTOR)) {return true;}
    cur = cur.parentElement;
  }
  return false;
}

function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Extract readable text from an element's block children. */
export function extractTextFromContainer(container: Element): string {
  const blockText = collectBlockTexts(container).join("\n");

  // Check if block selectors captured most of the container's readable text.
  // If not, fall back to collecting text from direct children of the innermost
  // content container (handles Notion, Google Docs, and other non-semantic DOMs
  // that wrap text in deeply nested <div> chains instead of <p> tags).
  // Normalized, so indentation whitespace doesn't count as text the blocks missed.
  const totalLen = normalizeWhitespace(getReadableText(container)).length;
  if (totalLen > 0 && blockText.length >= totalLen * 0.5) {return blockText;}

  const childText = collectChildTexts(drillToContentContainer(container));
  return childText.length > 0 ? childText : blockText;
}

/** Text of every outermost block in `container`, in document order. */
function collectBlockTexts(container: Element): string[] {
  const texts: string[] = [];
  // Images sit outside text blocks (<figure><img><figcaption>), so collect them too
  for (const block of container.querySelectorAll(`${BLOCK_SELECTOR}, img, [role='img']`)) {
    const outerBlock = block.parentElement?.closest(BLOCK_SELECTOR);
    // Nested blocks are handled while walking their outermost block.
    if (outerBlock && outerBlock !== container && container.contains(outerBlock)) {continue;}
    if (hasNoiseAncestor(block, container)) {continue;}
    appendBlockText(block, texts);
  }
  return texts;
}

/**
 * Push a block's text. A block holding nested blocks (an <li> with a sub-list,
 * a <td> with <p>s) is split at each nested block, so its own text is kept in
 * order instead of being dropped.
 */
function appendBlockText(block: Element, texts: string[]): void {
  if (!block.querySelector(BLOCK_SELECTOR)) {
    pushNormalized(texts, getReadableText(block));
    return;
  }
  const run = { text: "" };
  appendMixedContent(block, texts, run);
  pushNormalized(texts, run.text);
}

function appendMixedContent(element: Element, texts: string[], run: { text: string }): void {
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      run.text += (child as Text).data;
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE || isUnreadableSubtree(child as Element)) {continue;}
    const childElement = child as Element;
    const spoken = spokenElement(childElement);
    if (spoken) {
      appendSpokenElement(spoken, texts, run);
      continue;
    }
    if (!childElement.matches(BLOCK_SELECTOR)) {
      appendMixedContent(childElement, texts, run);
      continue;
    }
    pushNormalized(texts, run.text);
    run.text = "";
    appendBlockText(childElement, texts);
  }
}

function appendSpokenElement(spoken: SpokenElement, texts: string[], run: { text: string }): void {
  if (!spoken.block) {
    run.text += spoken.text;
    return;
  }
  pushNormalized(texts, run.text);
  run.text = "";
  pushNormalized(texts, spoken.text);
}

function pushNormalized(texts: string[], text: string): void {
  const normalized = normalizeWhitespace(text);
  if (normalized.length > 0) {texts.push(normalized);}
}

/**
 * Text of each non-noise child of `contentElement`, one per line. If that
 * misses most of the readable text (text nodes sitting directly in the
 * container, as on Hacker News comments), read the container as a whole.
 */
function collectChildTexts(contentElement: Element): string {
  const childTexts: string[] = [];
  for (const child of contentElement.children) {
    if (child.matches(NOISE_SELECTOR) || hasNoiseAncestor(child, contentElement)) {continue;}
    pushNormalized(childTexts, getReadableText(child));
  }
  const joined = childTexts.join("\n");
  const wholeText = normalizeWhitespace(getReadableText(contentElement));
  return joined.length >= wholeText.length * 0.5 ? joined : wholeText;
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

// aria-hidden on a short subtree marks decoration (icon ligatures, duplicated
// labels). Modal libraries also set it on the whole app while a dialog is
// open, so a long aria-hidden subtree is still read.
const DECORATIVE_TEXT_MAX_LENGTH = 100;

function isDecorativeAriaHidden(element: Element): boolean {
  if (element.getAttribute("aria-hidden") !== "true") {
    return false;
  }
  return (element.textContent ?? "").length <= DECORATIVE_TEXT_MAX_LENGTH;
}

/** Never spoken: hidden/collapsed content, icons, footnote markers, what the user skips (code blocks, struck-out text). Noise not included. */
export function isNonReadableElement(element: Element): boolean {
  return element.matches(NON_READABLE_SELECTOR) || element.matches(READING_SKIP_SELECTOR) || isDecorativeAriaHidden(element);
}

/** Whether an element's subtree is excluded from readable text (noise or non-readable). */
function isUnreadableSubtree(element: Element): boolean {
  return isNonReadableElement(element) || element.matches(NOISE_SELECTOR);
}

/**
 * Not rendered (display:none, content-visibility:hidden ancestor). A
 * `display: contents` element has no box of its own, so checkVisibility()
 * reports it hidden even though its children render: walk into it.
 */
function isRenderedHidden(element: Element): boolean {
  const checkable = element as Element & { checkVisibility?: () => boolean };
  if (typeof checkable.checkVisibility !== "function" || checkable.checkVisibility()) {
    return false;
  }
  return getComputedStyle(element).display !== "contents";
}

/** Marks a line break (<br>) or block edge between readable text nodes. */
export const LINE_BREAK = "\n";
/** A text node, a line break, or an element spoken as a whole (alt text, a key name; see spokenElements.ts). */
export type ReadablePart = Text | typeof LINE_BREAK | SpokenElement;

export function isSpokenElementPart(part: ReadablePart): part is SpokenElement {
  return typeof part === "object" && "element" in part;
}

/** The text a part contributes to the readable text, whitespace collapsed. */
export function readablePartText(part: ReadablePart): string {
  if (part === LINE_BREAK) {
    return LINE_BREAK;
  }
  return isSpokenElementPart(part) ? part.text : part.data.replace(/\s+/g, " ");
}

export interface ReadableWalkOptions {
  /** Skip subtrees matching the user's noise selector (default true). */
  skipNoise?: boolean;
}

// Elements whose edges separate words even when the DOM has no whitespace
// there ("ends.</p><p>Next" must not read as "ends.Next").
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "caption", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hgroup", "hr", "legend", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);

function isBlockElement(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).localName);
}

function isSkippedElement(element: Element, skipNoise: boolean): boolean {
  if (isNonReadableElement(element) || (skipNoise && element.matches(NOISE_SELECTOR))) {
    return true;
  }
  return isRenderedHidden(element);
}

/** Leave `node`'s subtree: yield block-end breaks while climbing, return the next node to visit. */
function* climbToNextNode(node: Node, root: Element): Generator<ReadablePart, Node | null> {
  let current: Node | null = node;
  while (current && current !== root && !current.nextSibling) {
    current = current.parentNode;
    if (current && current !== root && isBlockElement(current)) {
      yield LINE_BREAK;
    }
  }
  return !current || current === root ? null : current.nextSibling;
}

/** Parts an element yields on entry; returns whether to walk its children. */
function* elementParts(element: Element, skipNoise: boolean): Generator<ReadablePart, boolean> {
  if (element.localName === "br") {
    yield LINE_BREAK;
    return false;
  }
  if (isSkippedElement(element, skipNoise)) {
    return false;
  }
  const spoken = spokenElement(element);
  if (spoken) {
    yield* spokenElementParts(spoken);
    return false;
  }
  if (isBlockElement(element)) {
    yield LINE_BREAK;
  }
  return true;
}

function* spokenElementParts(spoken: SpokenElement): Generator<ReadablePart> {
  if (spoken.block) {
    yield LINE_BREAK;
  }
  if (spoken.text) {
    yield spoken;
  }
  if (spoken.block) {
    yield LINE_BREAK;
  }
}

/**
 * The single node filter shared by speech text and the highlight index: yields
 * readable text nodes under `root` in document order, plus LINE_BREAK at <br>
 * and block edges, and a SpokenElement for an element read as a whole (its
 * children aren't walked). Skips non-readable and hidden subtrees (and noise
 * unless skipNoise is false). The root itself is never filtered.
 */
export function* readableTextParts(root: Element, options: ReadableWalkOptions = {}): Generator<ReadablePart> {
  const skipNoise = options.skipNoise ?? true;
  let node: Node | null = root.firstChild;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      yield node as Text;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const descend = yield* elementParts(element, skipNoise);
      if (descend && element.firstChild) {
        node = element.firstChild;
        continue;
      }
    }
    node = yield* climbToNextNode(node, root);
  }
}

/** Readable text nodes under `el` (see readableTextParts), without the line breaks. */
export function* readableTextNodes(el: Element, options: ReadableWalkOptions = {}): Generator<Text> {
  for (const part of readableTextParts(el, options)) {
    if (part !== LINE_BREAK && !isSpokenElementPart(part)) {
      yield part;
    }
  }
}

/**
 * Whether `element` sits inside a non-readable or hidden subtree, judged the
 * way readableTextParts() judges descendants (noise aside). Extraction reads
 * blocks found by querySelectorAll, so their ancestors must be checked too,
 * or hidden text is spoken but can never be highlighted.
 */
function isInsideUnreadable(element: Element): boolean {
  if (element.closest(NON_READABLE_SELECTOR) || element.closest(READING_SKIP_SELECTOR)) {
    return true;
  }
  const ariaHidden = element.closest("[aria-hidden='true']");
  if (ariaHidden && isDecorativeAriaHidden(ariaHidden)) {
    return true;
  }
  return isRenderedHidden(element);
}

/**
 * Like textContent, but without noise, non-readable or hidden subtrees
 * (empty when `el` itself is inside one). Whitespace inside text is
 * collapsed to single spaces; <br> and block edges become "\n".
 */
export function getReadableText(el: Element): string {
  if (isInsideUnreadable(el)) {
    return "";
  }
  // An element spoken as a whole (an image collected as a block) is its own text
  const spoken = spokenElement(el);
  if (spoken) {
    return spoken.text;
  }
  let text = "";
  for (const part of readableTextParts(el)) {
    text += readablePartText(part);
  }
  return text;
}

/** Score an element by its clean text length (for comparison only). */
export function scoreContentLength(el: Element): number {
  let length = 0;
  for (const node of readableTextNodes(el)) {
    length += node.data.length;
  }
  return length;
}

/** Per-element text totals used to score content candidates. */
export interface SubtreeTextStats {
  /** Same as scoreContentLength(): text excluding noise/non-readable descendants. */
  readableLength: number;
  /** Raw textContent length, including noise and script/style text. */
  rawLength: number;
  /** Sum of textContent lengths of descendant <a> elements. */
  linkTextLength: number;
  /** Number of descendant <p> elements. */
  paragraphCount: number;
}

/**
 * Compute SubtreeTextStats for `root` and every element under it in one O(n)
 * bottom-up pass, instead of walking each candidate's subtree separately.
 *
 * Mirrors scoreContentLength(): a TreeWalker never filters its own root, so an
 * element matching the noise selector still counts its text for itself; only
 * its ancestors exclude it.
 */
export function computeSubtreeTextStats(root: Element): Map<Element, SubtreeTextStats> {
  const statsByElement = new Map<Element, SubtreeTextStats>();
  const elements = [root, ...root.querySelectorAll("*")];
  // Reverse document order visits every child before its parent.
  for (let index = elements.length - 1; index >= 0; index--) {
    const element = elements[index];
    statsByElement.set(element, sumChildStats(element, statsByElement));
  }
  return statsByElement;
}

function sumChildStats(element: Element, statsByElement: Map<Element, SubtreeTextStats>): SubtreeTextStats {
  const stats: SubtreeTextStats = { readableLength: 0, rawLength: 0, linkTextLength: 0, paragraphCount: 0 };
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const length = (child as Text).data.length;
      stats.readableLength += length;
      stats.rawLength += length;
      continue;
    }
    const childElement = child as Element;
    const childStats = statsByElement.get(childElement);
    if (!childStats) {
      continue;
    }
    if (!isUnreadableSubtree(childElement)) {
      stats.readableLength += childStats.readableLength;
    }
    stats.rawLength += childStats.rawLength;
    stats.linkTextLength += childStats.linkTextLength;
    stats.paragraphCount += childStats.paragraphCount;
    // localName mirrors the namespace-agnostic querySelectorAll("a") / ("p") type selectors.
    if (childElement.localName === "a") {
      stats.linkTextLength += childStats.rawLength;
    }
    if (childElement.localName === "p") {
      stats.paragraphCount += 1;
    }
  }
  return stats;
}

/** Pick the longest <article>, if it has at least 100 readable characters. */
function findLongestArticle(statsByElement: Map<Element, SubtreeTextStats>): Element | null {
  let target: Element | null = null;
  let bestLength = 0;
  for (const article of document.querySelectorAll("article")) {
    const length = statsByElement.get(article)?.readableLength ?? 0;
    if (length > bestLength) {
      bestLength = length;
      target = article;
    }
  }
  return bestLength < 100 ? null : target;
}

/** Score div/section candidates by text density, skipping link-heavy blocks. */
function findDensestBlock(statsByElement: Map<Element, SubtreeTextStats>): Element | null {
  let target: Element | null = null;
  let bestScore = 0;
  for (const element of document.querySelectorAll("div, section")) {
    if (element.closest("#readit-player, #readit-selection-button")) {continue;}

    const stats = statsByElement.get(element);
    if (!stats || stats.readableLength < 200) {continue;}
    if (stats.linkTextLength / stats.readableLength > 0.5) {continue;}

    const score = stats.readableLength + stats.paragraphCount * 100;
    if (score > bestScore) {
      bestScore = score;
      target = element;
    }
  }
  return target;
}

/** Readable text outside links: the part of a subtree that reads like prose. */
function proseLength(stats: SubtreeTextStats | undefined): number {
  if (!stats) {return 0;}
  return Math.max(0, stats.readableLength - stats.linkTextLength);
}

/** False for elements the user can't see ([hidden], aria-hidden, display:none). */
function isRendered(element: Element): boolean {
  if (element.closest("[hidden], [aria-hidden='true']")) {return false;}
  const checkable = element as Element & { checkVisibility?: () => boolean };
  return typeof checkable.checkVisibility !== "function" || checkable.checkVisibility();
}

/** First visible <main>/[role=main] with more than 100 readable characters. */
function findVisibleMain(): Element | null {
  for (const main of document.querySelectorAll("main, [role='main']")) {
    if (isRendered(main) && scoreContentLength(main) > 100) {return main;}
  }
  return null;
}

const ARTICLE_BODY_SELECTOR = "article, [itemprop='articleBody']";
// An article must hold this share of <main>'s prose to replace it...
const DOMINANT_ARTICLE_SHARE = 0.5;
// ...and the runner-up must be this much smaller, or it's a feed or thread.
const RUNNER_UP_MAX_SHARE = 0.3;

/**
 * Inside <main>, prefer one article that holds most of the prose (a GitHub
 * README next to the file table). Keep <main> when no article dominates.
 */
function preferDominantArticle(main: Element): Element {
  const statsByElement = computeSubtreeTextStats(main);
  const mainProse = proseLength(statsByElement.get(main));
  const ranked = Array.from(main.querySelectorAll(ARTICLE_BODY_SELECTOR))
    .filter((candidate) => isOutermostArticle(candidate, main) && !hasNoiseAncestor(candidate, main) && isRendered(candidate))
    .map((candidate) => ({ candidate, prose: proseLength(statsByElement.get(candidate)) }))
    .sort((first, second) => second.prose - first.prose);
  const [best, runnerUp] = ranked;
  if (!best || best.prose < mainProse * DOMINANT_ARTICLE_SHARE) {return main;}
  if (runnerUp && runnerUp.prose > best.prose * RUNNER_UP_MAX_SHARE) {return main;}
  return best.candidate;
}

/** Skip an [itemprop=articleBody] nested in an <article>; the outer one represents both. */
function isOutermostArticle(candidate: Element, boundary: Element): boolean {
  const outer = candidate.parentElement?.closest(ARTICLE_BODY_SELECTOR);
  return !outer || !boundary.contains(outer) || outer === boundary;
}

const DRILL_CANDIDATE_SELECTOR = "div, section, article, main";
// Drill into a child only if it holds this share of the parent's prose.
const DRILL_PROSE_SHARE = 0.8;

/**
 * The densest block on div-soup pages is often the app wrapper (#app,
 * #__next) holding a top bar and related posts. Walk down while one child
 * holds nearly all of the prose, then back up through pure wrappers so the
 * result is the outermost element with that same text.
 */
function drillIntoDominantChild(start: Element, statsByElement: Map<Element, SubtreeTextStats>): Element {
  let current = start;
  for (let next = dominantChild(current, statsByElement); next; next = dominantChild(current, statsByElement)) {
    current = next;
  }
  while (current !== start && current.parentElement && !hasOtherReadableText(current.parentElement, current)) {
    current = current.parentElement;
  }
  return current;
}

/** Whether `parent` has readable text outside `child` (whitespace doesn't count). */
function hasOtherReadableText(parent: Element, child: Element): boolean {
  for (const node of parent.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node as Text).data.trim()) {return true;}
    if (node.nodeType !== Node.ELEMENT_NODE || node === child || isUnreadableSubtree(node as Element)) {continue;}
    if (getReadableText(node as Element).trim()) {return true;}
  }
  return false;
}

function dominantChild(parent: Element, statsByElement: Map<Element, SubtreeTextStats>): Element | null {
  const parentProse = proseLength(statsByElement.get(parent));
  if (parentProse === 0) {return null;}
  const children = Array.from(parent.children).filter((child) => !isUnreadableSubtree(child));
  let best: Element | null = null;
  let bestProse = 0;
  for (const child of children) {
    const prose = proseLength(statsByElement.get(child));
    if (prose > bestProse) {
      best = child;
      bestProse = prose;
    }
  }
  if (!best || !best.matches(DRILL_CANDIDATE_SELECTOR)) {return null;}
  if (bestProse < parentProse * DRILL_PROSE_SHARE) {return null;}
  if ((statsByElement.get(best)?.readableLength ?? 0) < 200) {return null;}
  // Never drill past the page headline.
  if (children.some((child) => child !== best && child.querySelector("h1"))) {return null;}
  return best;
}

// A thread needs at least this many posts (the pick plus its peers)...
const MIN_THREAD_POSTS = 3;
// ...and the pick must hold less than this share of the posts' text.
const THREAD_MAX_SINGLE_SHARE = 0.6;

/**
 * On thread pages (Hacker News, forums) the best block is one post among
 * many alike. Expand to the posts' common container so the whole thread is
 * read. Stays put when the pick is the page's headline article.
 */
function expandToThread(target: Element, statsByElement: Map<Element, SubtreeTextStats>): Element {
  const peers = findPeers(target, statsByElement);
  if (peers.length + 1 < MIN_THREAD_POSTS) {return target;}
  if (target.querySelector("h1") && !peers.some((peer) => peer.querySelector("h1"))) {return target;}

  const readable = (element: Element) => statsByElement.get(element)?.readableLength ?? 0;
  const postsLength = peers.reduce((sum, peer) => sum + readable(peer), readable(target));
  if (readable(target) >= postsLength * THREAD_MAX_SINGLE_SHARE) {return target;}

  const container = commonAncestor([target, ...peers]);
  if (!container || container === document.body || container === document.documentElement) {return target;}
  // The container must be mostly posts, not a page wrapper with other content.
  if (postsLength < readable(container) * 0.5) {return target;}
  return container;
}

/** Elements built like `target` (same tag and first class) elsewhere on the page. */
function findPeers(target: Element, statsByElement: Map<Element, SubtreeTextStats>): Element[] {
  const firstClass = target.classList[0];
  if (!firstClass && target.localName !== "article") {return [];}
  const selector = firstClass ? `${target.localName}.${CSS.escape(firstClass)}` : "article";
  return Array.from(document.querySelectorAll(selector)).filter((peer) =>
    peer !== target &&
    !peer.contains(target) &&
    !target.contains(peer) &&
    (statsByElement.get(peer)?.readableLength ?? 0) >= 50 &&
    !hasNoiseAncestor(peer, document.documentElement),
  );
}

function commonAncestor(elements: Element[]): Element | null {
  let ancestor: Element | null = elements[0];
  while (ancestor && !elements.every((element) => ancestor!.contains(element))) {
    ancestor = ancestor.parentElement;
  }
  return ancestor;
}

/** Detect the best container element for main page content using heuristics. */
export function detectContentElement(): Element | null {
  // 1. A visible <main> or [role="main"], or its dominant article
  const main = findVisibleMain();
  if (main) {
    return preferDominantArticle(main);
  }

  const statsByElement = computeSubtreeTextStats(document.documentElement);
  // 2. Longest <article>, then 3. densest div/section; either may be one post of a thread
  const article = findLongestArticle(statsByElement);
  if (article) {
    return expandToThread(article, statsByElement);
  }
  const block = findDensestBlock(statsByElement);
  return block ? expandToThread(drillIntoDominantChild(block, statsByElement), statsByElement) : null;
}

export interface MainContent {
  text: string;
  /** Element the text came from; null for the page-wide <p> fallback. */
  root: Element | null;
}

/**
 * Best-effort extraction of a page's main readable content.
 * 1. Try saved contentSelector (if matches exactly 1 element)
 * 2. Try semantic elements: <article>, <main>, [role="main"]
 * 3. Fall back to scoring visible block elements by text density
 * 4. Last resort: every <p> on the page (no single root element)
 */
export function detectMainContentWithRoot(contentSelector?: string): MainContent | null {
  // Use saved content selector only if it matches exactly one element
  if (contentSelector) {
    try {
      const matches = document.querySelectorAll(contentSelector);
      if (matches.length === 1) {
        const el = matches[0];
        const text = extractTextFromContainer(el);
        if (text.length > 0) {return { text, root: el };}
        // Fallback: use element's own textContent (e.g., no block-level children)
        const raw = getReadableText(el).trim();
        if (raw.length > 0) {return { text: raw, root: el };}
      }
    } catch { /* invalid selector — fall through */ }
    // Selector matches 0 or >1 elements — fall through to heuristics
  }

  const target = detectContentElement();
  if (target) {
    const text = extractTextFromContainer(target);
    if (text.length > 100) {return { text, root: target };}
    // Text sitting directly in the container, with no block children
    const raw = normalizeWhitespace(getReadableText(target));
    if (raw.length > 100) {return { text: raw, root: target };}
  }

  // Last resort: all <p> tags on the page
  const paragraphs = Array.from(document.querySelectorAll("p"))
    .filter((p) => !hasNoiseAncestor(p, document.body))
    .map((p) => getReadableText(p).trim().replace(/\s+/g, " "))
    .filter((t) => t.length > 20);
  if (paragraphs.length > 0) {
    return { text: paragraphs.join("\n"), root: null };
  }

  return null;
}

/** Text-only wrapper around detectMainContentWithRoot(). */
export function detectMainContent(contentSelector?: string): string | null {
  return detectMainContentWithRoot(contentSelector)?.text ?? null;
}
