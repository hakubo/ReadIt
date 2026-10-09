// Finds which sentences of a read come from quoted text (<blockquote>, <q>),
// so they can be spoken in a different voice.

import { getReadableText } from "./contentDetection";
import { normalizeWhitespace } from "./textLocator";

const QUOTE_SELECTOR = "blockquote, q";

/** Readable text of every quote in `scope`, plus the quote `scope` itself sits in (a selection inside a blockquote). */
function quoteTexts(scope: Element): string[] {
  const quotes = Array.from(scope.querySelectorAll(QUOTE_SELECTOR));
  const enclosingQuote = scope.closest(QUOTE_SELECTOR);
  if (enclosingQuote) {
    quotes.push(enclosingQuote);
  }
  return quotes
    .map(quote => normalizeWhitespace(getReadableText(quote)))
    .filter(text => text.length > 0);
}

/**
 * Indices of sentences found inside a quote under `root` (or the whole body).
 * Matched by text, the same way highlighting locates sentences, so it works
 * before sentences are located on the page. A sentence that only partly sits
 * in a quote keeps the main voice.
 */
export function findQuotedSentences(sentences: string[], root: Element | null): number[] {
  const scope = root ?? document.body;
  if (!scope) {
    return [];
  }
  const quotes = quoteTexts(scope);
  if (quotes.length === 0) {
    return [];
  }
  const quoted: number[] = [];
  sentences.forEach((sentence, index) => {
    const needle = normalizeWhitespace(sentence);
    if (needle && quotes.some(quote => quote.includes(needle))) {
      quoted.push(index);
    }
  });
  return quoted;
}
