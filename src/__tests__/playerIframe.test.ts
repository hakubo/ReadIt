import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// public/player.js is a plain script loaded by player.html. Run it against a
// fake window so each test gets fresh module state and its own listeners.
const PLAYER_SOURCE = readFileSync(resolve(__dirname, "../../public/player.js"), "utf8");
const PAGE_ORIGIN = "https://example.com";

interface FakeWindow {
  parent: { postMessage: ReturnType<typeof vi.fn> };
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
}

let fakeWindow: FakeWindow;
let messageListener: (event: unknown) => void;
let playResult: () => Promise<void>;

function postedTypes(): string[] {
  return fakeWindow.parent.postMessage.mock.calls.map(([message]) => message.type);
}

function sendToPlayer(data: Record<string, unknown>) {
  messageListener({ source: fakeWindow.parent, origin: PAGE_ORIGIN, data });
}

function audioElements(): HTMLAudioElement[] {
  return [
    document.getElementById("audio-a") as HTMLAudioElement,
    document.getElementById("audio-b") as HTMLAudioElement,
  ];
}

async function flushPromises() {
  await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 0));
}

beforeEach(() => {
  document.body.innerHTML = '<audio id="audio-a"></audio><audio id="audio-b"></audio>';
  playResult = () => Promise.resolve();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => playResult());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();

  fakeWindow = {
    parent: { postMessage: vi.fn() },
    addEventListener: (type, listener) => {
      if (type === "message") {
        messageListener = listener;
      }
    },
  };
  new Function("window", PLAYER_SOURCE)(fakeWindow);
});

async function loadFirstSentence(): Promise<HTMLAudioElement> {
  sendToPlayer({ type: "LOAD_WAV", index: 0, wavData: new ArrayBuffer(8), speed: 1 });
  await flushPromises();
  fakeWindow.parent.postMessage.mockClear();
  return audioElements()[0];
}

describe("player.js play state forwarding", () => {
  it("reports a pause from media keys on the playing element", async () => {
    const audio = await loadFirstSentence();
    audio.dispatchEvent(new Event("pause"));
    expect(postedTypes()).toEqual(["PLAYER_PAUSED"]);
  });

  it("reports a play from media keys on the playing element", async () => {
    const audio = await loadFirstSentence();
    audio.dispatchEvent(new Event("play"));
    expect(postedTypes()).toEqual(["PLAYER_PLAYING"]);
  });

  it("ignores the pause fired when a sentence reaches its end", async () => {
    const audio = await loadFirstSentence();
    Object.defineProperty(audio, "ended", { value: true });
    audio.dispatchEvent(new Event("pause"));
    expect(postedTypes()).toEqual([]);
  });

  it("ignores events from the preloaded (inactive) element", async () => {
    await loadFirstSentence();
    const preloaded = audioElements()[1];
    preloaded.setAttribute("src", "blob:next");
    preloaded.dispatchEvent(new Event("pause"));
    preloaded.dispatchEvent(new Event("play"));
    expect(postedTypes()).toEqual([]);
  });

  it("ignores pause/play while a new sentence is being loaded", async () => {
    const audio = await loadFirstSentence();
    let resolvePlay: () => void = () => {};
    playResult = () => new Promise<void>((resolvePromise) => { resolvePlay = resolvePromise; });
    sendToPlayer({ type: "LOAD_WAV", index: 1, wavData: new ArrayBuffer(8), speed: 1 });
    audio.dispatchEvent(new Event("pause"));
    audio.dispatchEvent(new Event("play"));
    expect(postedTypes()).toEqual([]);

    resolvePlay();
    await flushPromises();
    expect(postedTypes()).toEqual(["PLAYER_PLAYING"]);
  });

  it("ignores the pause caused by RESET clearing the source", async () => {
    const audio = await loadFirstSentence();
    sendToPlayer({ type: "RESET" });
    audio.dispatchEvent(new Event("pause"));
    expect(postedTypes()).toEqual([]);
  });

  it("reports PLAYER_ERROR when play() is rejected", async () => {
    playResult = () => Promise.reject(new Error("NotAllowedError"));
    sendToPlayer({ type: "LOAD_WAV", index: 0, wavData: new ArrayBuffer(8), speed: 1 });
    await flushPromises();
    expect(postedTypes()).toContain("PLAYER_ERROR");
  });

  it("reports paused when a PLAY command is rejected", async () => {
    await loadFirstSentence();
    playResult = () => Promise.reject(new Error("NotAllowedError"));
    sendToPlayer({ type: "PLAY" });
    await flushPromises();
    expect(postedTypes()).toEqual(["PLAYER_PAUSED"]);
  });
});
