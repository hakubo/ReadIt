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

  it("splits paragraphs joined by newlines even without terminal punctuation", () => {
    const text = "First paragraph ends with emoji 🎆\nSecond paragraph starts here.";
    const result = splitIntoSentences(text);
    expect(result.length).toBe(2);
    expect(result[0]).toBe("First paragraph ends with emoji 🎆");
    expect(result[1]).toBe("Second paragraph starts here.");
  });

  it("splits multiple newline-separated paragraphs without periods", () => {
    const text = "Line one\nLine two\nLine three";
    const result = splitIntoSentences(text);
    expect(result).toEqual(["Line one", "Line two", "Line three"]);
  });

  it("handles newlines within punctuated text", () => {
    const text = "First sentence. Second sentence.\nThird sentence. Fourth sentence.";
    const result = splitIntoSentences(text);
    expect(result).toEqual(["First sentence.", "Second sentence.", "Third sentence.", "Fourth sentence."]);
  });

  it("ignores blank lines between paragraphs", () => {
    const text = "Paragraph one.\n\n\nParagraph two.";
    const result = splitIntoSentences(text);
    expect(result).toEqual(["Paragraph one.", "Paragraph two."]);
  });

  it("handles text with em dashes", () => {
    const text = "It\u2019s meant to be a two-way evaluation \u2014 we\u2019re learning about you.";
    const result = splitIntoSentences(text);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(text);
  });

  it("handles text ending with a colon", () => {
    const text = "There\u2019s no specific preparation required, but a few things that help:";
    const result = splitIntoSentences(text);
    expect(result).toEqual([text]);
  });

  it("handles text with smart/curly quotes", () => {
    const text = "\u201CThis is quoted.\u201D She said it was fine.";
    const result = splitIntoSentences(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.join(" ")).toContain("This is quoted.");
  });

  it("handles text with abbreviations", () => {
    const text = "Dr. Smith went to Washington. He arrived on Monday.";
    const result = splitIntoSentences(text);
    // Intl.Segmenter may or may not split on "Dr." depending on implementation.
    // The key guarantee: all text is preserved and the last sentence is correct.
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.join(" ")).toContain("Dr.");
    expect(result[result.length - 1]).toContain("arrived on Monday");
  });

  it("handles text with ellipsis character", () => {
    const text = "Wait\u2026 what happened? Then she left.";
    const result = splitIntoSentences(text);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toContain("Wait");
  });

  it("handles text with numbers containing periods", () => {
    const text = "The version is 2.0. It was released yesterday.";
    const result = splitIntoSentences(text);
    expect(result.length).toBe(2);
    expect(result[0]).toContain("2.0");
  });

  it("handles bullet-point text without terminal punctuation", () => {
    const text = "Check out Q&A document we sent you, it covers common questions about the team";
    const result = splitIntoSentences(text);
    expect(result).toEqual([text]);
  });

  it("preserves non-breaking spaces in sentences", () => {
    const text = "Hello\u00a0world. How\u00a0are you?";
    const result = splitIntoSentences(text);
    expect(result.length).toBe(2);
    expect(result[0]).toBe("Hello\u00a0world.");
    expect(result[1]).toBe("How\u00a0are you?");
  });

  it("handles text with parentheses at sentence boundary", () => {
    const text = "This is important (see note). The next point follows.";
    const result = splitIntoSentences(text);
    expect(result.length).toBe(2);
    expect(result[0]).toContain("(see note)");
  });

  it("handles the Notion blockquote example text", () => {
    const text = [
      "This is a 60-minute conversation with your future engineering manager.",
      "It\u2019s the first live conversation in our process, and it\u2019s meant to be a two-way evaluation \u2014 we\u2019re learning about you, and you\u2019re learning about us.",
    ].join(" ");
    const result = splitIntoSentences(text);
    expect(result.length).toBe(2);
    expect(result[0]).toBe("This is a 60-minute conversation with your future engineering manager.");
    expect(result[1]).toContain("It\u2019s the first live conversation");
  });

  it("handles multi-paragraph Notion content with mixed punctuation", () => {
    const text = [
      "We\u2019ll save time at the end for your questions. We genuinely want you to interview us too \u2014 ask about the team, how we work, what the day-to-day looks like, anything that matters to you.",
      "There\u2019s no specific preparation required, but a few things that help:",
      "Check out Q&A document we\u2019ve sent you, it covers common questions about the team, how we work, and what the role looks like",
      "See you soon!",
    ].join("\n");
    const result = splitIntoSentences(text);
    expect(result).toContain("There\u2019s no specific preparation required, but a few things that help:");
    expect(result).toContain("See you soon!");
    // The colon-ending line should be its own sentence
    expect(result.some(s => s.endsWith(":"))).toBe(true);
  });

  it("handles very long sentences", () => {
    const longSentence = "The " + "quick brown fox jumps over the lazy dog and ".repeat(20) + "finally rests.";
    const text = longSentence + " Short one.";
    const result = splitIntoSentences(text);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(longSentence);
    expect(result[1]).toBe("Short one.");
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
