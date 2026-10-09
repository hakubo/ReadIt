export interface TextReplacementRule {
  pattern: string;      // regex pattern string
  replacement: string;  // replacement (supports $1, $2 capture groups)
  flags?: string;       // regex flags, default "gi"
  enabled: boolean;
}

export const DEFAULT_TEXT_REPLACEMENTS: TextReplacementRule[] = [
  { pattern: "~(\\d)", replacement: "around $1", flags: "g", enabled: true },
  { pattern: "(\\d)k\\b", replacement: "$1 thousand", flags: "gi", enabled: true },
  { pattern: "/\\s*(month|year|day|week|hour|minute|second|min|sec|mo|yr|hr)\\b", replacement: " per $1", flags: "gi", enabled: true },
  { pattern: "(\\d)x\\b", replacement: "$1 times", flags: "g", enabled: true },
  { pattern: "(\\d)\\+", replacement: "$1 plus", flags: "g", enabled: true },
  { pattern: "\\bw\\/o\\b", replacement: "without", flags: "gi", enabled: true },
  { pattern: "\\bw\\/", replacement: "with ", flags: "gi", enabled: true },
  { pattern: "\\be\\.g\\.\\s*", replacement: "for example, ", flags: "gi", enabled: true },
  { pattern: "\\bi\\.e\\.\\s*", replacement: "that is, ", flags: "gi", enabled: true },
  { pattern: "\\betc\\.", replacement: "etcetera", flags: "gi", enabled: true },
  { pattern: "\\bvs\\.?\\b", replacement: "versus", flags: "gi", enabled: true },
  { pattern: "&", replacement: " and ", flags: "g", enabled: true },
  { pattern: "\\s*—\\s*", replacement: ", ", flags: "g", enabled: true },
  { pattern: "\\s+[-–]\\s+", replacement: ", ", flags: "g", enabled: true },
  { pattern: "\\s{2,}", replacement: " ", flags: "g", enabled: true },
];

export interface TTSSettings {
  voices: string[];
  speed: number;
  highlightSentences: boolean;
  highlightColor: string;
  autoScroll: boolean;
  theme: "light" | "dark";
  textReplacements: TextReplacementRule[];
  noiseSelectors: string[];
  skipEmojis: boolean;
  /** Voice for <blockquote>/<q> text: "auto" (contrasting voice), "off" (main voice) or a voice id. */
  quoteVoice: string;
  /** Read image descriptions (alt text). */
  readAltText: boolean;
  /** Skip code blocks (<pre>). */
  skipCode: boolean;
  /** Skip struck-out text (<del>, <s>). */
  skipStrikethrough: boolean;
  /** Read text marked with another language (lang="fr") in a voice for that language. */
  switchVoiceByLanguage: boolean;
  /** Say what an <abbr title> stands for the first time it appears in a read. */
  expandAbbreviations: boolean;
}

// Not listed on purpose: "form" (ASP.NET pages wrap the whole page in one) and
// ".comment" (Hacker News marks every comment with it; comment sections are
// caught by their containers below).
export const DEFAULT_NOISE_SELECTORS: string[] = [
  "nav", "footer",
  // An <article>'s or <main>'s own <header> holds the headline; only site headers are noise.
  "header:not(article header, main header)",
  // An <aside> inside an article is usually a callout that belongs to the text.
  "aside:not(article aside)",
  "[role='navigation']", "[role='banner']", "[role='contentinfo']", "[role='complementary']", "[role='search']",
  ".sidebar", ".nav", ".menu", ".footer", ".header", ".ad", ".ads", ".advertisement",
  ".comments", "#comments", ".comments-area", ".comment-respond", "#disqus_thread",
  ".widget", ".social", ".share", ".related",
  ".breadcrumb", ".breadcrumbs", ".byline",
  ".newsletter", ".newsletter-signup", ".subscribe", ".subscription-widget-wrap",
  // Cookie and consent banners (OneTrust, Cookiebot, cookieconsent, Quantcast, Didomi, Funding Choices)
  "#onetrust-consent-sdk", "#CybotCookiebotDialog", ".cc-window", ".qc-cmp2-container", "#didomi-host", ".fc-consent-root",
  ".cookie-banner", ".cookie-consent", "#cookie-banner", "#cookie-consent",
  // Footnote back-links and code copy buttons
  ".footnote-backref", "[role='doc-backlink']", ".copy-button", "clipboard-copy",
  "script", "style", "noscript", "iframe", "svg",
];

export const DEFAULT_SETTINGS: TTSSettings = {
  voices: ["af_heart"],
  speed: 1,
  highlightSentences: true,
  highlightColor: "rgba(254, 240, 138, 0.55)", // Light yellow with transparency
  autoScroll: true,
  theme: "dark",
  textReplacements: DEFAULT_TEXT_REPLACEMENTS,
  noiseSelectors: DEFAULT_NOISE_SELECTORS,
  skipEmojis: false,
  quoteVoice: "auto",
  readAltText: true,
  skipCode: true,
  skipStrikethrough: true,
  switchVoiceByLanguage: true,
  expandAbbreviations: false,
};

/** What the page's markup says about a read's sentences, sent with GENERATE_TTS. */
export interface ReadHints {
  /** lang of the read's content (closest [lang] ancestor or <html lang>), e.g. "en", "fr-CA". */
  pageLanguage?: string;
  /** Sentences inside an element with a different lang, by index. */
  sentenceLanguages?: Record<number, string>;
  /** <abbr title> on the page: abbreviation text -> what it stands for. */
  abbreviations?: Record<string, string>;
}

// Silence appended after each generated sentence. Shared so the content
// script's duration estimate matches what offscreen actually produces.
export const SENTENCE_PAUSE_MS = 150;

export interface SitePrefs {
  playerPosition?: { x: number; y: number };
  enabled?: boolean;
  settings?: TTSSettings;
  contentSelector?: string;
  /** Noise selectors picked with the element picker on this site; added to the settings list. */
  noiseSelectors?: string[];
}

export const HIGHLIGHT_COLORS = [
  { name: "Yellow", value: "rgba(254, 240, 138, 0.55)" },
  { name: "Green", value: "rgba(187, 247, 208, 0.55)" },
  { name: "Blue", value: "rgba(191, 219, 254, 0.55)" },
  { name: "Pink", value: "rgba(251, 207, 232, 0.55)" },
  { name: "Orange", value: "rgba(254, 215, 170, 0.55)" },
  { name: "Purple", value: "rgba(221, 214, 254, 0.55)" },
];
