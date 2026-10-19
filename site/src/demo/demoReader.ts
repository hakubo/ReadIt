// Plays the demo article with pre-rendered Kokoro clips and drives the extension's real
// player store and sentence highlighter, so the page behaves like a read in the extension.
import { HighlightManager } from "@/content/highlighting";
import { setPlaybackState } from "@/content/playerStore";
import { DEFAULT_SETTINGS, type TTSSettings } from "@/shared/types";
import manifest from "./audio-manifest.json";
import script from "./sentences.json";

type ClipVoice = keyof typeof manifest.voices;

const AUDIO_BASE = "./audio";
const CLIP_VOICES = Object.keys(manifest.voices) as ClipVoice[];

export const demoSentences: string[] = script.sentences.map((sentence) => sentence.text);

function isClipVoice(voiceId: string): voiceId is ClipVoice {
  return voiceId in manifest.voices;
}

/**
 * The demo only has four voices recorded. Any other voice maps to the recorded one with the
 * same accent and gender: Kokoro ids start with language + gender ("bf_" = British female).
 */
export function closestClipVoice(voiceId: string): ClipVoice {
  if (isClipVoice(voiceId)) {
    return voiceId;
  }
  const isBritish = voiceId.startsWith("b");
  const isMale = voiceId.charAt(1) === "m";
  return CLIP_VOICES.find((clip) => clip.startsWith("b") === isBritish && (clip.charAt(1) === "m") === isMale) ?? "af_heart";
}

function quoteVoiceFor(mainVoice: ClipVoice, quoteSetting: string): ClipVoice {
  if (quoteSetting === "off") {
    return mainVoice;
  }
  if (quoteSetting === "auto") {
    return script.voices[mainVoice].quoteVoice as ClipVoice;
  }
  return closestClipVoice(quoteSetting);
}

export class DemoReader {
  private readonly audio = new Audio();
  private readonly highlight = new HighlightManager();
  /** Indexes into demoSentences for the current read. */
  private readIndexes: number[] = [];
  private position = 0;
  private hasStarted = false;
  private settings: TTSSettings = DEFAULT_SETTINGS;
  private speed = 1;

  constructor(
    private readonly article: HTMLElement,
    private readonly onVoiceSubstituted: (requested: string, used: ClipVoice) => void,
  ) {
    this.audio.preload = "auto";
    this.audio.addEventListener("ended", () => this.advance());
    this.audio.addEventListener("timeupdate", () => this.publish());
    this.audio.addEventListener("playing", () => {
      this.hasStarted = true;
      this.publish();
    });
    this.audio.addEventListener("pause", () => this.publish());
  }

  get isReading(): boolean {
    return this.readIndexes.length > 0;
  }

  get isPlaying(): boolean {
    return !this.audio.paused;
  }

  get currentSpeed(): number {
    return this.speed;
  }

  applySettings(settings: TTSSettings): void {
    // The panel's speed slider saves settings.speed; the pill's speed button calls setSpeed
    if (settings.speed !== this.settings.speed) {
      this.setSpeed(settings.speed);
    }
    this.settings = settings;
    this.highlight.highlightingEnabled = settings.highlightSentences;
    this.highlight.autoScrollEnabled = settings.autoScroll;
    this.highlight.highlightColor = settings.highlightColor;
    setPlaybackState({ theme: settings.theme });
    if (!this.isReading) {
      return;
    }
    if (settings.highlightSentences) {
      this.highlight.createHighlightOverlay();
      this.highlight.updateHighlight(this.position);
    } else {
      this.highlight.clearCurrentHighlight();
    }
  }

  /** Read demo sentences `from`..`to` (inclusive). */
  start(from = 0, to = demoSentences.length - 1): void {
    this.stop();
    this.readIndexes = demoSentences.map((_, index) => index).filter((index) => index >= from && index <= to);
    this.highlight.contentRoot = this.article;
    this.highlight.sentences = this.readIndexes.map((index) => demoSentences[index]);
    this.highlight.resetSentenceRects();
    if (this.settings.highlightSentences) {
      this.highlight.createHighlightOverlay();
    }
    this.playAt(0);
  }

  play(): void {
    if (!this.isReading) {
      this.start();
      return;
    }
    void this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  restart(): void {
    if (this.isReading) {
      this.playAt(0);
    }
  }

  stop(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.readIndexes = [];
    this.position = 0;
    this.hasStarted = false;
    this.highlight.cleanup();
    setPlaybackState({
      loading: false,
      finished: false,
      totalElapsedTime: 0,
      totalEstimatedDuration: 0,
      playerState: { isPlaying: false, currentTime: 0, duration: 0, currentIndex: 0, queueLength: 0 },
    });
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.audio.playbackRate = speed;
    setPlaybackState({ speed });
  }

  skip(delta: number): void {
    if (this.isReading) {
      this.playAt(Math.max(0, Math.min(this.position + delta, this.readIndexes.length - 1)));
    }
  }

  /** Click-to-seek: jump to the sentence under a click, if the click hit one. */
  seekToPoint(clientX: number, clientY: number): boolean {
    if (!this.isReading) {
      return false;
    }
    const index = this.highlight.getSentenceIndexAtPoint(clientX, clientY);
    if (index < 0) {
      return false;
    }
    this.playAt(index);
    return true;
  }

  private clipVoiceFor(sentenceIndex: number): ClipVoice {
    const requested = this.settings.voices[0] ?? "af_heart";
    const mainVoice = closestClipVoice(requested);
    if (mainVoice !== requested) {
      this.onVoiceSubstituted(requested, mainVoice);
    }
    const isQuoted = "quoted" in script.sentences[sentenceIndex];
    return isQuoted ? quoteVoiceFor(mainVoice, this.settings.quoteVoice) : mainVoice;
  }

  private playAt(position: number): void {
    this.position = position;
    const sentenceIndex = this.readIndexes[position];
    this.audio.src = `${AUDIO_BASE}/${this.clipVoiceFor(sentenceIndex)}/${sentenceIndex}.mp3`;
    this.audio.playbackRate = this.speed;
    this.highlight.updateHighlight(position);
    this.publish();
    void this.audio.play().catch(() => this.publish());
  }

  private advance(): void {
    if (this.position < this.readIndexes.length - 1) {
      this.playAt(this.position + 1);
      return;
    }
    this.highlight.clearCurrentHighlight();
    this.publish(true);
  }

  private durationOf(position: number): number {
    const voice = closestClipVoice(this.settings.voices[0] ?? "af_heart");
    return manifest.voices[voice][this.readIndexes[position]];
  }

  private publish(finished = false): void {
    const durations = this.readIndexes.map((_, position) => this.durationOf(position));
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    const before = durations.slice(0, this.position).reduce((sum, duration) => sum + duration, 0);
    setPlaybackState({
      loading: !this.hasStarted,
      finished,
      totalEstimatedDuration: total,
      totalElapsedTime: finished ? total : before + this.audio.currentTime,
      playerState: {
        isPlaying: !this.audio.paused && !finished,
        currentTime: this.audio.currentTime,
        duration: this.audio.duration || 0,
        currentIndex: this.position,
        queueLength: this.hasStarted ? this.readIndexes.length : 0,
      },
    });
  }
}
