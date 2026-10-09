import { describe, it, expect } from "vitest";
import { resolveQuoteVoice, voicesMap } from "@/lib/resources";
import { findQuotedSentences } from "../content/quoteDetection";

describe("resolveQuoteVoice", () => {
  it("auto picks the best voice of the other gender in the same language", () => {
    const quoteVoice = resolveQuoteVoice("af_heart", "auto")!;
    expect(voicesMap[quoteVoice as keyof typeof voicesMap].gender).toBe("Male");
    expect(voicesMap[quoteVoice as keyof typeof voicesMap].lang.id).toBe("en-us");
  });

  it("auto works the other way round", () => {
    const quoteVoice = resolveQuoteVoice("am_michael", undefined)!;
    expect(voicesMap[quoteVoice as keyof typeof voicesMap].gender).toBe("Female");
  });

  it("off means the main voice", () => {
    expect(resolveQuoteVoice("af_heart", "off")).toBeNull();
  });

  it("uses an explicit voice id, ignoring unknown ones", () => {
    expect(resolveQuoteVoice("af_heart", "bm_george")).toBe("bm_george");
    expect(resolveQuoteVoice("af_heart", "nope")).toBeNull();
  });
});

describe("findQuotedSentences", () => {
  it("marks sentences inside <blockquote> and <q>", () => {
    document.body.innerHTML = `
      <article id="root">
        <p>He said this. Then <q>Short inline quote.</q> happened.</p>
        <blockquote><p>First quoted sentence. Second   quoted sentence.</p></blockquote>
        <p>Back to normal.</p>
      </article>`;
    const sentences = ["He said this.", "Then", "Short inline quote.", "First quoted sentence.", "Second quoted sentence.", "Back to normal."];
    expect(findQuotedSentences(sentences, document.getElementById("root"))).toEqual([2, 3, 4]);
  });

  it("marks everything when the selection sits inside a blockquote", () => {
    document.body.innerHTML = `<blockquote><p id="para">Selected quote. Another one.</p></blockquote>`;
    expect(findQuotedSentences(["Selected quote.", "Another one."], document.getElementById("para"))).toEqual([0, 1]);
  });

  it("returns nothing without quotes", () => {
    document.body.innerHTML = `<p>Plain text.</p>`;
    expect(findQuotedSentences(["Plain text."], null)).toEqual([]);
  });
});
