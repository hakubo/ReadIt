import { generateVoice, isSessionCached, preloadModel, releaseModel } from "@/lib/kokoro";
import { createWavBuffer } from "@/lib/kokoro/createWavBuffer";
import { voicesMap, isVoiceCached } from "@/lib/resources";
import { DEFAULT_SETTINGS, type TTSSettings } from "@/shared/types";

const SAMPLE_RATE = 24000;
const PAUSE_AFTER_SENTENCE_MS = 300;

let abortGeneration = false;
let isGenerating = false;
let activeGeneration: Promise<unknown> | null = null;

const GENERATION_WINDOW = 15;
let generateUpTo = GENERATION_WINDOW - 1;
let generateResolve: (() => void) | null = null;
let priorityIndex = -1; // User seek: generate this sentence next (forward skip or backward out-of-order)

function createSilenceWaveform(ms: number): Float32Array {
  const samples = Math.floor((ms / 1000) * SAMPLE_RATE);
  return new Float32Array(samples);
}

function freeMemory() {
  releaseModel().catch(() => {});
}

async function generateAndSendWav(index: number, sentence: string, lang: string, voiceId: string) {
  const silence = createSilenceWaveform(PAUSE_AFTER_SENTENCE_MS);

  const result = await generateVoice({
    text: sentence,
    lang,
    voiceId,
  });

  // Append silence gap after sentence
  const withSilence = new Float32Array(result.waveform.length + silence.length);
  withSilence.set(result.waveform, 0);
  withSilence.set(silence, result.waveform.length);

  const duration = withSilence.length / SAMPLE_RATE;
  const wavData = createWavBuffer(withSilence as Float32Array<ArrayBuffer>, SAMPLE_RATE);

  // Chrome extension messaging is JSON-serialized, so ArrayBuffer can't
  // be sent directly. Convert to a plain number array for transit.
  chrome.runtime.sendMessage({
    type: "TTS_SENTENCE_WAV",
    index,
    wavBytes: Array.from(new Uint8Array(wavData)),
    duration,
  });
}

async function handleGenerateTTSStreaming(
  preSplitSentences: string[],
  settings: TTSSettings = DEFAULT_SETTINGS,
) {
  const voicesList = settings.voices;
  const selectedVoiceId = voicesList[Math.floor(Math.random() * voicesList.length)];
  const voice = voicesMap[selectedVoiceId as keyof typeof voicesMap];
  const lang = voice?.lang?.id || "en-us";

  // Load model if not cached
  if (!isSessionCached()) {
    await preloadModel((downloaded, total) => {
      chrome.runtime.sendMessage({
        type: "MODEL_DOWNLOAD_PROGRESS",
        downloaded,
        total,
      });
    });
    chrome.runtime.sendMessage({ type: "MODEL_DOWNLOAD_COMPLETE" });
  }

  // Content script pre-splits and pre-processes sentences to ensure
  // highlighting indices and audio indices always match.
  const sentences = preSplitSentences;
  const totalSentences = sentences.length;

  // Reset state
  abortGeneration = false;
  isGenerating = true;
  generateUpTo = GENERATION_WINDOW - 1;
  generateResolve = null;
  priorityIndex = -1;

  chrome.runtime.sendMessage({
    type: "TTS_STREAM_START",
    totalChunks: totalSentences,
    sentences,
    lang,
    voiceId: selectedVoiceId,
  });

  const generated = new Set<number>(); // Track which sentences have been generated
  let voiceDownloadNotified = false;
  const voiceCached = await isVoiceCached(selectedVoiceId);

  for (let i = 0; i < sentences.length; i++) {
    if (abortGeneration) {
      console.log("TTS generation aborted");
      isGenerating = false;
      freeMemory();
      return { success: true, aborted: true };
    }

    // Handle priority seek (user clicked on a sentence)
    if (priorityIndex >= 0) {
      const pi = priorityIndex;
      priorityIndex = -1;
      // Move loop to the priority sentence (forward or backward)
      i = pi - 1; // for-loop will increment to pi
      continue;
    }

    // Skip already-generated sentences (happens after backward seek)
    if (generated.has(i)) {continue;}

    // Wait if we've reached the current generation window limit
    while (i > generateUpTo && !abortGeneration) {
      await new Promise<void>(resolve => { generateResolve = resolve; });
      generateResolve = null;
      if (priorityIndex >= 0) {break;} // handle at top of next iteration
    }
    if (priorityIndex >= 0) {
      i--; // re-process this index after handling priority at loop top
      continue;
    }
    if (abortGeneration) {
      console.log("TTS generation aborted");
      isGenerating = false;
      freeMemory();
      return { success: true, aborted: true };
    }

    const status = i === 0 && !isSessionCached()
      ? "loading_model"
      : "generating";
    chrome.runtime.sendMessage({
      type: "TTS_PROGRESS",
      status,
      currentChunk: i + 1,
      totalChunks: totalSentences,
    });

    try {
      if (!voiceDownloadNotified && !voiceCached) {
        voiceDownloadNotified = true;
        chrome.runtime.sendMessage({ type: "VOICE_DOWNLOAD_START", voiceId: selectedVoiceId });
      }
      await generateAndSendWav(i, sentences[i], lang, selectedVoiceId);
      generated.add(i);

      // Notify voice download complete after first successful generation
      // (voice file is now cached)
      if (generated.size === 1 && voiceDownloadNotified) {
        chrome.runtime.sendMessage({ type: "VOICE_DOWNLOAD_COMPLETE", voiceId: selectedVoiceId });
      }

      chrome.runtime.sendMessage({
        type: "TTS_AUDIO_CHUNK",
        chunkIndex: i,
        totalChunks: totalSentences,
      });
    } catch (error) {
      console.error(`Error generating chunk ${i}:`, error);
    }
  }

  isGenerating = false;

  if (!abortGeneration) {
    chrome.runtime.sendMessage({
      type: "TTS_STREAM_END",
    });
  }

  return { success: true, streaming: true };
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "OFFSCREEN_PING") {
    sendResponse({ pong: true });
    return;
  }

  if (message.type === "OFFSCREEN_GENERATE_TTS") {
    (async () => {
      // Abort previous generation if still running
      if (activeGeneration) {
        abortGeneration = true;
        await activeGeneration.catch(() => {});
      }

      const gen = handleGenerateTTSStreaming(message.sentences, message.settings);
      activeGeneration = gen;
      try {
        const result = await gen;
        sendResponse(result);
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        if (activeGeneration === gen) {activeGeneration = null;}
      }
    })();
    return true;
  }

  if (message.type === "PLAYER_RESET") {
    abortGeneration = true;
    const wasGenerating = isGenerating;
    isGenerating = false;
    if (!wasGenerating) {releaseModel().catch(() => {});}
  }

  if (message.type === "ADVANCE_GENERATION") {
    const newUpTo = message.upTo as number;
    if (newUpTo > generateUpTo) {generateUpTo = newUpTo;}
    if (generateResolve) {generateResolve();}
  }

  if (message.type === "REGENERATE_SENTENCE") {
    const idx = message.index as number;
    // Tell the main generation loop to prioritize this sentence next.
    // Also advance the window so generation continues from there.
    priorityIndex = idx;
    if (idx + GENERATION_WINDOW > generateUpTo) {
      generateUpTo = idx + GENERATION_WINDOW;
    }
    if (generateResolve) {generateResolve();} // Wake loop if paused at window limit
  }

  if (message.type === "OFFSCREEN_PREVIEW_VOICE") {
    handlePreviewVoice(message.voiceId);
  }
});

// --- Voice preview ---
let previewAudio: HTMLAudioElement | null = null;
let previewBlobUrl: string | null = null;

function cleanupPreviewAudio() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.src = "";
    previewAudio = null;
  }
  if (previewBlobUrl) {
    URL.revokeObjectURL(previewBlobUrl);
    previewBlobUrl = null;
  }
}

async function handlePreviewVoice(voiceId: string) {
  cleanupPreviewAudio();

  if (isGenerating) {
    chrome.runtime.sendMessage({ type: "PREVIEW_STATE", voiceId, playing: false });
    return;
  }

  chrome.runtime.sendMessage({ type: "PREVIEW_STATE", voiceId, playing: true });
  isGenerating = true;
  try {
    const voice = voicesMap[voiceId as keyof typeof voicesMap];
    const result = await generateVoice({
      text: "unmute page is really helpful",
      lang: voice?.lang?.id || "en-us",
      voiceId,
    });
    const wavBuffer = createWavBuffer(result.waveform as Float32Array<ArrayBuffer>, SAMPLE_RATE);
    const blob = new Blob([wavBuffer], { type: "audio/wav" });
    previewBlobUrl = URL.createObjectURL(blob);
    previewAudio = new Audio(previewBlobUrl);
    previewAudio.addEventListener("ended", () => {
      cleanupPreviewAudio();
      chrome.runtime.sendMessage({ type: "PREVIEW_STATE", voiceId, playing: false });
    });
    await previewAudio.play();
  } catch {
    cleanupPreviewAudio();
    chrome.runtime.sendMessage({ type: "PREVIEW_STATE", voiceId, playing: false });
  }
  isGenerating = false;
}

console.log("unmute.page offscreen document loaded");

// Signal to background that the message listener is ready
chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" });
