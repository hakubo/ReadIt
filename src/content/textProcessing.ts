// Text processing: sentence splitting, URL replacement, and text humanization.
// Exports pure functions that accept dependencies via parameters.

import type { TextReplacementRule } from "@/shared/types";
import { hasSpeakableText } from "@/shared/speakable";

// Intl.Segmenter splits after an abbreviation when the next word is
// capitalised ("(ex. Twitter)", "Dr. Jones"). A segment ending in one of these
// is joined with the following one. Ambiguous ones that often do end a
// sentence ("etc.", "Inc.", "U.S.", "a.m.") are deliberately left out.
const ABBREVIATIONS_BEFORE_WORD = new Set([
  // Introducers and connectives ("ex" is contextual, see isContextualAbbreviationSplit)
  "e.g", "eg", "i.e", "ie", "vs", "cf", "viz", "aka", "a.k.a",
  "approx", "incl", "excl", "esp", "ca",
  // Titles before a name
  "mr", "mrs", "ms", "mx", "dr", "prof", "sr", "jr", "mt", "rev", "hon",
  "sen", "gov", "capt", "lt", "sgt", "supt", "dept",
]);

// Also ordinary words ("no", "art", "sec"), so only joined when a number follows
const ABBREVIATIONS_BEFORE_NUMBER = new Set([
  "no", "nos", "fig", "figs", "vol", "vols", "p", "pp", "ch", "chap", "sec",
  "art", "eq", "ref", "refs", "est", "ed", "eds",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
]);

/** The abbreviation `segment` ends with, lowercased without its final dot, e.g. "(ex." -> "ex". */
function trailingAbbreviation(segment: string): string | null {
  const match = /(?:^|[\s([{"'“‘])((?:[a-z]\.)*[a-z]+)\.$/i.exec(segment);
  return match ? match[1].toLowerCase() : null;
}

/**
 * "ex" and "st" also end ordinary sentences ("my ex. She left", "Main St. Then
 * we turned"), so they only join in context:
 * - "ex" right after an opening bracket ("(ex. Twitter)") or before a number;
 * - "st" as Saint ("St. Louis", "visited St. Louis"), not as Street after a
 *   capitalised or numbered street name ("Main St.", "5th St."). A
 *   capitalised first word ("In St. Louis") is just sentence case.
 */
function isContextualAbbreviationSplit(abbreviation: string, previous: string, next: string): boolean {
  if (abbreviation === "ex") {
    return /[([{]ex\.$/i.test(previous) || /^\d/.test(next);
  }
  if (abbreviation !== "st") {
    return false;
  }
  const wordBefore = /(\S+)\s+st\.$/i.exec(previous);
  if (!wordBefore || /^\S+\s+st\.$/i.test(previous.trim())) {
    return true;
  }
  return !/^[\p{Lu}\d]/u.test(wordBefore[1]);
}

/** True when the split between `previous` and `next` came right after an abbreviation. */
function isAbbreviationSplit(previous: string, next: string): boolean {
  const abbreviation = trailingAbbreviation(previous);
  if (!abbreviation) {
    return false;
  }
  if (ABBREVIATIONS_BEFORE_WORD.has(abbreviation)) {
    return true;
  }
  if (ABBREVIATIONS_BEFORE_NUMBER.has(abbreviation) && /^\d/.test(next)) {
    return true;
  }
  return isContextualAbbreviationSplit(abbreviation, previous, next);
}

/** Re-join segments that were split right after an abbreviation. */
function mergeAbbreviationSplits(segments: string[]): string[] {
  const merged: string[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && isAbbreviationSplit(previous, segment)) {
      merged[merged.length - 1] = `${previous} ${segment}`;
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

/** Split text into sentences using Intl.Segmenter (same logic as offscreen). */
export function splitIntoSentences(text: string): string[] {
  // Split on newlines first to respect paragraph boundaries.
  // Paragraphs ending without sentence-ending punctuation (e.g., with an emoji)
  // would otherwise be merged with the next paragraph by Intl.Segmenter.
  const lines = text.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0);

  try {
    const Segmenter = (Intl as unknown as { Segmenter: new (locale: string, options: { granularity: string }) => { segment: (text: string) => Iterable<{ segment: string }> } }).Segmenter;
    const segmenter = new Segmenter('en', { granularity: 'sentence' });
    const result: string[] = [];
    for (const line of lines) {
      const segments = Array.from(segmenter.segment(line), (s: { segment: string }) => s.segment.trim());
      result.push(...mergeAbbreviationSplits(segments.filter(s => s.length > 0)));
    }
    return result.filter(hasSpeakableText);
  } catch {
    // Fallback for environments without Intl.Segmenter support
    const result: string[] = [];
    for (const line of lines) {
      const sentences = line.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 0);
      result.push(...mergeAbbreviationSplits(sentences));
    }
    return result.filter(hasSpeakableText);
  }
}

/** Apply regex-based text replacement rules. */
export function humanizeText(text: string, rules: TextReplacementRule[]): string {
  let result = text;
  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern) {continue;}
    try {
      result = result.replace(new RegExp(rule.pattern, rule.flags || "gi"), rule.replacement);
    } catch { continue; }
  }
  return result;
}

/** Remove emoji characters from text and collapse leftover whitespace. */
export function stripEmojis(text: string): string {
  return text
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;
// Sentence punctuation right after a URL ("see https://example.com.") is not part of it
const TRAILING_URL_PUNCTUATION = /[.,;:!?]+$/;

function trimUrl(match: string): string {
  return match.replace(TRAILING_URL_PUNCTUATION, "");
}

/** "https://www.github.com/a/b" -> "github.com" */
function spokenHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Replace URLs with their domain: a raw URL read aloud is unlistenable, and
 * fetching page titles was slow and rarely worked. Trailing sentence
 * punctuation stays in the text.
 */
export function replaceUrlsWithDomains(text: string): string {
  return text.replace(URL_PATTERN, (match) => {
    const url = trimUrl(match);
    return spokenHost(url) + match.slice(url.length);
  });
}

// "@jane_doe", "@JaneDoe", "@jane@mastodon.social", "#MachineLearning". The
// lookbehind skips emails ("a@b.com") and "C#"; a letter must follow the sigil
// so "#1" and "@ 5pm" stay as they are.
const HANDLE_PATTERN = /(?<![\w@#])([@#])([A-Za-z][\w.-]*\w)(?:@[\w-]+(?:\.[\w-]+)+)?/g;

/** "jane_doe_1987" -> "jane doe", "JaneDoe" -> "Jane Doe" */
function spokenHandle(name: string): string {
  return name
    .replace(/[_.-]*\d+$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .trim();
}

/**
 * Speak mentions and hashtags as their words: "@jane_doe" -> "jane doe",
 * "#MachineLearning" -> "Machine Learning". The sigil and the fediverse
 * server ("@jane@mastodon.social") aren't read out.
 */
export function cleanHandles(text: string): string {
  return text.replace(HANDLE_PATTERN, (match, _sigil: string, name: string) => spokenHandle(name) || match);
}

const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`;
const DASH = String.raw`\s*[-–—]\s*`;
// "70%-80%", "70-80%"
const PERCENT_RANGE = new RegExp(`(${NUMBER})%?${DASH}(${NUMBER})%`, "g");
// "2020-2024" but not the start of a date ("2024-01-15")
const YEAR_RANGE = /\b((?:19|20)\d\d)\s*[-–]\s*((?:19|20)\d\d)\b(?![-–]\d)/g;
// An en dash between numbers is always a range ("10–20"); a plain hyphen
// is left alone because it is also used in phone numbers, dates and scores
const EN_DASH_RANGE = new RegExp(`(${NUMBER})\\s*–\\s*(${NUMBER})`, "g");

/**
 * Read number ranges with "to": "70%-80%" -> "70 to 80 percent",
 * "2020-2024" -> "2020 to 2024", "10–20" -> "10 to 20". Money ranges are
 * handled with the currency (spokenForms/currency.ts).
 */
export function speakRanges(text: string): string {
  return text
    .replace(PERCENT_RANGE, "$1 to $2 percent")
    .replace(YEAR_RANGE, "$1 to $2")
    .replace(EN_DASH_RANGE, "$1 to $2");
}
