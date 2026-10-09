// Per-read hints from the page's markup: which sentences are in another
// language (lang="fr") and what <abbr>s stand for. Like quoteDetection.ts,
// sentences are matched by text, so this works before they are located.

import type { ReadHints } from "@/shared/types";
import { getReadableText } from "./contentDetection";
import { normalizeWhitespace } from "./textLocator";

interface LanguageRegion {
  language: string;
  text: string;
  depth: number;
}

function elementDepth(element: Element): number {
  let depth = 0;
  for (let current = element.parentElement; current; current = current.parentElement) {
    depth++;
  }
  return depth;
}

function baseLanguage(language: string): string {
  return language.toLowerCase().split("-")[0];
}

/** Language of `scope` itself: its closest [lang] ancestor, else <html lang>. */
function scopeLanguage(scope: Element): string {
  return scope.closest("[lang]")?.getAttribute("lang")?.trim() || document.documentElement.lang || "";
}

/** Elements under `scope` in another language than it, innermost first. */
function languageRegions(scope: Element, pageLanguage: string): LanguageRegion[] {
  const regions: LanguageRegion[] = [];
  for (const element of scope.querySelectorAll("[lang]")) {
    const language = element.getAttribute("lang")?.trim() ?? "";
    const text = normalizeWhitespace(getReadableText(element));
    if (language && text && baseLanguage(language) !== baseLanguage(pageLanguage)) {
      regions.push({ language, text, depth: elementDepth(element) });
    }
  }
  return regions.sort((a, b) => b.depth - a.depth);
}

function findSentenceLanguages(sentences: string[], regions: LanguageRegion[]): Record<number, string> {
  const languages: Record<number, string> = {};
  if (regions.length === 0) {
    return languages;
  }
  sentences.forEach((sentence, index) => {
    const needle = normalizeWhitespace(sentence);
    const region = needle ? regions.find(candidate => candidate.text.includes(needle)) : undefined;
    if (region) {
      languages[index] = region.language;
    }
  });
  return languages;
}

/** abbreviation text -> title, first title wins ("API" -> "Application Programming Interface"). */
function findAbbreviations(scope: Element): Record<string, string> {
  const abbreviations: Record<string, string> = {};
  for (const abbr of scope.querySelectorAll("abbr[title]")) {
    const text = normalizeWhitespace(abbr.textContent ?? "");
    const title = normalizeWhitespace(abbr.getAttribute("title") ?? "");
    if (text && title && title.toLowerCase() !== text.toLowerCase() && !(text in abbreviations)) {
      abbreviations[text] = title;
    }
  }
  return abbreviations;
}

/** Hints for a read of `sentences` taken from `root` (or the whole body). */
export function findReadHints(sentences: string[], root: Element | null): ReadHints {
  const scope = root ?? document.body;
  if (!scope) {
    return {};
  }
  const pageLanguage = scopeLanguage(scope);
  return {
    pageLanguage,
    sentenceLanguages: findSentenceLanguages(sentences, languageRegions(scope, pageLanguage)),
    abbreviations: findAbbreviations(scope),
  };
}
