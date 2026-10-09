// Measures how long a read takes from Play to the first audible sentence, and
// combines it with offscreen's breakdown (TTS_TIMING) so the wait can be
// diagnosed from the settings panel or the console.

import type { StartTiming } from "./playerStore";

// Offscreen's part, plus wall-clock stamps (Date.now(): performance.now() has a
// different origin in every extension context, so it can't be compared).
type OffscreenTiming = Pick<
  StartTiming,
  "warmUpWaitMs" | "modelLoadMs" | "textPrepareMs" | "synthesisMs" | "modelWasLoaded" | "acceleration"
> & { receivedAt: number; firstAudioSentAt: number };

export class StartTimingTracker {
  private startedAt: number | null = null;
  private generateSentAt: number | null = null;
  private firstAudioReceivedAt: number | null = null;
  private totalMs: number | null = null;
  private offscreen: OffscreenTiming | null = null;

  constructor(private readonly onComplete: (timing: StartTiming) => void) {}

  /** Play was pressed for a new read. */
  start(): void {
    this.cancel();
    this.startedAt = Date.now();
  }

  cancel(): void {
    this.startedAt = null;
    this.generateSentAt = null;
    this.firstAudioReceivedAt = null;
    this.totalMs = null;
    this.offscreen = null;
  }

  /** GENERATE_TTS is about to be sent. */
  generateSent(): void {
    this.generateSentAt ??= Date.now();
  }

  /** A sentence's WAV arrived; only the first one counts. */
  audioReceived(): void {
    if (this.startedAt !== null) {
      this.firstAudioReceivedAt ??= Date.now();
    }
  }

  /** Offscreen's TTS_TIMING message for the current read. */
  recordOffscreen(message: Record<string, unknown>): void {
    this.offscreen = {
      warmUpWaitMs: Number(message.warmUpWaitMs) || 0,
      modelLoadMs: Number(message.modelLoadMs) || 0,
      textPrepareMs: Number(message.textPrepareMs) || 0,
      synthesisMs: Number(message.synthesisMs) || 0,
      modelWasLoaded: Boolean(message.modelWasLoaded),
      acceleration: message.acceleration === "webgpu" ? "webgpu" : "cpu",
      receivedAt: Number(message.receivedAt) || 0,
      firstAudioSentAt: Number(message.firstAudioSentAt) || 0,
    };
    this.completeIfReady();
  }

  /** The first audio of the read started playing. */
  audioStarted(): void {
    if (this.startedAt === null || this.totalMs !== null) {
      return;
    }
    this.totalMs = Date.now() - this.startedAt;
    this.completeIfReady();
  }

  // Both halves are needed; they can arrive in either order.
  private completeIfReady(): void {
    if (this.totalMs === null || !this.offscreen || this.startedAt === null) {
      return;
    }
    const timing = this.buildTiming(this.startedAt, this.totalMs, this.offscreen);
    this.cancel();
    this.onComplete(timing);
  }

  private buildTiming(startedAt: number, totalMs: number, offscreen: OffscreenTiming): StartTiming {
    const { receivedAt, firstAudioSentAt, ...offscreenParts } = offscreen;
    const generateSentAt = this.generateSentAt ?? startedAt;
    const audioReceivedAt = this.firstAudioReceivedAt ?? startedAt + totalMs;
    // Gaps between contexts can't be negative; clamp clock jitter
    const gap = (from: number, to: number) => (from && to ? Math.max(0, to - from) : 0);
    return {
      totalMs,
      prepareReadMs: gap(startedAt, generateSentAt),
      toOffscreenMs: gap(generateSentAt, receivedAt),
      deliverAudioMs: gap(firstAudioSentAt, audioReceivedAt),
      playbackStartMs: gap(audioReceivedAt, startedAt + totalMs),
      ...offscreenParts,
    };
  }
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

const SHOWN_FROM_MS = 50;

/** e.g. "2.4 s · offscreen 0.4 s · model 1.6 s · first sentence 0.3 s · WebGPU" (steps under 50 ms omitted) */
export function formatStartTiming(timing: StartTiming): string {
  const parts = [seconds(timing.totalMs)];
  const optional = (label: string, ms: number) => {
    if (ms >= SHOWN_FROM_MS) {
      parts.push(`${label} ${seconds(ms)}`);
    }
  };
  optional("prepare", timing.prepareReadMs);
  optional("offscreen", timing.toOffscreenMs);
  if (timing.warmUpWaitMs >= SHOWN_FROM_MS) {
    parts.push(`warm-up ${seconds(timing.warmUpWaitMs)}`);
  }
  parts.push(timing.modelWasLoaded ? "model ready" : `model ${seconds(timing.modelLoadMs)}`);
  if (timing.textPrepareMs >= 50) {
    parts.push(`text ${seconds(timing.textPrepareMs)}`);
  }
  parts.push(`first sentence ${seconds(timing.synthesisMs)}`);
  optional("deliver", timing.deliverAudioMs);
  optional("play", timing.playbackStartMs);
  parts.push(timing.acceleration === "webgpu" ? "WebGPU" : "CPU");
  return parts.join(" · ");
}
