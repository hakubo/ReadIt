import { describe, it, expect } from "vitest";
import { splitIntoSentences, humanizeText, replaceUrlsWithDomains, cleanHandles, speakRanges } from "../content/textProcessing";
import type { TextReplacementRule } from "../shared/types";

describe("splitIntoSentences", () => {
  it.each([
    "Costs locked into a contract (ex. Twitter) are found in the section.",
    "Use tools, e.g. Figma and Slack.",
    "One winner, i.e. Notion wins.",
    "Arsenal vs. Chelsea tonight.",
    "It costs approx. Ten dollars.",
    "Price incl. VAT is high.",
    "Cf. Section 2 for more.",
    "The CEO, aka. Boss, decided.",
    "Mr. Smith met Dr. Jones and Prof. Lee.",
    "St. Louis is far from Sr. Engineer Jr. Smith.",
    "See pp. 4-5 and No. 7 in Fig. 2.",
    "Est. 2010 in the Dept. Of Health.",
    "In St. Louis we met.",
    "We visited St. Louis in May.",
    "See ex. 3 for details.",
  ])("keeps %s as one sentence", (text) => {
    expect(splitIntoSentences(text)).toEqual([text]);
  });

  it.each([
    ["The answer is no. Then we left.", ["The answer is no.", "Then we left."]],
    ["I love art. Museums are great.", ["I love art.", "Museums are great."]],
    ["Apples, pears, etc. Some are red.", ["Apples, pears, etc.", "Some are red."]],
    ["Wait... What happened?", ["Wait...", "What happened?"]],
    ["We met on Main St. Then we left.", ["We met on Main St.", "Then we left."]],
    ["Turn onto 5th St. Keep going.", ["Turn onto 5th St.", "Keep going."]],
    ["I called my ex. She was out.", ["I called my ex.", "She was out."]],
  ])("still splits %s", (text, expected) => {
    expect(splitIntoSentences(text)).toEqual(expected);
  });


  it("drops sentences with nothing to speak, like a lone emoji", () => {
    const text = "Introducing recurring live calls 🎥\nHi team! 🌊\n—\nWe start at 10.";
    expect(splitIntoSentences(text)).toEqual([
      "Introducing recurring live calls 🎥",
      "Hi team!",
      "We start at 10.",
    ]);
  });

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

describe("replaceUrlsWithDomains", () => {
  it("returns text unchanged when there are no URLs", () => {
    expect(replaceUrlsWithDomains("Hello world")).toBe("Hello world");
  });

  it("speaks a URL as its domain, without www", () => {
    expect(replaceUrlsWithDomains("Visit https://www.example.com/a/b?c=1 today")).toBe("Visit example.com today");
  });

  it("keeps trailing sentence punctuation in the text", () => {
    expect(replaceUrlsWithDomains("Read https://example.com/post. Then https://github.com/x!"))
      .toBe("Read example.com. Then github.com!");
  });

  it("replaces every occurrence, including one URL that prefixes another", () => {
    expect(replaceUrlsWithDomains("A https://a.com/long and https://a.com here")).toBe("A a.com and a.com here");
  });
});

describe("cleanHandles", () => {
  it("speaks a mention as its words", () => {
    expect(cleanHandles("Thanks @jane_doe and @JohnSmith!")).toBe("Thanks jane doe and John Smith!");
  });

  it("drops trailing digits and the fediverse server", () => {
    expect(cleanHandles("cc @dev_guy1987, @jane@mastodon.social.")).toBe("cc dev guy, jane.");
  });

  it("splits camel-case hashtags", () => {
    expect(cleanHandles("#MachineLearning and #iOSDev")).toBe("Machine Learning and i OS Dev");
  });

  it("leaves emails, C#, numbers and lone sigils alone", () => {
    const text = "Mail me@example.com about C# issue #12 @ 5pm";
    expect(cleanHandles(text)).toBe(text);
  });

  it("keeps a slack-style mention with a full name", () => {
    expect(cleanHandles("@Jakub Olek wrote this")).toBe("Jakub Olek wrote this");
  });
});

describe("speakRanges", () => {
  it("reads percent ranges with 'to'", () => {
    expect(speakRanges("Saves 70%-80% of time")).toBe("Saves 70 to 80 percent of time");
    expect(speakRanges("about 70-80% faster")).toBe("about 70 to 80 percent faster");
    expect(speakRanges("from 2.5 – 10%")).toBe("from 2.5 to 10 percent");
  });

  it("reads year and en dash ranges with 'to'", () => {
    expect(speakRanges("from 2020-2024")).toBe("from 2020 to 2024");
    expect(speakRanges("pages 10–20")).toBe("pages 10 to 20");
  });

  it("leaves dates, phone numbers and scores alone", () => {
    const text = "On 2024-01-15 call 555-1234, it ended 3-2.";
    expect(speakRanges(text)).toBe(text);
  });
});
