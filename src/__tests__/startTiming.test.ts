import { describe, it, expect, vi } from "vitest";
import { StartTimingTracker, formatStartTiming } from "../content/startTiming";

const offscreenMessage = {
  type: "TTS_TIMING",
  warmUpWaitMs: 0,
  modelLoadMs: 1600,
  textPrepareMs: 10,
  synthesisMs: 600,
  modelWasLoaded: false,
  acceleration: "webgpu",
};

describe("StartTimingTracker", () => {
  it("combines the total with offscreen's breakdown, in either order", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const tracker = new StartTimingTracker(onComplete);
    tracker.start();
    vi.advanceTimersByTime(2400);
    tracker.audioStarted();
    expect(onComplete).not.toHaveBeenCalled();
    tracker.recordOffscreen(offscreenMessage);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].totalMs).toBeGreaterThanOrEqual(2400);
    expect(onComplete.mock.calls[0][0].acceleration).toBe("webgpu");
    vi.useRealTimers();
  });

  it("splits the wait between content, offscreen and the player using wall-clock stamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const onComplete = vi.fn();
    const tracker = new StartTimingTracker(onComplete);
    tracker.start();
    vi.setSystemTime(1_000_100);
    tracker.generateSent();
    vi.setSystemTime(1_004_500);
    tracker.audioReceived();
    tracker.recordOffscreen({ ...offscreenMessage, receivedAt: 1_003_000, firstAudioSentAt: 1_004_300 });
    vi.setSystemTime(1_005_000);
    tracker.audioStarted();
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      totalMs: 5000, prepareReadMs: 100, toOffscreenMs: 2900, deliverAudioMs: 200, playbackStartMs: 500,
    });
    vi.useRealTimers();
  });

  it("reports once per read, ignoring later play events", () => {
    const onComplete = vi.fn();
    const tracker = new StartTimingTracker(onComplete);
    tracker.start();
    tracker.recordOffscreen(offscreenMessage);
    tracker.audioStarted();
    tracker.audioStarted();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("ignores play events without a started read", () => {
    const onComplete = vi.fn();
    new StartTimingTracker(onComplete).audioStarted();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

const NO_GAPS = { prepareReadMs: 0, toOffscreenMs: 0, deliverAudioMs: 0, playbackStartMs: 0 };

describe("formatStartTiming", () => {
  it("summarises where the time went", () => {
    expect(formatStartTiming({
      totalMs: 2400, ...NO_GAPS, warmUpWaitMs: 0, modelLoadMs: 1600, textPrepareMs: 10,
      synthesisMs: 600, modelWasLoaded: false, acceleration: "webgpu",
    })).toBe("2.4 s · model 1.6 s · first sentence 0.6 s · WebGPU");
  });

  it("says when the model was already loaded and when it ran on CPU", () => {
    expect(formatStartTiming({
      totalMs: 900, ...NO_GAPS, warmUpWaitMs: 0, modelLoadMs: 0, textPrepareMs: 0,
      synthesisMs: 800, modelWasLoaded: true, acceleration: "cpu",
    })).toBe("0.9 s · model ready · first sentence 0.8 s · CPU");
  });

  it("shows the steps between contexts when they take time", () => {
    expect(formatStartTiming({
      totalMs: 5800, prepareReadMs: 100, toOffscreenMs: 3000, deliverAudioMs: 200, playbackStartMs: 1200,
      warmUpWaitMs: 0, modelLoadMs: 900, textPrepareMs: 0, synthesisMs: 300, modelWasLoaded: false, acceleration: "webgpu",
    })).toBe("5.8 s · prepare 0.1 s · offscreen 3.0 s · model 0.9 s · first sentence 0.3 s · deliver 0.2 s · play 1.2 s · WebGPU");
  });
});
