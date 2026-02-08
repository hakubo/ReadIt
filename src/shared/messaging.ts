import type { TTSSettings } from "./types";

// Loading status used by TTS_PROGRESS messages
export type LoadingStatus =
  | "starting"
  | "phonemizing"
  | "loading_model"
  | "generating"
  | "done";

// ---------------------------------------------------------------------------
// Chrome extension messages (chrome.runtime.sendMessage / chrome.tabs.sendMessage)
// ---------------------------------------------------------------------------

// --- Content → Background ---

export type GenerateTTSMessage = {
  type: "GENERATE_TTS";
  sentences: string[];
  settings: TTSSettings;
};

export type FetchPageTitleMessage = {
  type: "FETCH_PAGE_TITLE";
  url: string;
};

export type CheckCacheStatusMessage = {
  type: "CHECK_CACHE_STATUS";
  voiceIds: string[];
};

export type PreviewVoiceMessage = {
  type: "PREVIEW_VOICE";
  voiceId: string;
};

// --- Content → Offscreen (broadcast via chrome.runtime.sendMessage) ---

export type AdvanceGenerationMessage = {
  type: "ADVANCE_GENERATION";
  upTo: number;
};

export type RegenerateSentenceMessage = {
  type: "REGENERATE_SENTENCE";
  index: number;
};

// --- Background → Offscreen ---

export type OffscreenPingMessage = {
  type: "OFFSCREEN_PING";
};

export type OffscreenGenerateTTSMessage = {
  type: "OFFSCREEN_GENERATE_TTS";
  sentences: string[];
  settings: TTSSettings;
};

export type OffscreenPreviewVoiceMessage = {
  type: "OFFSCREEN_PREVIEW_VOICE";
  voiceId: string;
};

export type PlayerResetMessage = {
  type: "PLAYER_RESET";
};

// --- Offscreen → Background (forwarded to content) ---

export type TTSSentenceWavMessage = {
  type: "TTS_SENTENCE_WAV";
  index: number;
  wavBytes: number[];
  duration: number;
};

export type TTSStreamStartMessage = {
  type: "TTS_STREAM_START";
  totalChunks: number;
  sentences: string[];
  lang: string;
  voiceId: string;
};

export type TTSProgressMessage = {
  type: "TTS_PROGRESS";
  status: LoadingStatus;
  currentChunk?: number;
  totalChunks?: number;
};

export type TTSAudioChunkMessage = {
  type: "TTS_AUDIO_CHUNK";
  chunkIndex: number;
  totalChunks: number;
};

export type TTSStreamEndMessage = {
  type: "TTS_STREAM_END";
};

export type ModelDownloadProgressMessage = {
  type: "MODEL_DOWNLOAD_PROGRESS";
  downloaded: number;
  total: number;
};

export type ModelDownloadCompleteMessage = {
  type: "MODEL_DOWNLOAD_COMPLETE";
};

export type VoiceDownloadStartMessage = {
  type: "VOICE_DOWNLOAD_START";
  voiceId: string;
};

export type VoiceDownloadCompleteMessage = {
  type: "VOICE_DOWNLOAD_COMPLETE";
  voiceId: string;
};

export type PreviewStateMessage = {
  type: "PREVIEW_STATE";
  voiceId: string;
  playing: boolean;
};

// --- Offscreen → Background (lifecycle) ---

export type OffscreenReadyMessage = {
  type: "OFFSCREEN_READY";
};

// --- Background → Content (via chrome.tabs.sendMessage) ---

export type ExtensionToggleMessage = {
  type: "EXTENSION_TOGGLE";
  enabled: boolean;
};

export type OpenSettingsMessage = {
  type: "OPEN_SETTINGS";
};

export type PlaybackInterruptedMessage = {
  type: "PLAYBACK_INTERRUPTED";
};

// ---------------------------------------------------------------------------
// Discriminated union of ALL chrome extension messages
// ---------------------------------------------------------------------------

export type ExtensionMessage =
  // Content → Background
  | GenerateTTSMessage
  | FetchPageTitleMessage
  | CheckCacheStatusMessage
  | PreviewVoiceMessage
  // Content → Offscreen (broadcast)
  | AdvanceGenerationMessage
  | RegenerateSentenceMessage
  // Background → Offscreen
  | OffscreenPingMessage
  | OffscreenGenerateTTSMessage
  | OffscreenPreviewVoiceMessage
  | PlayerResetMessage
  // Offscreen → Background → Content
  | TTSSentenceWavMessage
  | TTSStreamStartMessage
  | TTSProgressMessage
  | TTSAudioChunkMessage
  | TTSStreamEndMessage
  | ModelDownloadProgressMessage
  | ModelDownloadCompleteMessage
  | VoiceDownloadStartMessage
  | VoiceDownloadCompleteMessage
  | PreviewStateMessage
  // Offscreen → Background (lifecycle)
  | OffscreenReadyMessage
  // Background → Content
  | ExtensionToggleMessage
  | OpenSettingsMessage
  | PlaybackInterruptedMessage;

// ---------------------------------------------------------------------------
// Message responses (for async sendResponse callbacks)
// ---------------------------------------------------------------------------

export type OffscreenPingResponse = {
  pong: true;
};

export type GenerateTTSResponse = {
  success: boolean;
  error?: string;
  streaming?: boolean;
  aborted?: boolean;
};

export type FetchPageTitleResponse = {
  title: string | null;
};

export type CheckCacheStatusResponse = {
  modelCached: boolean;
  cachedVoices: string[];
};

// ---------------------------------------------------------------------------
// Window messages (content script ↔ player iframe via window.postMessage)
// ---------------------------------------------------------------------------

// Content → Player iframe
export type PlayerLoadWavMessage = {
  type: "LOAD_WAV";
  wavData: ArrayBuffer;
  speed: number;
};

export type PlayerPlayMessage = {
  type: "PLAY";
};

export type PlayerPauseMessage = {
  type: "PAUSE";
};

export type PlayerRestartMessage = {
  type: "RESTART";
};

export type PlayerSetSpeedMessage = {
  type: "SET_SPEED";
  speed: number;
};

export type PlayerResetIframeMessage = {
  type: "RESET";
};

export type PlayerIframeCommand =
  | PlayerLoadWavMessage
  | PlayerPlayMessage
  | PlayerPauseMessage
  | PlayerRestartMessage
  | PlayerSetSpeedMessage
  | PlayerResetIframeMessage;

// Player iframe → Content
export type PlayerReadyEvent = {
  type: "PLAYER_READY";
};

export type PlayerTimeEvent = {
  type: "PLAYER_TIME";
  currentTime: number;
};

export type PlayerPlayingEvent = {
  type: "PLAYER_PLAYING";
};

export type PlayerPausedEvent = {
  type: "PLAYER_PAUSED";
};

export type PlayerEndedEvent = {
  type: "PLAYER_ENDED";
};

export type PlayerErrorEvent = {
  type: "PLAYER_ERROR";
};

export type PlayerIframeEvent =
  | PlayerReadyEvent
  | PlayerTimeEvent
  | PlayerPlayingEvent
  | PlayerPausedEvent
  | PlayerEndedEvent
  | PlayerErrorEvent;
