// Audio playback engine: manages iframe communication, WAV data, and sentence navigation.
// All state is encapsulated in an AudioEngine instance.

import type { PlayerState } from "./FloatingPlayer";

export interface AudioEngineCallbacks {
  onPlayStateChange: (isPlaying: boolean) => void;
  onTimeUpdate: (elapsed: number, sentenceIdx: number) => void;
  onSentenceEnded: () => void;
  onSentencePlay: (sentenceIdx: number) => void;
}

const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL("")).origin;

export class AudioEngine {
  private iframe: HTMLIFrameElement | null = null;
  private iframeReady = false;
  private msgQueue: Record<string, unknown>[] = [];
  private callbacks: AudioEngineCallbacks;

  sentenceWavData: (ArrayBuffer | null)[] = [];
  sentenceDurations: number[] = [];
  currentSentenceIdx = 0;
  isManuallyNavigating = false;
  currentSentenceElapsed = 0;
  generationSentences: string[] = [];

  constructor(callbacks: AudioEngineCallbacks) {
    this.callbacks = callbacks;
  }

  /** Create the hidden player iframe if it doesn't exist yet. */
  ensurePlayerIframe(): HTMLIFrameElement {
    if (this.iframe) {return this.iframe;}

    // Remove stale iframes from previous extension loads
    document.querySelectorAll("iframe[data-readit-player]").forEach(el => el.remove());

    const iframeSrc = chrome.runtime.getURL("player.html");
    this.iframe = document.createElement("iframe");
    this.iframe.src = iframeSrc;
    this.iframe.setAttribute("data-readit-player", "1");
    this.iframe.style.cssText = "width:0;height:0;border:none;position:fixed;top:-9999px;";
    this.iframe.allow = "autoplay";
    document.documentElement.appendChild(this.iframe);

    window.addEventListener("message", (e) => {
      if (e.source !== this.iframe?.contentWindow) {return;}
      if (e.origin !== EXTENSION_ORIGIN) {return;}
      const msg = e.data;
      if (!msg || !msg.type) {return;}
      this.handlePlayerMessage(msg);
    });

    return this.iframe;
  }

  /** React to a message from player.html. */
  handlePlayerMessage(msg: { type: string; currentTime?: number }): void {
    switch (msg.type) {
      case "PLAYER_READY":
        this.flushQueue();
        break;
      case "PLAYER_TIME":
        this.currentSentenceElapsed = (msg.currentTime || 0) * this.getCurrentSpeed();
        this.callbacks.onTimeUpdate(this.computeElapsedTime(), this.currentSentenceIdx);
        break;
      case "PLAYER_ENDED":
        this.callbacks.onSentenceEnded();
        break;
      case "PLAYER_PLAYING":
        this.callbacks.onPlayStateChange(true);
        break;
      // PLAYER_ERROR: play() was rejected (e.g. autoplay policy). Show it as
      // paused so the user can press play instead of seeing a stuck Pause.
      case "PLAYER_PAUSED":
      case "PLAYER_ERROR":
        this.callbacks.onPlayStateChange(false);
        break;
    }
  }

  private flushQueue(): void {
    this.iframeReady = true;
    for (const queued of this.msgQueue) {
      this.iframe?.contentWindow?.postMessage(queued, EXTENSION_ORIGIN);
    }
    this.msgQueue = [];
  }

  private _currentSpeed = 1;

  getCurrentSpeed(): number {
    return this._currentSpeed;
  }

  setCurrentSpeed(speed: number): void {
    this._currentSpeed = speed;
  }

  /** Post a message to the player iframe, queuing if not ready. */
  postToPlayer(msg: Record<string, unknown>): void {
    this.ensurePlayerIframe();
    if (!this.iframeReady) {
      this.msgQueue.push(msg);
      return;
    }
    this.iframe?.contentWindow?.postMessage(msg, EXTENSION_ORIGIN);
  }

  /** Compute total elapsed time across all played sentences. */
  computeElapsedTime(): number {
    let elapsed = 0;
    for (let i = 0; i < this.currentSentenceIdx; i++) {
      elapsed += this.sentenceDurations[i] || 0;
    }
    elapsed += this.currentSentenceElapsed;
    return elapsed;
  }

  /** Compute estimated total duration from known durations + text-length estimate. */
  computeTotalDuration(totalChunks: number, initialEstimatedDuration: number): number {
    let knownTotal = 0;
    let knownCount = 0;
    for (const d of this.sentenceDurations) {
      if (d > 0) {
        knownTotal += d;
        knownCount++;
      }
    }
    if (knownCount === 0) {return initialEstimatedDuration;}
    const remaining = totalChunks - knownCount;
    if (remaining > 0) {
      const avg = knownTotal / knownCount;
      return knownTotal + avg * remaining;
    }
    return knownTotal;
  }

  /** Play the current sentence's WAV data. */
  playCurrentSentence(): void {
    const index = this.currentSentenceIdx;
    const wavData = this.sentenceWavData[index];
    if (!wavData) {return;}

    this.currentSentenceElapsed = 0;
    this.isManuallyNavigating = false;

    this.postToPlayer({ type: "LOAD_WAV", index, wavData, speed: this._currentSpeed });
    this.preloadNextSentence();
    this.callbacks.onSentencePlay(index);
  }

  /**
   * Hand the next sentence's WAV to the player's idle <audio> element so it is
   * loaded and decoded before the current one ends. No-op if not generated yet;
   * call again when it arrives.
   */
  preloadNextSentence(): void {
    const index = this.currentSentenceIdx + 1;
    const wavData = this.sentenceWavData[index];
    if (!wavData) {return;}
    this.postToPlayer({ type: "PRELOAD_WAV", index, wavData });
  }

  play(): void {
    this.postToPlayer({ type: "PLAY" });
  }

  pause(): void {
    this.postToPlayer({ type: "PAUSE" });
  }

  restart(): void {
    this.postToPlayer({ type: "RESTART" });
  }

  setSpeed(speed: number): void {
    this._currentSpeed = speed;
    this.postToPlayer({ type: "SET_SPEED", speed });
  }

  /** Build a PlayerState snapshot from current engine state. */
  getPlayerState(isPlaying: boolean): PlayerState {
    return {
      isPlaying,
      currentTime: this.computeElapsedTime(),
      duration: 0,
      currentIndex: this.currentSentenceIdx,
      queueLength: this.sentenceWavData.filter(d => d !== null).length,
    };
  }

  /** Reset all audio engine state. */
  cleanup(): void {
    this.postToPlayer({ type: "RESET" });
    this.sentenceWavData = [];
    this.sentenceDurations = [];
    this.currentSentenceIdx = 0;
    this.currentSentenceElapsed = 0;
    this.isManuallyNavigating = false;
    this.generationSentences = [];
  }
}
