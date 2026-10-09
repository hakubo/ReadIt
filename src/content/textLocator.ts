// Locates sentences in the page's rendered text and returns DOM Ranges for them.
//
// Replaces window.find(): Chrome's find cannot match across a <style> or
// <script> element, even though they are invisible and excluded from
// innerText/Selection.toString(). Sites that inject a <style> next to each
// @mention (e.g. Campsite) would otherwise never get those sentences highlighted.
//
// The index is built with readableTextParts(), the same node filter that
// produces the spoken text, so every spoken sentence can be found.

import { LINE_BREAK, isSpokenElementPart, readableTextParts } from "./contentDetection";

/**
 * Whitespace-collapsed text of a subtree, with a map back to DOM positions.
 *
 * The map is stored per run rather than per character (a per-character
 * object array costs ~150 MB on a huge page): run `r` covers text indexes
 * runStarts[r] up to runStarts[r + 1], which map 1:1 onto runNodes[r] from
 * offset runOffsets[r]. A collapsed whitespace run or a node change starts a
 * new run. An element spoken as a whole (alt text, a key name) maps its
 * spoken text to the element itself: a match there covers the whole element.
 */
export interface TextIndex {
  text: string;
  runStarts: number[];
  runNodes: Array<Text | Element>;
  runOffsets: number[];
}

/**
 * Ranges that start or end around a spoken element (not inside a text node).
 * The stale-Range check in highlighting.ts accepts element boundaries only for these.
 */
export const elementBoundedRanges = new WeakSet<Range>();

const WHITESPACE_RUN = /\s+/g;

class TextIndexBuilder {
  private chunks: string[] = [];
  private length = 0;
  // Starts true so leading whitespace is dropped
  private lastWasSpace = true;
  private readonly index: TextIndex = { text: "", runStarts: [], runNodes: [], runOffsets: [] };

  addNode(node: Text): void {
    this.addText(node, node.data);
  }

  /** An element spoken as a whole: its spoken text, mapped to the element. */
  addSpokenElement(element: Element, text: string): void {
    this.addText(element, text);
  }

  private addText(node: Text | Element, data: string): void {
    let cursor = 0;
    for (const match of data.matchAll(WHITESPACE_RUN)) {
      this.appendChars(node, cursor, data.slice(cursor, match.index));
      this.appendSpace(node, match.index);
      cursor = match.index + match[0].length;
    }
    this.appendChars(node, cursor, data.slice(cursor));
  }

  /** A <br> or block edge: a word separator with no DOM position of its own. */
  addBreak(): void {
    if (this.lastWasSpace) {
      return;
    }
    this.chunks.push(" ");
    this.length += 1;
    this.lastWasSpace = true;
  }

  finish(): TextIndex {
    // A trailing separator is never part of a match
    this.index.text = this.chunks.join("").replace(/ $/, "");
    return this.index;
  }

  private appendSpace(node: Text | Element, offset: number): void {
    if (this.lastWasSpace) {
      return;
    }
    this.appendChars(node, offset, " ");
    this.lastWasSpace = true;
  }

  private appendChars(node: Text | Element, offset: number, chars: string): void {
    if (!chars) {
      return;
    }
    this.mapPosition(node, offset);
    this.chunks.push(chars);
    this.length += chars.length;
    this.lastWasSpace = chars === " ";
  }

  /** Start a new run unless text index `length` continues the current run 1:1. */
  private mapPosition(node: Text | Element, offset: number): void {
    const { runStarts, runNodes, runOffsets } = this.index;
    const last = runStarts.length - 1;
    const continuesRun = last >= 0 && runNodes[last] === node
      && offset - runOffsets[last] === this.length - runStarts[last];
    if (continuesRun) {
      return;
    }
    runStarts.push(this.length);
    runNodes.push(node);
    runOffsets.push(offset);
  }
}

/**
 * Build a whitespace-collapsed index of readable text under `root`.
 * Every whitespace run (and every <br>/block edge) becomes a single space,
 * matching how sentences are normalized before lookup.
 */
export function buildTextIndex(root: Element, options: { skipNoise: boolean }): TextIndex {
  const builder = new TextIndexBuilder();
  for (const part of readableTextParts(root, options)) {
    if (part === LINE_BREAK) {
      builder.addBreak();
    } else if (isSpokenElementPart(part)) {
      builder.addSpokenElement(part.element, part.text);
    } else {
      builder.addNode(part);
    }
  }
  return builder.finish();
}

/** Index of the last run starting at or before text index `textIndex`. */
function runAt(index: TextIndex, textIndex: number): number {
  let low = 0;
  let high = index.runStarts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (index.runStarts[middle] <= textIndex) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/**
 * DOM position of the character at `textIndex` (must be a mapped, non-break
 * character). For a spoken element, `node` is the element and `offset` the
 * position in its spoken text.
 */
export function positionAt(index: TextIndex, textIndex: number): { node: Text | Element; offset: number } {
  const run = runAt(index, textIndex);
  const node = index.runNodes[run];
  const offset = index.runOffsets[run] + textIndex - index.runStarts[run];
  return { node, offset: node instanceof Text ? Math.min(offset, node.length) : offset };
}

function childIndex(node: Node): number {
  return Array.prototype.indexOf.call(node.parentNode?.childNodes ?? [], node);
}

/** A run's first character as a DOM boundary point (just before a spoken element). */
function runPoint(node: Text | Element, offset: number): [Node, number] {
  if (node instanceof Text) {
    return [node, offset];
  }
  return [node.parentNode ?? node, childIndex(node)];
}

function runEnd(index: TextIndex, run: number): number {
  return run + 1 < index.runStarts.length ? index.runStarts[run + 1] : index.text.length;
}

/** Whether DOM point (node, offset) comes at or before `boundary` (a collapsed Range). */
function isAtOrBefore(boundary: Range, node: Node, offset: number): boolean {
  try {
    return boundary.comparePoint(node, offset) <= 0;
  } catch {
    return false;
  }
}

/**
 * First text index at or after a DOM boundary point, e.g. the start of the
 * user's selection. Returns text.length when the boundary is past all text.
 */
export function textIndexAtBoundary(index: TextIndex, boundary: Range): number {
  const runCount = index.runStarts.length;
  // Binary search for the last run whose first character is at or before the boundary.
  let low = -1;
  let high = runCount - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (isAtOrBefore(boundary, ...runPoint(index.runNodes[middle], index.runOffsets[middle]))) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  if (low < 0) {
    return 0;
  }
  const end = runEnd(index, low);
  if (index.runNodes[low] !== boundary.startContainer) {
    return end;
  }
  return Math.min(index.runStarts[low] + boundary.startOffset - index.runOffsets[low], end);
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Find `sentence` in the index at or after `fromIndex`, falling back to a
 * search from the start. Returns the Range and the index just past the match.
 */
export function findSentenceRange(
  index: TextIndex,
  sentence: string,
  fromIndex: number,
): { range: Range; endIndex: number } | null {
  const needle = normalizeWhitespace(sentence);
  if (!needle) {return null;}

  let start = index.text.indexOf(needle, fromIndex);
  if (start < 0) {start = index.text.indexOf(needle);}
  if (start < 0) {return null;}

  const first = positionAt(index, start);
  const last = positionAt(index, start + needle.length - 1);
  const range = document.createRange();
  if (first.node instanceof Text) {
    range.setStart(first.node, first.offset);
  } else {
    range.setStartBefore(first.node);
    elementBoundedRanges.add(range);
  }
  if (last.node instanceof Text) {
    range.setEnd(last.node, last.offset + 1);
  } else {
    range.setEndAfter(last.node);
    elementBoundedRanges.add(range);
  }
  return { range, endIndex: start + needle.length };
}

/** Element to walk for a range: its common ancestor, or that ancestor's parent for a text node. */
function rangeRootElement(range: Range): Element | null {
  const container = range.commonAncestorContainer;
  return container.nodeType === Node.ELEMENT_NODE ? container as Element : container.parentElement;
}

/** The part of a text node that lies inside `range`, whitespace collapsed. */
function clippedNodeText(range: Range, node: Text): string {
  const start = node === range.startContainer ? range.startOffset : 0;
  const end = node === range.endContainer ? range.endOffset : node.length;
  return node.data.slice(start, end).replace(/\s+/g, " ");
}

/**
 * Readable text inside `range`, built from DOM text with the same walker as
 * the highlight index (so CSS text-transform and table-cell tabs from
 * Selection.toString() don't stop sentences from being found). Selected
 * noise (e.g. an <aside>) is kept: the user chose it. <br> and block edges
 * become "\n".
 */
export function getRangeReadableText(range: Range): string {
  const root = rangeRootElement(range);
  if (!root) {
    return "";
  }
  let text = "";
  for (const part of readableTextParts(root, { skipNoise: false })) {
    if (part === LINE_BREAK) {
      text += text ? LINE_BREAK : "";
    } else if (isSpokenElementPart(part)) {
      text += range.intersectsNode(part.element) ? part.text : "";
    } else if (range.intersectsNode(part)) {
      text += clippedNodeText(range, part);
    }
  }
  return text.trim();
}

/**
 * Text to read for the user's selection, or "" when nothing is selected.
 * Falls back to Selection.toString() when the walker finds nothing (e.g. a
 * selection inside a shadow root).
 */
export function getSelectionReadableText(selection: Selection | null): string {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return "";
  }
  return getRangeReadableText(selection.getRangeAt(0)) || selection.toString().trim();
}

/**
 * Closest ancestor-or-self element of `node` that renders as a block (not
 * inline), used to scope sentence lookup for selected text. Returns
 * document.body when no block ancestor sits below it.
 */
export function findBlockAncestor(node: Node): Element | null {
  let current = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  while (current && current !== document.body) {
    if (!getComputedStyle(current).display.startsWith("inline")) {
      return current;
    }
    current = current.parentElement;
  }
  return current;
}
