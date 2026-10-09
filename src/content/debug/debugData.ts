// Data behind the debug panel (local builds only, see __DEBUG_TOOLS__).
// The recorder is fed from the content script's message listener; the panel
// polls a snapshot built from it plus the content script's own state.

import type { StartTiming } from "../playerStore";

export interface SentenceReport {
  synthesisMs: number;
  spokenText: string;
  voiceId: string;
  failed: boolean;
}

export type SentenceStatus = "waiting" | "generating" | "ready" | "playing" | "played";

export interface DebugSentence {
  index: number;
  text: string;
  status: SentenceStatus;
  quoted: boolean;
  located: "pending" | "found" | "missing";
  durationSec: number | null;
  report: SentenceReport | null;
}

export interface DebugEvent {
  atMs: number;
  type: string;
  detail: string;
}

export interface DebugSnapshot {
  readId: string | null;
  flags: Record<string, boolean>;
  currentIndex: number;
  generatingIndex: number | null;
  startTiming: StartTiming | null;
  sentences: DebugSentence[];
  events: DebugEvent[];
}

/**
 * Collects events and per-sentence reports. Sentence reports reset on every
 * new read; events are kept for the whole page session (each read starts with
 * a "read started" entry, and times are relative to that read's start).
 */
export class DebugRecorder {
  private readStartedAt = performance.now();
  private reports = new Map<number, SentenceReport>();
  private eventLog: DebugEvent[] = [];
  generatingIndex: number | null = null;
  quotedSentences = new Set<number>();

  startRead(quotedSentences: number[]): void {
    this.readStartedAt = performance.now();
    this.reports.clear();
    this.generatingIndex = null;
    this.quotedSentences = new Set(quotedSentences);
    this.event("read started");
  }

  event(type: string, detail = ""): void {
    this.eventLog.push({ atMs: performance.now() - this.readStartedAt, type, detail });
  }

  /** Feed a background → content message about the current read. */
  message(message: Record<string, unknown>): void {
    const type = String(message.type);
    if (type === "TTS_PROGRESS" && typeof message.currentChunk === "number") {
      this.generatingIndex = message.currentChunk - 1;
    }
    if (type === "TTS_SENTENCE_WAV" && typeof message.index === "number") {
      this.recordSentence(message.index, message.report);
    }
    this.event(type, describeMessage(message));
  }

  private recordSentence(index: number, report: unknown): void {
    if (report && typeof report === "object") {
      this.reports.set(index, report as SentenceReport);
    }
    if (this.generatingIndex === index) {
      this.generatingIndex = null;
    }
  }

  report(index: number): SentenceReport | null {
    return this.reports.get(index) ?? null;
  }

  get events(): DebugEvent[] {
    return this.eventLog;
  }
}

function describeMessage(message: Record<string, unknown>): string {
  switch (message.type) {
    case "TTS_PROGRESS":
      return `${message.status ?? ""} ${message.currentChunk ?? ""}/${message.totalChunks ?? ""}`.trim();
    case "TTS_SENTENCE_WAV":
      return `#${message.index} ${Number(message.duration).toFixed(1)} s audio`;
    case "TTS_STREAM_START":
      return `${message.totalChunks} sentences, voice ${message.voiceId}`;
    case "MODEL_DOWNLOAD_PROGRESS":
      return `${Math.round((Number(message.downloaded) / Number(message.total)) * 100)}%`;
    default:
      return "";
  }
}

/** Status of one sentence from playback position and what has been generated. */
export function sentenceStatus(params: {
  index: number;
  currentIndex: number;
  isPlaying: boolean;
  hasAudio: boolean;
  generatingIndex: number | null;
}): SentenceStatus {
  const { index, currentIndex, isPlaying, hasAudio, generatingIndex } = params;
  if (index === currentIndex && isPlaying) {
    return "playing";
  }
  if (index < currentIndex && hasAudio) {
    return "played";
  }
  if (hasAudio) {
    return "ready";
  }
  return index === generatingIndex ? "generating" : "waiting";
}

/** Generation speed relative to playback: below 1 means audio is made faster than it plays. */
export function realtimeFactor(sentences: DebugSentence[]): number | null {
  let synthesisMs = 0;
  let audioMs = 0;
  for (const sentence of sentences) {
    if (sentence.report && sentence.durationSec) {
      synthesisMs += sentence.report.synthesisMs;
      audioMs += sentence.durationSec * 1000;
    }
  }
  return audioMs > 0 ? synthesisMs / audioMs : null;
}
