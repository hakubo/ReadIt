import { describe, it, expect } from "vitest";
import { hasSpeakableText } from "@/shared/speakable";

describe("hasSpeakableText", () => {
  it.each(["Hi", "42", "Zażółć", "日本語", "ok 🌊"])("accepts %s", (text) => {
    expect(hasSpeakableText(text)).toBe(true);
  });

  it.each(["", "🌊", "🎥 🌊", "—", "• ...", "👍🏽"])("rejects %s", (text) => {
    expect(hasSpeakableText(text)).toBe(false);
  });
});
