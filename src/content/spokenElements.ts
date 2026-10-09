// Elements whose meaning is in markup rather than in their text: an image's
// alt text, a <time>'s machine date, a <kbd> key, a <sup> exponent, a
// <meter>'s value, a formula. readableTextParts() yields what to say for
// them instead of walking their children, so the spoken text and the
// highlight index stay identical (the highlight covers the whole element).
//
// Also the user's "skip" options (code blocks, struck-out text), which
// extend the non-readable selector.

export interface ReadingOptions {
  /** Read image descriptions (alt text). */
  readAltText: boolean;
  /** Skip code blocks (<pre>). Inline `code` stays: removing it breaks the sentence. */
  skipCode: boolean;
  /** Skip struck-out text (<del>, <s>, <strike>): "was $99, now $49" reads as "now $49". */
  skipStrikethrough: boolean;
}

export const DEFAULT_READING_OPTIONS: ReadingOptions = {
  readAltText: true,
  skipCode: true,
  skipStrikethrough: true,
};

let readingOptions: ReadingOptions = DEFAULT_READING_OPTIONS;

// Matches nothing; used when no skip option is on, since matches("") throws
const MATCH_NOTHING_SELECTOR = ":not(*)";
export let READING_SKIP_SELECTOR = skipSelectorFor(DEFAULT_READING_OPTIONS);

function skipSelectorFor(options: ReadingOptions): string {
  const selectors: string[] = [];
  if (options.skipCode) {
    selectors.push("pre");
  }
  if (options.skipStrikethrough) {
    selectors.push("del", "s", "strike");
  }
  return selectors.length > 0 ? selectors.join(", ") : MATCH_NOTHING_SELECTOR;
}

/** Apply the user's reading options (called when settings load, like setNoiseSelector). */
export function setReadingOptions(options: Partial<ReadingOptions>): void {
  readingOptions = { ...DEFAULT_READING_OPTIONS, ...options };
  READING_SKIP_SELECTOR = skipSelectorFor(readingOptions);
}

/** What to say for an element instead of its text. `block` parts are their own sentence. */
export interface SpokenElement {
  element: Element;
  text: string;
  block: boolean;
}

function inline(element: Element, text: string): SpokenElement {
  return { element, text, block: false };
}

/** Ends with sentence punctuation so the alt text is a sentence of its own. */
function asSentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

// Below this an image is an icon or emoji inside a line of text
const BLOCK_IMAGE_MIN_SIZE_PX = 48;

function imageSize(element: Element): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }
  // Not laid out yet (lazy images, tests): fall back to the attributes
  return { width: Number(element.getAttribute("width")) || 0, height: Number(element.getAttribute("height")) || 0 };
}

/** A figure's caption often repeats the alt text; reading both is redundant. */
function repeatsCaption(element: Element, alt: string): boolean {
  const caption = element.closest("figure")?.querySelector("figcaption")?.textContent ?? "";
  return caption.replace(/\s+/g, " ").trim().toLowerCase() === alt.toLowerCase();
}

function spokenImage(element: Element): SpokenElement | null {
  const description = (element.getAttribute("alt") ?? element.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim();
  if (!readingOptions.readAltText || !description || repeatsCaption(element, description)) {
    return null;
  }
  const { width, height } = imageSize(element);
  if (width < BLOCK_IMAGE_MIN_SIZE_PX || height < BLOCK_IMAGE_MIN_SIZE_PX) {
    // Spaced, so an icon between words doesn't glue to them
    return inline(element, ` ${description} `);
  }
  return { element, text: `Image: ${asSentence(description)}`, block: true };
}

const NUMERIC_DATE = /\b\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/;
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

/**
 * "15/01/24" is ambiguous; the datetime attribute isn't. Only numeric dates
 * are replaced: "3 days ago" or "January 5" already read well.
 */
function spokenTime(element: Element): SpokenElement | null {
  const visible = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  const isoDate = ISO_DATE.exec(element.getAttribute("datetime") ?? "")?.[1];
  if (!isoDate || !NUMERIC_DATE.test(visible)) {
    return null;
  }
  return inline(element, visible.replace(NUMERIC_DATE, isoDate));
}

const KEY_NAMES: Record<string, string> = {
  ctrl: "Control", ctl: "Control", "⌃": "Control", cmd: "Command", "⌘": "Command",
  opt: "Option", "⌥": "Option", alt: "Alt", "⇧": "Shift", shift: "Shift",
  esc: "Escape", del: "Delete", "⌫": "Backspace", bksp: "Backspace", ins: "Insert",
  pgup: "Page Up", pgdn: "Page Down", "⏎": "Enter", "↵": "Enter", "↩": "Return", "⇥": "Tab",
  "↑": "Up", "↓": "Down", "←": "Left", "→": "Right", win: "Windows", fn: "Function",
};

/** "Ctrl" -> "Control", "⌘" -> "Command". Nested <kbd>s are handled per key. */
function spokenKey(element: Element): SpokenElement | null {
  if (element.querySelector("kbd")) {
    return null;
  }
  const key = (element.textContent ?? "").trim();
  const name = KEY_NAMES[key.toLowerCase()] ?? KEY_NAMES[key];
  return name ? inline(element, name) : null;
}

const POWER_NAMES: Record<string, string> = { "2": "squared", "3": "cubed" };

/** The word right before the element (from its previous text), e.g. "m" in "5 m<sup>2</sup>". */
function wordBefore(element: Element): string {
  const previous = element.previousSibling?.textContent ?? "";
  return /(\S*)$/.exec(previous)?.[1] ?? "";
}

/**
 * A number in <sup> after a number, a single letter or a unit is an exponent
 * ("m²", "10⁶", "x²"); after a word it's a footnote marker, which isn't read.
 * Ordinals ("1<sup>st</sup>") and ™ are left as they are.
 */
function spokenSuperscript(element: Element): SpokenElement | null {
  const power = (element.textContent ?? "").trim();
  if (!/^[-−]?\d+$/.test(power)) {
    return null;
  }
  const before = wordBefore(element);
  const isExponent = /(?:^|[^\p{L}])(?:\d|\p{L}|cm|mm|km|ft|in)\)?$/u.test(before) && !/\p{L}{3,}$/u.test(before);
  if (!isExponent) {
    return inline(element, "");
  }
  const name = POWER_NAMES[power] ?? `to the power of ${power.replace("−", "minus ").replace("-", "minus ")}`;
  return inline(element, ` ${name}`);
}

/** <meter value="0.6"> / <progress value="3" max="4">: the fallback text inside isn't rendered. */
function spokenGauge(element: Element): SpokenElement | null {
  const value = Number(element.getAttribute("value"));
  if (!element.hasAttribute("value") || Number.isNaN(value)) {
    return inline(element, "");
  }
  const min = Number(element.getAttribute("min")) || 0;
  const max = Number(element.getAttribute("max")) || 1;
  const percent = Math.round(((value - min) / (max - min)) * 100);
  return inline(element, `${percent} percent`);
}

/** MathML text is a jumble of symbols; use its description if there is one. */
function spokenMath(element: Element): SpokenElement {
  const description = element.getAttribute("alttext") ?? element.getAttribute("aria-label");
  return inline(element, description?.trim() || "formula");
}

/** What to say instead of `element`'s text, or null to walk its children as usual. */
export function spokenElement(element: Element): SpokenElement | null {
  switch (element.localName) {
    case "img":
      return spokenImage(element);
    case "time":
      return spokenTime(element);
    case "kbd":
      return spokenKey(element);
    case "sup":
      return spokenSuperscript(element);
    case "meter":
    case "progress":
      return spokenGauge(element);
    case "math":
      return spokenMath(element);
    default:
      return element.getAttribute("role") === "img" ? spokenImage(element) : null;
  }
}
