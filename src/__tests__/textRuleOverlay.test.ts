import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { escapeForRegex, findTextMatches, TextRuleOverlay } from "../content/textRuleOverlay";

describe("escapeForRegex", () => {
  it.each([
    ["hello", "hello"],
    ["e.g.", "e\\.g\\."],
    ["$100", "\\$100"],
    ["price (USD)", "price \\(USD\\)"],
    ["a+b*c?", "a\\+b\\*c\\?"],
    ["foo|bar", "foo\\|bar"],
    ["[test]", "\\[test\\]"],
    ["{braces}", "\\{braces\\}"],
    ["back\\slash", "back\\\\slash"],
    ["^start$end", "\\^start\\$end"],
    ["", ""],
    ["no specials", "no specials"],
  ])("escapes %j to %j", (input, expected) => {
    expect(escapeForRegex(input)).toBe(expected);
  });

  it("produces a valid regex that matches the original text", () => {
    const specials = "price is $5.00 (50% off)";
    const pattern = escapeForRegex(specials);
    const regex = new RegExp(pattern);
    expect(regex.test(specials)).toBe(true);
  });

  it("round-trips special characters correctly", () => {
    const inputs = [".*+?^${}()|[]\\", "a.b+c*d?e"];
    for (const input of inputs) {
      const pattern = escapeForRegex(input);
      expect(() => new RegExp(pattern)).not.toThrow();
      expect(new RegExp(pattern).test(input)).toBe(true);
    }
  });
});

describe("findTextMatches", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("finds simple text matches", () => {
    container.innerHTML = "<p>The price is $5 and also $10.</p>";
    const matches = findTextMatches("\\$(\\d+)", "g", "$1 dollars", container);
    expect(matches.length).toBe(2);
    expect(matches[0].matched).toBe("$5");
    expect(matches[0].replaced).toBe("5 dollars");
    expect(matches[1].matched).toBe("$10");
    expect(matches[1].replaced).toBe("10 dollars");
  });

  it("returns empty array for invalid regex", () => {
    container.innerHTML = "<p>Hello world</p>";
    const matches = findTextMatches("[invalid", "g", "x", container);
    expect(matches).toEqual([]);
  });

  it("returns empty array for empty pattern", () => {
    container.innerHTML = "<p>Hello world</p>";
    const matches = findTextMatches("", "g", "x", container);
    expect(matches).toEqual([]);
  });

  it("skips script and style elements", () => {
    container.innerHTML = `
      <p>visible $5</p>
      <script>hidden $5</script>
      <style>hidden $5</style>
    `;
    const matches = findTextMatches("\\$5", "g", "five dollars", container);
    expect(matches.length).toBe(1);
    expect(matches[0].matched).toBe("$5");
  });

  it("handles case-insensitive matching", () => {
    container.innerHTML = "<p>Hello HELLO hello</p>";
    const matches = findTextMatches("hello", "gi", "hi", container);
    expect(matches.length).toBe(3);
  });

  it("handles capture group replacements", () => {
    container.innerHTML = "<p>~5 users and ~10 items</p>";
    const matches = findTextMatches("~(\\d+)", "g", "around $1", container);
    expect(matches.length).toBe(2);
    expect(matches[0].replaced).toBe("around 5");
    expect(matches[1].replaced).toBe("around 10");
  });

  it("limits matches to prevent performance issues", () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    container.innerHTML = `<p>${words}</p>`;
    const matches = findTextMatches("word\\d+", "g", "replaced", container);
    expect(matches.length).toBeLessThanOrEqual(100);
  });

  it("handles text nodes across multiple elements", () => {
    container.innerHTML = `
      <p>First $5 here</p>
      <div>Second $10 there</div>
      <span>Third $15 done</span>
    `;
    const matches = findTextMatches("\\$(\\d+)", "g", "$1 dollars", container);
    expect(matches.length).toBe(3);
  });

  it("returns empty array when no matches found", () => {
    container.innerHTML = "<p>No numbers here at all</p>";
    const matches = findTextMatches("\\d+", "g", "NUM", container);
    expect(matches).toEqual([]);
  });

  it("creates Range objects for each match", () => {
    container.innerHTML = "<p>foo bar foo</p>";
    const matches = findTextMatches("foo", "g", "baz", container);
    expect(matches.length).toBe(2);
    for (const m of matches) {
      expect(m.range).toBeInstanceOf(Range);
      expect(m.range.toString()).toBe("foo");
    }
  });

  it("handles default flags when none provided", () => {
    container.innerHTML = "<p>Hello hello</p>";
    // Default flags is "gi" when empty string passed
    const matches = findTextMatches("hello", "", "hi", container);
    expect(matches.length).toBe(2);
  });
});

describe("TextRuleOverlay", () => {
  let overlay: TextRuleOverlay;
  let container: HTMLDivElement;

  beforeEach(() => {
    overlay = new TextRuleOverlay();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    overlay.hideRulePreview();
    overlay.stopTextPicker();
    container.remove();
    document.querySelectorAll(".unmute-text-rule-highlight, .unmute-text-rule-tooltip").forEach(el => el.remove());
  });

  describe("showRulePreview", () => {
    it("returns match count for valid patterns", () => {
      container.innerHTML = "<p>e.g. this and e.g. that</p>";
      const count = overlay.showRulePreview("e\\.g\\.", "gi", "for example");
      expect(count).toBe(2);
    });

    it("returns 0 for empty pattern", () => {
      container.innerHTML = "<p>some text</p>";
      const count = overlay.showRulePreview("", "gi", "replacement");
      expect(count).toBe(0);
    });

    it("returns 0 for invalid pattern", () => {
      container.innerHTML = "<p>some text</p>";
      const count = overlay.showRulePreview("[invalid", "gi", "replacement");
      expect(count).toBe(0);
    });

    it("clears previous highlights before showing new ones", () => {
      container.innerHTML = "<p>$5 and $10</p>";
      overlay.showRulePreview("\\$\\d+", "g", "dollars");
      overlay.showRulePreview("\\$5", "g", "five");
      // Second call should have replaced the first set
      const count = overlay.showRulePreview("\\$\\d+", "g", "dollars");
      expect(count).toBe(2);
    });
  });

  describe("hideRulePreview", () => {
    it("can be called even when no preview is shown", () => {
      expect(() => overlay.hideRulePreview()).not.toThrow();
    });

    it("removes all overlay elements from the DOM", () => {
      container.innerHTML = "<p>$5 here</p>";
      overlay.showRulePreview("\\$5", "g", "five");
      overlay.hideRulePreview();
      expect(document.querySelectorAll(".unmute-text-rule-highlight").length).toBe(0);
      expect(document.querySelectorAll(".unmute-text-rule-tooltip").length).toBe(0);
    });
  });

  describe("text picker", () => {
    it("isPickerActive returns false by default", () => {
      expect(overlay.isPickerActive()).toBe(false);
    });

    it("startTextPicker sets picker as active", () => {
      overlay.startTextPicker(() => {}, () => {});
      expect(overlay.isPickerActive()).toBe(true);
      overlay.stopTextPicker();
    });

    it("stopTextPicker deactivates picker", () => {
      overlay.startTextPicker(() => {}, () => {});
      overlay.stopTextPicker();
      expect(overlay.isPickerActive()).toBe(false);
    });

    it("startTextPicker shows a banner", () => {
      overlay.startTextPicker(() => {}, () => {});
      const banner = document.querySelector("[data-unmute-text-picker]");
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain("Select text");
      overlay.stopTextPicker();
    });

    it("stopTextPicker removes the banner", () => {
      overlay.startTextPicker(() => {}, () => {});
      overlay.stopTextPicker();
      const banner = document.querySelector("[data-unmute-text-picker]");
      expect(banner).toBeNull();
    });

    it("does not start picker if already active", () => {
      overlay.startTextPicker(() => {}, () => {});
      overlay.startTextPicker(() => {}, () => {});
      const banners = document.querySelectorAll("[data-unmute-text-picker]");
      expect(banners.length).toBe(1);
      overlay.stopTextPicker();
    });

    it("stopTextPicker is safe to call when not active", () => {
      expect(() => overlay.stopTextPicker()).not.toThrow();
    });
  });
});
