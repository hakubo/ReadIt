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
