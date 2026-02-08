import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TEXT_REPLACEMENTS,
  HIGHLIGHT_COLORS,
  type TTSSettings,
} from "../shared/types";

describe("DEFAULT_SETTINGS", () => {
  it("has required fields with correct types", () => {
    expect(DEFAULT_SETTINGS.voices).toBeInstanceOf(Array);
    expect(DEFAULT_SETTINGS.voices.length).toBeGreaterThan(0);
    expect(typeof DEFAULT_SETTINGS.speed).toBe("number");
    expect(typeof DEFAULT_SETTINGS.highlightSentences).toBe("boolean");
    expect(typeof DEFAULT_SETTINGS.highlightColor).toBe("string");
    expect(typeof DEFAULT_SETTINGS.autoScroll).toBe("boolean");
    expect(["light", "dark"]).toContain(DEFAULT_SETTINGS.theme);
    expect(DEFAULT_SETTINGS.textReplacements).toBeInstanceOf(Array);
  });

  it("has af_heart as default voice", () => {
    expect(DEFAULT_SETTINGS.voices).toContain("af_heart");
  });

  it("has speed of 1", () => {
    expect(DEFAULT_SETTINGS.speed).toBe(1);
  });

  it("satisfies TTSSettings interface", () => {
    const settings: TTSSettings = DEFAULT_SETTINGS;
    expect(settings).toBeDefined();
  });
});

describe("DEFAULT_TEXT_REPLACEMENTS", () => {
  it("has at least one rule", () => {
    expect(DEFAULT_TEXT_REPLACEMENTS.length).toBeGreaterThan(0);
  });

  it("all rules are enabled by default", () => {
    for (const rule of DEFAULT_TEXT_REPLACEMENTS) {
      expect(rule.enabled).toBe(true);
    }
  });

  it.each([
    { pattern: "\\be\\.g\\.\\s*", input: "e.g. this", expected: /for example/ },
    { pattern: "\\bi\\.e\\.\\s*", input: "i.e. this", expected: /that is/ },
    { pattern: "\\betc\\.", input: "etc.", expected: /etcetera/ },
    { pattern: "&", input: "A & B", expected: /and/ },
  ])("rule for $pattern works on '$input'", ({ pattern, input, expected }) => {
    const rule = DEFAULT_TEXT_REPLACEMENTS.find((r) => r.pattern === pattern);
    expect(rule).toBeDefined();
    const regex = new RegExp(rule!.pattern, rule!.flags || "gi");
    const result = input.replace(regex, rule!.replacement);
    expect(result).toMatch(expected);
  });
});

describe("HIGHLIGHT_COLORS", () => {
  it("has at least one color", () => {
    expect(HIGHLIGHT_COLORS.length).toBeGreaterThan(0);
  });

  it("each color has a name and rgba value", () => {
    for (const color of HIGHLIGHT_COLORS) {
      expect(color.name).toBeTruthy();
      expect(color.value).toMatch(/^rgba\(/);
    }
  });

  it("includes Yellow as the first color", () => {
    expect(HIGHLIGHT_COLORS[0].name).toBe("Yellow");
  });

  it("default highlight color is in the list", () => {
    const values = HIGHLIGHT_COLORS.map((c) => c.value);
    expect(values).toContain(DEFAULT_SETTINGS.highlightColor);
  });
});
