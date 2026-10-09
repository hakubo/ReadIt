import { describe, it, expect, vi, beforeAll } from "vitest";
import type { AudioEngine as AudioEngineClass } from "@/content/audioEngine";

let AudioEngine: typeof AudioEngineClass;

beforeAll(async () => {
  // audioEngine.ts reads the extension origin at import time.
  (chrome.runtime as unknown as { getURL: (path: string) => string }).getURL =
    (path: string) => `chrome-extension://test-id/${path}`;
  ({ AudioEngine } = await import("@/content/audioEngine"));
});

function createEngine() {
  const callbacks = {
    onPlayStateChange: vi.fn(),
    onTimeUpdate: vi.fn(),
    onSentenceEnded: vi.fn(),
    onSentencePlay: vi.fn(),
  };
  return { engine: new AudioEngine(callbacks), callbacks };
}

describe("AudioEngine.handlePlayerMessage", () => {
  it("treats PLAYER_ERROR as paused so the pill doesn't show a stuck Pause", () => {
    const { engine, callbacks } = createEngine();
    engine.handlePlayerMessage({ type: "PLAYER_ERROR" });
    expect(callbacks.onPlayStateChange).toHaveBeenCalledWith(false);
  });

  it("maps PLAYER_PLAYING / PLAYER_PAUSED to play state", () => {
    const { engine, callbacks } = createEngine();
    engine.handlePlayerMessage({ type: "PLAYER_PLAYING" });
    engine.handlePlayerMessage({ type: "PLAYER_PAUSED" });
    expect(callbacks.onPlayStateChange.mock.calls).toEqual([[true], [false]]);
  });

  it("reports elapsed time across sentences, scaled by speed", () => {
    const { engine, callbacks } = createEngine();
    engine.sentenceDurations = [2, 3];
    engine.currentSentenceIdx = 1;
    engine.setCurrentSpeed(2);
    engine.handlePlayerMessage({ type: "PLAYER_TIME", currentTime: 0.5 });
    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith(3, 1);
  });

  it("does not report play state when a sentence starts loading", () => {
    const { engine, callbacks } = createEngine();
    engine.sentenceWavData = [new ArrayBuffer(8)];
    engine.playCurrentSentence();
    expect(callbacks.onSentencePlay).toHaveBeenCalledWith(0);
    expect(callbacks.onPlayStateChange).not.toHaveBeenCalled();
  });
});
