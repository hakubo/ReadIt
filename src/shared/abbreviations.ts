// Expanding <abbr title> text: the first sentence (in read order) that uses
// an abbreviation says what it stands for, "Application Programming
// Interface (API)"; later ones keep "API". Sentences are generated out of
// order (seeks, windowing), so the first use is worked out up front.

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordPattern(abbreviation: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])${escapeRegExp(abbreviation)}(?![\\p{L}\\d])`, "u");
}

/** Sentence index -> abbreviations whose first use in the read is in that sentence. */
export function firstAbbreviationUses(
  sentences: string[],
  abbreviations: Record<string, string>,
): Map<number, string[]> {
  const uses = new Map<number, string[]>();
  for (const abbreviation of Object.keys(abbreviations)) {
    const pattern = wordPattern(abbreviation);
    const index = sentences.findIndex(sentence => pattern.test(sentence));
    if (index >= 0) {
      uses.set(index, [...(uses.get(index) ?? []), abbreviation]);
    }
  }
  return uses;
}

/** "the API" -> "the Application Programming Interface (API)" for each abbreviation given. */
export function expandAbbreviations(sentence: string, abbreviations: string[], titles: Record<string, string>): string {
  let expanded = sentence;
  for (const abbreviation of abbreviations) {
    expanded = expanded.replace(wordPattern(abbreviation), `${titles[abbreviation]} (${abbreviation})`);
  }
  return expanded;
}
