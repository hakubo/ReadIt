// Roman numerals after a capitalised word: "World War II" -> "World War 2",
// "Final Fantasy VII" -> "Final Fantasy 7", "Henry VIII" -> "Henry the
// Eighth". espeak says "World War roman two". "I" is too common a word to
// convert, and a lone "V"/"X" only converts after a monarch's name or a
// numbering noun ("Part V").

// Monarchs and popes: said as an ordinal ("Elizabeth the Second").
// After any other capitalised word it's a number ("Rocky 2", "Part 4").
const REGNAL_NAMES = new Set([
  "henry", "edward", "george", "william", "charles", "elizabeth", "james", "richard", "mary", "anne",
  "louis", "philip", "philippe", "francis", "francois", "henri", "napoleon", "frederick", "friedrich",
  "wilhelm", "ludwig", "otto", "leopold", "joseph", "ferdinand", "maximilian", "rudolf", "albert",
  "carlos", "juan", "felipe", "alfonso", "pedro", "manuel", "fernando", "isabella", "isabel",
  "gustav", "gustaf", "christian", "frederik", "olav", "harald", "haakon", "carl", "margrethe",
  "peter", "alexander", "nicholas", "ivan", "catherine", "paul", "john", "pius", "leo", "benedict",
  "gregory", "innocent", "clement", "boniface", "urban", "sixtus", "julius", "adrian", "celestine",
  "casimir", "sigismund", "stanislaus", "wladyslaw", "boleslaw", "mieszko", "augustus", "jan",
  "willem", "constantine", "ptolemy", "ramesses", "rameses", "thutmose", "amenhotep", "rama",
  "victor", "umberto", "vittorio", "kamehameha", "selim", "mehmed", "suleiman", "murad",
]);

const NUMBERED_NOUNS = new Set([
  "war", "part", "chapter", "volume", "vol", "book", "act", "scene", "phase", "stage", "type", "class",
  "level", "episode", "season", "section", "article", "title", "grade", "tier", "round",
  "edition", "series", "mark", "mk", "version", "appendix", "annex", "canto", "psalm",
]);

// Sentence-initial words before an abbreviation ("The IV drip", "An XL shirt")
const NOT_A_NAME = new Set([
  "the", "a", "an", "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their",
  "in", "on", "at", "to", "of", "for", "and", "or", "but", "with", "by", "from", "via", "no", "any", "each",
]);

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };

function romanToNumber(numeral: string): number {
  let total = 0;
  for (let index = 0; index < numeral.length; index++) {
    const value = ROMAN_VALUES[numeral[index]];
    const next = ROMAN_VALUES[numeral[index + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return total;
}

const ORDINAL_WORDS = [
  "", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth",
  "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth",
  "Eighteenth", "Nineteenth", "Twentieth",
];
const TENS_WORDS: Record<number, string> = { 2: "Twenty", 3: "Thirty" };

function ordinalWord(value: number): string {
  if (value <= 20) {
    return ORDINAL_WORDS[value];
  }
  const ones = value % 10;
  const tens = Math.floor(value / 10);
  return ones === 0 ? `${TENS_WORDS[tens].slice(0, -1)}ieth` : `${TENS_WORDS[tens]}-${ORDINAL_WORDS[ones]}`;
}

// Valid numerals 1–39, written canonically
const NUMERAL = String.raw`X{0,3}(?:IX|IV|V?I{0,3})`;
const ROMAN_AFTER_WORD = new RegExp(String.raw`\b(\p{Lu}[\p{L}'’-]*)(\s+)(${NUMERAL})\b(?![-'’]\p{L})`, "gu");

function convert(match: string, word: string, space: string, numeral: string): string {
  if (!numeral) {
    return match;
  }
  if (NOT_A_NAME.has(word.toLowerCase())) {
    return match;
  }
  const isRegnal = REGNAL_NAMES.has(word.toLowerCase());
  const allowsSingleLetter = isRegnal || NUMBERED_NOUNS.has(word.toLowerCase());
  if (numeral === "I" || (numeral.length < 2 && !allowsSingleLetter)) {
    return match;
  }
  const value = romanToNumber(numeral);
  return isRegnal ? `${word}${space}the ${ordinalWord(value)}` : `${word}${space}${value}`;
}

export function speakRomanNumerals(text: string): string {
  return text.replace(ROMAN_AFTER_WORD, convert);
}
