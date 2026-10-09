import { describe, it, expect } from "vitest";
import { DebugRecorder, realtimeFactor, sentenceStatus, type DebugSentence } from "../content/debug/debugData";

describe("sentenceStatus", () => {
  const base = { currentIndex: 2, isPlaying: true, hasAudio: true, generatingIndex: null };

  it("marks the current sentence as playing", () => {
    expect(sentenceStatus({ ...base, index: 2 })).toBe("playing");
  });

  it("marks earlier generated sentences as played and later ones as ready", () => {
    expect(sentenceStatus({ ...base, index: 1 })).toBe("played");
    expect(sentenceStatus({ ...base, index: 3 })).toBe("ready");
  });

  it("marks the sentence being generated, and the rest as waiting", () => {
    expect(sentenceStatus({ ...base, index: 4, hasAudio: false, generatingIndex: 4 })).toBe("generating");
    expect(sentenceStatus({ ...base, index: 5, hasAudio: false, generatingIndex: 4 })).toBe("waiting");
  });
});

describe("DebugRecorder", () => {
  it("tracks the generating sentence and stores reports from WAV messages", () => {
    const recorder = new DebugRecorder();
    recorder.startRead([1]);
    recorder.message({ type: "TTS_PROGRESS", status: "generating", currentChunk: 1, totalChunks: 3 });
    expect(recorder.generatingIndex).toBe(0);

    const report = { synthesisMs: 420, spokenText: "Hi.", voiceId: "af_heart", failed: false };
    recorder.message({ type: "TTS_SENTENCE_WAV", index: 0, duration: 1.2, report });
    expect(recorder.generatingIndex).toBeNull();
    expect(recorder.report(0)).toEqual(report);
    expect(recorder.quotedSentences.has(1)).toBe(true);
    expect(recorder.events.map((event) => event.type)).toEqual(["read started", "TTS_PROGRESS", "TTS_SENTENCE_WAV"]);
  });

  it("forgets the previous read's sentence reports but keeps all events", () => {
    const recorder = new DebugRecorder();
    recorder.startRead([]);
    recorder.message({ type: "TTS_SENTENCE_WAV", index: 0, duration: 1, report: { synthesisMs: 1, spokenText: "", voiceId: "", failed: false } });
    recorder.startRead([]);
    expect(recorder.report(0)).toBeNull();
    expect(recorder.events.map((event) => event.type)).toEqual(["read started", "TTS_SENTENCE_WAV", "read started"]);
  });

  it("keeps every event, with no cap", () => {
    const recorder = new DebugRecorder();
    for (let i = 0; i < 1000; i++) {
      recorder.event("tick");
    }
    expect(recorder.events).toHaveLength(1000);
  });
});

describe("realtimeFactor", () => {
  const sentence = (synthesisMs: number, durationSec: number): DebugSentence => ({
    index: 0, text: "", status: "ready", quoted: false, located: "found", durationSec,
    report: { synthesisMs, spokenText: "", voiceId: "", failed: false },
  });

  it("is generation time over audio time", () => {
    expect(realtimeFactor([sentence(500, 2), sentence(1500, 2)])).toBeCloseTo(0.5);
  });

  it("is null before anything is generated", () => {
    expect(realtimeFactor([])).toBeNull();
  });
});

describe("debug config helpers", async () => {
  const { ruleUsage, noiseUsage, describeElement } = await import("../content/debug/debugConfig");

  it("counts rule matches across the read's sentences, null for an invalid pattern", () => {
    const usage = ruleUsage([
      { pattern: "(\\d)k\\b", replacement: "$1 thousand", flags: "gi", enabled: true },
      { pattern: "(", replacement: "", enabled: true },
      { pattern: "x", replacement: "", enabled: false },
    ], ["We have 5k users and 3k teams.", "Another 2k."]);
    expect(usage.map((entry) => entry.matches)).toEqual([3, null, 0]);
  });

  it("counts noise selector matches on the page", () => {
    document.body.innerHTML = `<nav></nav><nav></nav><aside></aside>`;
    const usage = noiseUsage(["nav", "div["], ["aside"]);
    expect(usage).toEqual([
      { selector: "nav", pickedOnSite: false, pageMatches: 2 },
      { selector: "div[", pickedOnSite: false, pageMatches: null },
      { selector: "aside", pickedOnSite: true, pageMatches: 1 },
    ]);
  });

  it("describes an element as tag#id.classes", () => {
    document.body.innerHTML = `<article id="post" class="entry content main extra"></article>`;
    expect(describeElement(document.getElementById("post"))).toBe("article#post.entry.content.main");
  });
});
