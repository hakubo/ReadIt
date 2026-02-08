// Text processing: sentence splitting, URL replacement, and text humanization.
// Exports pure functions that accept dependencies via parameters.

import type { TextReplacementRule } from "@/shared/types";

/** Split text into sentences using Intl.Segmenter (same logic as offscreen). */
export function splitIntoSentences(text: string): string[] {
  let result: string[];
  try {
    // Intl.Segmenter provides proper sentence boundary detection
    const Segmenter = (Intl as unknown as { Segmenter: new (locale: string, options: { granularity: string }) => { segment: (text: string) => Iterable<{ segment: string }> } }).Segmenter;
    const segmenter = new Segmenter('en', { granularity: 'sentence' });
    const segments = segmenter.segment(text);
    result = Array.from(segments, (s: { segment: string }) => s.segment.trim()).filter(s => s.length > 0);
  } catch {
    // Fallback for environments without Intl.Segmenter support
    const sentences = text.split(/(?<=[.!?])\s+/);
    result = sentences.map(s => s.trim()).filter(s => s.length > 0);
  }

  return result;
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

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/g;
  return text.match(urlRegex) || [];
}

/**
 * Replace URLs in text with their page titles.
 * Accepts a sendMessage function to decouple from chrome.runtime.
 */
export async function replaceUrlsWithTitles(
  text: string,
  sendMessage: (msg: Record<string, unknown>) => Promise<unknown>,
): Promise<string> {
  const urls = extractUrls(text);
  if (urls.length === 0) {return text;}

  let result = text;
  const titles = await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await sendMessage({ type: 'FETCH_PAGE_TITLE', url }) as { title?: string } | undefined;
        return response?.title || null;
      } catch { return null; }
    }),
  );

  for (let i = 0; i < urls.length; i++) {
    if (titles[i]) {result = result.replace(urls[i], titles[i]!);}
  }
  return result;
}
