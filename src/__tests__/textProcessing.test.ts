import { describe, it, expect, vi } from "vitest";
import { splitIntoSentences, humanizeText, replaceUrlsWithTitles } from "../content/textProcessing";
import type { TextReplacementRule } from "../shared/types";

describe("splitIntoSentences", () => {
  it.each([
    ["Hello world. How are you?", ["Hello world.", "How are you?"]],
    ["One sentence.", ["One sentence."]],
    ["First! Second? Third.", ["First!", "Second?", "Third."]],
    ["", []],
    ["   ", []],
  ])("splits %j into %j", (input, expected) => {
    expect(splitIntoSentences(input)).toEqual(expected);
  });

  it("handles text without punctuation", () => {
    const result = splitIntoSentences("Hello world");
    expect(result.length).toBeGreaterThan(0);
    expect(result.join(" ")).toBe("Hello world");
  });
});

describe("humanizeText", () => {
  const enabledRule = (pattern: string, replacement: string, flags = "gi"): TextReplacementRule => ({
    pattern,
    replacement,
    flags,
    enabled: true,
  });

  const disabledRule = (pattern: string, replacement: string): TextReplacementRule => ({
    pattern,
    replacement,
    flags: "gi",
    enabled: false,
  });

  it.each([
    {
      name: "applies a simple replacement",
      text: "e.g. this works",
      rules: [enabledRule("\\be\\.g\\.\\s*", "for example, ")],
      expected: "for example, this works",
    },
    {
      name: "skips disabled rules",
      text: "e.g. this works",
      rules: [disabledRule("\\be\\.g\\.\\s*", "for example, ")],
      expected: "e.g. this works",
    },
    {
      name: "applies multiple rules in sequence",
      text: "~5k users",
      rules: [
        enabledRule("~(\\d)", "around $1", "g"),
        enabledRule("(\\d)k\\b", "$1 thousand"),
      ],
      expected: "around 5 thousand users",
    },
    {
      name: "skips rules with empty patterns",
      text: "hello",
      rules: [enabledRule("", "replaced")],
      expected: "hello",
    },
    {
      name: "skips rules with invalid regex",
      text: "hello",
      rules: [enabledRule("[invalid", "replaced")],
      expected: "hello",
    },
  ])("$name", ({ text, rules, expected }) => {
    expect(humanizeText(text, rules)).toBe(expected);
  });

  it("returns original text with empty rules array", () => {
    expect(humanizeText("hello world", [])).toBe("hello world");
  });
});

describe("replaceUrlsWithTitles", () => {
  it("returns text unchanged when no URLs are present", async () => {
    const sendMessage = vi.fn();
    const result = await replaceUrlsWithTitles("Hello world", sendMessage);
    expect(result).toBe("Hello world");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("replaces URLs with fetched titles", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ title: "Example Site" });
    const text = "Check out https://example.com for more info";
    const result = await replaceUrlsWithTitles(text, sendMessage);
    expect(result).toBe("Check out Example Site for more info");
    expect(sendMessage).toHaveBeenCalledWith({
      type: "FETCH_PAGE_TITLE",
      url: "https://example.com",
    });
  });

  it("keeps URL when title fetch fails", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("Network error"));
    const text = "Visit https://example.com today";
    const result = await replaceUrlsWithTitles(text, sendMessage);
    expect(result).toBe("Visit https://example.com today");
  });

  it("keeps URL when response has no title", async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const text = "Visit https://example.com today";
    const result = await replaceUrlsWithTitles(text, sendMessage);
    expect(result).toBe("Visit https://example.com today");
  });
});
