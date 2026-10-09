// "Config" tab of the debug panel: which content area, text rules and noise
// selectors the current page and read actually use.

import type { TextReplacementRule } from "@/shared/types";
import { isValidSelector } from "../contentDetection";

export type ContentSourceKind = "selection" | "saved selector" | "detected" | "paragraph fallback" | "none";

export interface ContentSource {
  kind: ContentSourceKind;
  root: Element | null;
  textLength: number;
}

export interface RuleUsage {
  rule: TextReplacementRule;
  /** Matches across the current read's sentences; null when the pattern is invalid */
  matches: number | null;
}

export interface NoiseSelectorUsage {
  selector: string;
  pickedOnSite: boolean;
  /** Elements matching on the page; null when the selector is invalid */
  pageMatches: number | null;
}

export interface DebugConfig {
  content: ContentSource;
  savedContentSelector: string | null;
  rules: RuleUsage[];
  noise: NoiseSelectorUsage[];
}

/** "article#post.entry-content" — enough to find the element in DevTools. */
export function describeElement(element: Element | null): string {
  if (!element) {
    return "—";
  }
  const id = element.id ? `#${element.id}` : "";
  const classes = Array.from(element.classList).slice(0, 3).map(name => `.${name}`).join("");
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function countMatches(rule: TextReplacementRule, sentences: string[]): number | null {
  try {
    const flags = (rule.flags || "gi").includes("g") ? rule.flags || "gi" : `${rule.flags}g`;
    const pattern = new RegExp(rule.pattern, flags);
    return sentences.reduce((total, sentence) => total + (sentence.match(pattern)?.length ?? 0), 0);
  } catch {
    return null;
  }
}

export function ruleUsage(rules: TextReplacementRule[], sentences: string[]): RuleUsage[] {
  return rules.map(rule => ({ rule, matches: rule.enabled ? countMatches(rule, sentences) : 0 }));
}

export function noiseUsage(globalSelectors: string[], siteSelectors: string[]): NoiseSelectorUsage[] {
  const usage = (selector: string, pickedOnSite: boolean): NoiseSelectorUsage => ({
    selector,
    pickedOnSite,
    pageMatches: isValidSelector(selector) ? document.querySelectorAll(selector).length : null,
  });
  return [...globalSelectors.map(selector => usage(selector, false)), ...siteSelectors.map(selector => usage(selector, true))];
}

const OUTLINE_MS = 2000;

/** Briefly outline an element on the page (fixed overlay, nothing on the element itself changes). */
export function flashOutline(element: Element | null): void {
  if (!element) {
    return;
  }
  element.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  const rect = element.getBoundingClientRect();
  const outline = document.createElement("div");
  outline.style.cssText = `
    position: fixed; left: ${rect.left}px; top: ${rect.top}px; width: ${rect.width}px; height: ${rect.height}px;
    outline: 3px dashed #f472b6; outline-offset: 2px; pointer-events: none; z-index: 2147483646;
  `;
  document.documentElement.appendChild(outline);
  setTimeout(() => outline.remove(), OUTLINE_MS);
}
