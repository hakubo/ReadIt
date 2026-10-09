import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/shared/types";

const kokoro = vi.hoisted(() => ({
  generateVoice: vi.fn(),
  isSessionCached: vi.fn(() => true),
  preloadModel: vi.fn(async () => {}),
}));

vi.mock("@/lib/kokoro", () => kokoro);
const modelCached = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/resources", () => ({
  voicesMap: {},
  isVoiceCached: vi.fn(async () => true),
  isModelCached: vi.fn(async () => modelCached.value),
  resolveQuoteVoice: vi.fn((_main: string, preference: string) => (preference === "off" ? null : "am_michael")),
}));

type Listener = (message: Record<string, unknown>, sender: unknown, sendResponse: (r: unknown) => void) => unknown;

let listener: Listener;
let sent: Record<string, unknown>[];

async function loadOffscreen() {
  sent = [];
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn(async (message: Record<string, unknown>) => { sent.push(message); }),
      onMessage: { addListener: (fn: Listener) => { listener = fn; } },
    },
  });
  vi.resetModules();
  await import("@/offscreen/index");
}

/** Start a read; resolves with the GENERATE response. */
function generate(
  readId: string,
  sentences: string[],
  quotedSentences: number[] = [],
  settings = DEFAULT_SETTINGS,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    listener(
      { type: "OFFSCREEN_GENERATE_TTS", readId, sentences, quotedSentences, settings },
      {},
      (response) => resolve(response as Record<string, unknown>),
    );
  });
}

function sentOfType(type: string) {
  return sent.filter((message) => message.type === type);
}

const speech = () => ({ waveform: new Float32Array(240) });

beforeEach(async () => {
  kokoro.generateVoice.mockReset();
  kokoro.generateVoice.mockImplementation(async () => speech());
  kokoro.isSessionCached.mockReturnValue(true);
  kokoro.preloadModel.mockReset();
  await loadOffscreen();
});

describe("warm-up", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("loads the model and runs one tiny sentence when the model is cached", async () => {
    kokoro.isSessionCached.mockReturnValue(false);
    modelCached.value = true;
    listener({ type: "OFFSCREEN_WARM_UP", voiceId: "af_heart" }, {}, () => {});
    await flush();
    expect(kokoro.preloadModel).toHaveBeenCalled();
    expect(kokoro.generateVoice).toHaveBeenCalledWith({ text: "Hi.", lang: "en-us", voiceId: "af_heart" });
  });

  it("never starts the first model download silently", async () => {
    kokoro.isSessionCached.mockReturnValue(false);
    modelCached.value = false;
    listener({ type: "OFFSCREEN_WARM_UP", voiceId: "af_heart" }, {}, () => {});
    await flush();
    expect(kokoro.preloadModel).not.toHaveBeenCalled();
    modelCached.value = true;
  });
});

describe("offscreen generation", () => {
  it("reports start-up timing once, with the first audio", async () => {
    await generate("read-t", ["One.", "Two."]);
    const timings = sentOfType("TTS_TIMING");
    expect(timings).toHaveLength(1);
    expect(timings[0]).toMatchObject({ readId: "read-t", modelWasLoaded: true });
    expect(sent.indexOf(timings[0])).toBeGreaterThan(sent.findIndex((message) => message.type === "TTS_SENTENCE_WAV"));
  });

  it("speaks links as their domain without fetching page titles", async () => {
    await generate("read-u", ["See https://example.com/a now.", "And https://www.example.org/b too."]);
    const spoken = kokoro.generateVoice.mock.calls.map(([options]) => options.text);
    expect(spoken).toEqual(["See example.com now.", "And example.org too."]);
    expect(sent.some((message) => message.type === "FETCH_PAGE_TITLE")).toBe(false);
  });

  it("speaks quoted sentences in the quote voice", async () => {
    await generate("read-q", ["Intro.", "Quoted line.", "Outro."], [1]);
    const voiceFor = (text: string) =>
      kokoro.generateVoice.mock.calls.find(([options]) => options.text === text)?.[0].voiceId;
    expect(voiceFor("Quoted line.")).toBe("am_michael");
    expect(voiceFor("Intro.")).toBe(DEFAULT_SETTINGS.voices[0]);
    expect(voiceFor("Outro.")).toBe(DEFAULT_SETTINGS.voices[0]);
  });

  it("uses the main voice for quotes when the quote voice is off", async () => {
    await generate("read-q", ["Quoted line."], [0], { ...DEFAULT_SETTINGS, quoteVoice: "off" });
    expect(kokoro.generateVoice.mock.calls[0][0].voiceId).toBe(DEFAULT_SETTINGS.voices[0]);
  });

  it("stamps every TTS message with the read id", async () => {
    const result = await generate("read-1", ["One.", "Two."]);
    expect(result).toEqual({ success: true, streaming: true });
    const ttsMessages = sent.filter((message) => String(message.type).startsWith("TTS_"));
    expect(ttsMessages.length).toBeGreaterThan(0);
    expect(ttsMessages.every((message) => message.readId === "read-1")).toBe(true);
    expect(sentOfType("TTS_STREAM_END")).toHaveLength(1);
  });

  it("sends silence for a failed sentence so playback moves on", async () => {
    kokoro.generateVoice
      .mockRejectedValueOnce(new Error("boom"))
      .mockImplementation(async () => speech());
    const result = await generate("read-1", ["One.", "Two."]);
    expect(result.success).toBe(true);
    const wavIndices = sentOfType("TTS_SENTENCE_WAV").map((message) => message.index);
    expect(wavIndices).toEqual([0, 1]);
  });

  it("reports an error when sentences keep failing", async () => {
    kokoro.generateVoice.mockRejectedValue(new Error("model broken"));
    const result = await generate("read-1", ["One.", "Two.", "Three.", "Four."]);
    expect(result.success).toBe(false);
    expect(sentOfType("TTS_STREAM_END")).toHaveLength(0);
  });

  it("keeps a reset that arrives during the model download", async () => {
    let finishDownload: () => void = () => {};
    kokoro.isSessionCached.mockReturnValue(false);
    kokoro.preloadModel.mockImplementation(() => new Promise<void>((resolve) => { finishDownload = resolve; }));

    const response = generate("read-1", ["One."]);
    await vi.waitFor(() => expect(kokoro.preloadModel).toHaveBeenCalled());
    listener({ type: "PLAYER_RESET", readId: "read-1" }, {}, () => {});
    finishDownload();

    expect(await response).toEqual({ success: true, aborted: true });
    expect(sentOfType("TTS_SENTENCE_WAV")).toHaveLength(0);
  });

  it("ignores a reset from another read (another tab)", async () => {
    let finishDownload: () => void = () => {};
    kokoro.isSessionCached.mockReturnValue(false);
    kokoro.preloadModel.mockImplementation(() => new Promise<void>((resolve) => { finishDownload = resolve; }));

    const response = generate("read-1", ["One."]);
    await vi.waitFor(() => expect(kokoro.preloadModel).toHaveBeenCalled());
    listener({ type: "PLAYER_RESET", readId: "other-read" }, {}, () => {});
    listener({ type: "PLAYER_RESET" }, {}, () => {});
    finishDownload();

    expect(await response).toEqual({ success: true, streaming: true });
    expect(sentOfType("TTS_SENTENCE_WAV")).toHaveLength(1);
  });

  it("generates sentences skipped by a forward seek after the window is done", async () => {
    const sentences = Array.from({ length: 40 }, (_, index) => `Sentence ${index}.`);
    const response = generate("read-1", sentences);
    listener({ type: "REGENERATE_SENTENCE", readId: "read-1", index: 30 }, {}, () => {});
    // Let playback "advance" to the end so the window covers everything.
    listener({ type: "ADVANCE_GENERATION", readId: "read-1", upTo: 100 }, {}, () => {});

    expect(await response).toEqual({ success: true, streaming: true });
    const wavIndices = new Set(sentOfType("TTS_SENTENCE_WAV").map((message) => message.index));
    expect(wavIndices.size).toBe(40);
  });

  it("a new read aborts the parked previous one without deadlocking", async () => {
    const first = generate("read-1", Array.from({ length: 20 }, (_, index) => `A${index}.`));
    await vi.waitFor(() => expect(sentOfType("TTS_SENTENCE_WAV")).toHaveLength(15));
    const second = generate("read-2", ["B0.", "B1."]);

    expect(await first).toEqual({ success: true, aborted: true });
    expect(await second).toEqual({ success: true, streaming: true });
    const firstReadWavs = sentOfType("TTS_SENTENCE_WAV").filter((message) => message.readId === "read-1");
    expect(firstReadWavs).toHaveLength(15);
    // Controls for the old read no longer steer anything
    listener({ type: "REGENERATE_SENTENCE", readId: "read-1", index: 18 }, {}, () => {});
    expect(sentOfType("TTS_SENTENCE_WAV")).toHaveLength(17);
  });

  it("answers a ping with busy while a read is in progress", async () => {
    const response = generate("read-1", Array.from({ length: 20 }, (_, index) => `S${index}.`));
    let pingResponse: unknown;
    // Window limit parks the loop after 15 sentences; give it time to get there.
    await vi.waitFor(() => expect(sentOfType("TTS_SENTENCE_WAV")).toHaveLength(15));
    listener({ type: "OFFSCREEN_PING" }, {}, (r) => { pingResponse = r; });
    expect(pingResponse).toEqual({ pong: true, busy: true });

    listener({ type: "PLAYER_RESET", readId: "read-1" }, {}, () => {});
    expect(await response).toEqual({ success: true, aborted: true });
    listener({ type: "OFFSCREEN_PING" }, {}, (r) => { pingResponse = r; });
    expect(pingResponse).toEqual({ pong: true, busy: false });
  });
});
