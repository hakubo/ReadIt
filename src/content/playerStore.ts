import { useSyncExternalStore } from "react";
import type { PlayerState } from "./FloatingPlayer";

/**
 * External store for fast-changing playback state.
 * Only components that subscribe via useSyncExternalStore re-render
 * when values change — SettingsPanel and other siblings stay untouched.
 */

export interface PlaybackSnapshot {
  loading: boolean;
  playerState: PlayerState;
  speed: number;
  totalElapsedTime: number;
  totalEstimatedDuration: number;
  finished: boolean;
  downloadProgress: { downloaded: number; total: number } | null;
  error: string | null;
  forceSettingsOpen: boolean;
  domain: string;
  theme: "light" | "dark";
  contentSelector?: string;
}

const DEFAULT_PLAYER_STATE: PlayerState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  currentIndex: 0,
  queueLength: 0,
};

let snapshot: PlaybackSnapshot = {
  loading: false,
  playerState: DEFAULT_PLAYER_STATE,
  speed: 1,
  totalElapsedTime: 0,
  totalEstimatedDuration: 0,
  finished: false,
  downloadProgress: null,
  error: null,
  forceSettingsOpen: false,
  domain: "",
  theme: "dark",
  contentSelector: undefined,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PlaybackSnapshot {
  return snapshot;
}

/** Update the store and notify subscribers. Accepts a partial update. */
export function setPlaybackState(update: Partial<PlaybackSnapshot>): void {
  snapshot = { ...snapshot, ...update };
  emitChange();
}

/** React hook — components re-render only when the snapshot reference changes. */
export function usePlaybackStore(): PlaybackSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// --- Start-up timing of the last read (shown in the settings panel's Status) ---

/** Where the wait between pressing Play and hearing audio went, in ms. */
export interface StartTiming {
  totalMs: number;
  /** Content script: settings, sentence split, quote detection, until GENERATE_TTS is sent */
  prepareReadMs: number;
  /** GENERATE_TTS to offscreen receiving it, including creating the offscreen document */
  toOffscreenMs: number;
  /** Offscreen sending the first WAV to the content script receiving it */
  deliverAudioMs: number;
  /** First WAV received to the player iframe reporting it plays */
  playbackStartMs: number;
  /** Waiting for a warm-up that was still running when Play was pressed */
  warmUpWaitMs: number;
  /** Loading the model; 0 when it was already in memory */
  modelLoadMs: number;
  /** Turning the first sentence into speakable text (URL titles, replacements) */
  textPrepareMs: number;
  /** Phonemizing and running the model for the first sentence */
  synthesisMs: number;
  modelWasLoaded: boolean;
  acceleration: "webgpu" | "cpu";
}

let startTiming: StartTiming | null = null;
const timingListeners = new Set<Listener>();

export function setStartTiming(timing: StartTiming): void {
  startTiming = timing;
  for (const listener of timingListeners) {
    listener();
  }
}

export function getStartTiming(): StartTiming | null {
  return startTiming;
}

export function useStartTiming(): StartTiming | null {
  return useSyncExternalStore(
    (listener) => {
      timingListeners.add(listener);
      return () => timingListeners.delete(listener);
    },
    () => startTiming,
  );
}
