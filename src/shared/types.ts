export interface TextReplacementRule {
  pattern: string;      // regex pattern string
  replacement: string;  // replacement (supports $1, $2 capture groups)
  flags?: string;       // regex flags, default "gi"
  enabled: boolean;
}

export const DEFAULT_TEXT_REPLACEMENTS: TextReplacementRule[] = [
  { pattern: "~(\\d)", replacement: "around $1", flags: "g", enabled: true },
  { pattern: "(\\d)k\\b", replacement: "$1 thousand", flags: "gi", enabled: true },
  { pattern: "\\$(\\d[\\d,.]*)", replacement: "$1 dollars", flags: "g", enabled: true },
  { pattern: "/\\s*(month|year|day|week|hour|minute|second|min|sec|mo|yr|hr|user|seat|person|page|request)\\b", replacement: " per $1", flags: "gi", enabled: true },
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
}

export const DEFAULT_NOISE_SELECTORS: string[] = [
  "nav", "footer", "header", "aside",
  "[role='navigation']", "[role='banner']", "[role='contentinfo']", "[role='complementary']",
  ".sidebar", ".nav", ".menu", ".footer", ".header", ".ad", ".ads", ".advertisement",
  ".comment", ".comments", ".widget", ".social", ".share", ".related",
  "script", "style", "noscript", "iframe", "svg", "form",
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
};

export interface SitePrefs {
  playerPosition?: { x: number; y: number };
  enabled?: boolean;
  settings?: TTSSettings;
  contentSelector?: string;
}

export const HIGHLIGHT_COLORS = [
  { name: "Yellow", value: "rgba(254, 240, 138, 0.55)" },
  { name: "Green", value: "rgba(187, 247, 208, 0.55)" },
  { name: "Blue", value: "rgba(191, 219, 254, 0.55)" },
  { name: "Pink", value: "rgba(251, 207, 232, 0.55)" },
  { name: "Orange", value: "rgba(254, 215, 170, 0.55)" },
  { name: "Purple", value: "rgba(221, 214, 254, 0.55)" },
];
