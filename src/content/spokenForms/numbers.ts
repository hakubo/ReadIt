// Number shapes espeak reads symbol by symbol: "24/7", "1/2", "4.5/5", "#1",
// "1920x1080", "1990s", "pages 3-5", "10-20 minutes", "No. 5", "fig. 2".

import { UNIT_ALTERNATION } from "./units";

const FRACTIONS: Record<string, string> = {
  "1/2": "one half", "1/3": "one third", "2/3": "two thirds",
  "1/4": "one quarter", "3/4": "three quarters",
  "1/8": "one eighth", "3/8": "three eighths", "5/8": "five eighths", "7/8": "seven eighths",
  "½": "one half", "⅓": "one third", "⅔": "two thirds", "¼": "one quarter", "¾": "three quarters",
  "⅛": "one eighth", "⅜": "three eighths", "⅝": "five eighths", "⅞": "seven eighths",
};

// Not part of a longer number, date or path
const BEFORE = String.raw`(?<![\d./])`;
const AFTER = String.raw`(?![\d/])`;

/** "1 1/2" -> "1 and a half" */
function mixedFraction(whole: string, fraction: string): string {
  return `${whole} and ${fraction.replace(/^one /, "a ")}`;
}

function speakFractions(text: string): string {
  return text
    // "1 1/2 cups" -> "1 and a half cups"
    .replace(new RegExp(String.raw`${BEFORE}(\d+)\s(\d\/\d)${AFTER}`, "g"), (match, whole: string, fraction: string) =>
      FRACTIONS[fraction] ? mixedFraction(whole, FRACTIONS[fraction]) : match)
    .replace(new RegExp(String.raw`${BEFORE}(\d\/\d)${AFTER}`, "g"), (match, fraction: string) => FRACTIONS[fraction] ?? match)
    .replace(/(\d)?([½⅓⅔¼¾⅛⅜⅝⅞])/g, (_match, whole: string | undefined, glyph: string) =>
      whole ? mixedFraction(whole, FRACTIONS[glyph]) : FRACTIONS[glyph]);
}

function speakSlashes(text: string): string {
  return text
    .replace(new RegExp(String.raw`${BEFORE}24\/7${AFTER}`, "g"), "24 7")
    // "50/50"
    .replace(new RegExp(String.raw`${BEFORE}(\d+)\/\1${AFTER}`, "g"), "$1 $1")
    // Scores and ratings: "4.5/5", "8/10", "95/100"
    .replace(new RegExp(String.raw`${BEFORE}(\d+(?:\.\d+)?)\/(5|10|100)${AFTER}`, "g"), (match, score: string, outOf: string) =>
      Number(score) <= Number(outOf) ? `${score} out of ${outOf}` : match);
}

const TENS: Record<string, string> = {
  "1": "tens", "2": "twenties", "3": "thirties", "4": "forties", "5": "fifties",
  "6": "sixties", "7": "seventies", "8": "eighties", "9": "nineties",
};
const CENTURIES: Record<string, string> = {
  "10": "ten", "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen", "15": "fifteen",
  "16": "sixteen", "17": "seventeen", "18": "eighteen", "19": "nineteen", "20": "twenty",
};

/** "1990s" -> "nineteen nineties", "2000s" -> "two thousands", "'80s" -> "eighties" */
function speakDecades(text: string): string {
  return text
    .replace(/\b(1\d|20)(\d)0'?s\b/g, (_match, century: string, decade: string) => {
      if (decade === "0") {
        return century === "20" ? "two thousands" : `${CENTURIES[century]} hundreds`;
      }
      return `${CENTURIES[century]} ${TENS[decade]}`;
    })
    .replace(/(?<![\w'’])['’]?([1-9])0'?s\b/g, (_match, decade: string) => TENS[decade]);
}

const RANGE_NOUNS = String.raw`pages?|chapters?|verses?|ages?|steps?|items?|slides?|lines?|sections?|levels?|rounds?|weeks?|days?|years?|episodes?|seasons?`;
const UNIT_WORDS = String.raw`seconds?|minutes?|hours?|days?|weeks?|months?|years?|decades?|people|persons?|times|percent|points?|miles?|meters?|metres?|inches|feet|pounds?|euros?|dollars?|items?|pages?|words?|users?|${UNIT_ALTERNATION}`;

/** Hyphen ranges espeak would read as "dash", only where a range is certain: after "pages"-like nouns or before a unit. */
function speakHyphenRanges(text: string): string {
  return text
    .replace(new RegExp(String.raw`\b(${RANGE_NOUNS})\s+(\d+)-(\d+)\b`, "gi"), "$1 $2 to $3")
    .replace(new RegExp(String.raw`(?<![\d.,/-])(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(?=\s?(?:${UNIT_WORDS})(?![\p{L}\d]))`, "gu"), "$1 to $2");
}

function speakNumberAbbreviations(text: string): string {
  return text
    .replace(/(?<![\w&#])#(\d)/g, "number $1")
    .replace(/\b[Nn]o\.\s?(?=\d)/g, "number ")
    .replace(/\bpp\.\s?(?=\d)/g, "pages ")
    .replace(/\bp\.\s?(?=\d)/g, "page ")
    .replace(/\b[Ff]igs?\.\s?(?=\d)/g, (match) => (match.toLowerCase().startsWith("figs") ? "figures " : "figure "))
    .replace(/\b[Vv]ol\.\s?(?=\d)/g, "volume ")
    .replace(/\b[Cc]h\.\s?(?=\d)/g, "chapter ")
    .replace(/\b[Ee]q\.\s?(?=\d)/g, "equation ");
}

/** "1920x1080" -> "1920 by 1080". "×" stays: espeak reads it as "times". */
function speakDimensions(text: string): string {
  return text.replace(/(?<![\d.])(?!0x)(\d+)\s?x\s?(\d+)(?!\d|\.\d)/g, "$1 by $2");
}

export function speakNumberShapes(text: string): string {
  const withoutAbbreviations = speakNumberAbbreviations(text);
  return speakHyphenRanges(speakDecades(speakDimensions(speakSlashes(speakFractions(withoutAbbreviations)))));
}
