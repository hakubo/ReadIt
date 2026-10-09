import { generateVoice, isSessionCached, preloadModel } from "@/lib/kokoro";
import { createWavBuffer } from "@/lib/kokoro/createWavBuffer";
import { acceleration } from "@/lib/kokoro/detectWebGPU";
import { voicesMap, isVoiceCached, resolveLanguageVoice, resolveQuoteVoice } from "@/lib/resources";
import { DEFAULT_SETTINGS, SENTENCE_PAUSE_MS, type ReadHints, type TTSSettings } from "@/shared/types";
import { expandAbbreviations, firstAbbreviationUses } from "@/shared/abbreviations";
import { arrayBufferToBase64 } from "@/shared/binary";
import { hasSpeakableText } from "@/shared/speakable";
import { isMessageForRead } from "@/shared/readId";
import { warmUp, waitForWarmUp, isWarmingUp } from "./warmUp";
import { cleanHandles, humanizeText, replaceUrlsWithDomains, stripEmojis } from "@/content/textProcessing";
import { speakWrittenForms, spokenFormsForVoice } from "@/content/spokenForms";
import {
  createGenerationQueue,
  isQueueComplete,
  takeNextSentenceIndex,
  type GenerationQueue,
} from "./generationQueue";

const SAMPLE_RATE = 24000;
const GENERATION_WINDOW = 15;
// After this many failed sentences in a row the engine itself is broken
// (model, voice download): report an error instead of reading silence.
const MAX_CONSECUTIVE_FAILURES = 3;

interface SentenceVoice {
  voiceId: string;
  lang: string;
}

interface ReadGeneration extends GenerationQueue {
  readId: string;
  aborted: boolean;
  sentences: string[];
  settings: TTSSettings;
  lang: string;
  voiceId: string;
  /** Voice for quoted sentences, or null to use voiceId for them too. */
  quoteVoice: SentenceVoice | null;
  quotedSentences: Set<number>;
  hints: ReadHints;
  /** Voice per lang attribute value (null: the main voice speaks it), resolved on first use. */
  languageVoices: Map<string, SentenceVoice | null>;
  /** Sentence index -> abbreviations first used there (expanded only there). */
  abbreviationUses: Map<number, string[]>;
  preparedText: Map<number, string>;
  timing: ReadTiming;
  /** Resolves the loop's wait when it is parked at the window limit. */
  wake: (() => void) | null;
}

/** Start-up timestamps (performance.now()) for the read's first audio, reported once. */
interface ReadTiming {
  receivedAt: number;
  /** Date.now() stamps, comparable with the content script's clock */
  receivedAtEpoch: number;
  warmUpDoneAt: number;
  modelReadyAt: number;
  modelWasLoaded: boolean;
  textPrepareMs: number | null;
  synthesisMs: number | null;
  reported: boolean;
}

function createReadTiming(): ReadTiming {
  const now = performance.now();
  return {
    receivedAt: now,
    receivedAtEpoch: Date.now(),
    warmUpDoneAt: now,
    modelReadyAt: now,
    modelWasLoaded: isSessionCached(),
    textPrepareMs: null,
    synthesisMs: null,
    reported: false,
  };
}

type GenerationResult = { success: boolean; aborted?: boolean; empty?: boolean; streaming?: boolean; error?: string };

const ABORTED: GenerationResult = { success: true, aborted: true };

let currentRead: ReadGeneration | null = null;
let isGenerating = false;
let activeGeneration: Promise<unknown> | null = null;
let isPreviewing = false;

function wakeLoop(read: ReadGeneration) {
  const wake = read.wake;
  read.wake = null;
  wake?.();
}

// Abort the current read. If its loop is parked at the window limit, wake it
// so it observes the abort — otherwise it waits forever and the next
// OFFSCREEN_GENERATE_TTS deadlocks on `await activeGeneration`.
function requestAbort() {
  if (!currentRead) {
    return;
  }
  currentRead.aborted = true;
  wakeLoop(currentRead);
}

/** Send a message stamped with the read it belongs to. */
function sendForRead(read: ReadGeneration, message: Record<string, unknown>) {
  chrome.runtime.sendMessage({ ...message, readId: read.readId });
}

function voiceLang(voiceId: string): string {
  return voicesMap[voiceId as keyof typeof voicesMap]?.lang?.id || "en-us";
}

interface ReadRequest {
  readId: string;
  sentences: string[];
  quotedSentences: number[];
  hints: ReadHints;
  settings: TTSSettings;
}

function createReadGeneration({ readId, sentences, quotedSentences, hints, settings }: ReadRequest): ReadGeneration {
  const voiceIds = settings.voices;
  const voiceId = voiceIds[Math.floor(Math.random() * voiceIds.length)];
  const quoteVoiceId = quotedSentences.length > 0 ? resolveQuoteVoice(voiceId, settings.quoteVoice) : null;
  return {
    ...createGenerationQueue(sentences.length, GENERATION_WINDOW),
    readId,
    aborted: false,
    sentences,
    settings,
    lang: voiceLang(voiceId),
    voiceId,
    quoteVoice: quoteVoiceId ? { voiceId: quoteVoiceId, lang: voiceLang(quoteVoiceId) } : null,
    quotedSentences: new Set(quotedSentences),
    hints,
    languageVoices: new Map(),
    abbreviationUses: settings.expandAbbreviations
      ? firstAbbreviationUses(sentences, hints.abbreviations ?? {})
      : new Map(),
    preparedText: new Map(),
    timing: createReadTiming(),
    wake: null,
  };
}

// --- Sentence text ---

/** The sentence with abbreviations first used in it spelled out ("Application Programming Interface (API)"). */
function sentenceWithAbbreviations(read: ReadGeneration, index: number): string {
  const uses = read.abbreviationUses.get(index);
  const sentence = read.sentences[index];
  return uses ? expandAbbreviations(sentence, uses, read.hints.abbreviations ?? {}) : sentence;
}

function processSentenceForSpeech(read: ReadGeneration, index: number): string {
  const { settings } = read;
  const cleaned = cleanHandles(replaceUrlsWithDomains(sentenceWithAbbreviations(read, index)));
  const spokenForms = spokenFormsForVoice(voiceForSentence(read, index).voiceId);
  const written = spokenForms ? speakWrittenForms(cleaned, spokenForms) : cleaned;
  const humanized = humanizeText(written, settings.textReplacements);
  return settings.skipEmojis ? stripEmojis(humanized) : humanized;
}

/** Speakable text for one sentence, memoised (a re-generated sentence reuses it). */
function prepareSentenceText(read: ReadGeneration, index: number): string {
  let prepared = read.preparedText.get(index);
  if (prepared === undefined) {
    prepared = processSentenceForSpeech(read, index);
    read.preparedText.set(index, prepared);
  }
  return prepared;
}

// --- Audio ---

function createSilenceWaveform(ms: number): Float32Array {
  const samples = Math.floor((ms / 1000) * SAMPLE_RATE);
  return new Float32Array(samples);
}

/** Speech for one sentence. Throws if generation fails. */
async function synthesizeSentence(read: ReadGeneration, index: number): Promise<Float32Array> {
  const preparingAt = performance.now();
  const text = prepareSentenceText(read, index);
  const synthesizingAt = performance.now();
  try {
    return await synthesizeText(read, index, text);
  } finally {
    recordFirstSentenceTiming(read, synthesizingAt - preparingAt, performance.now() - synthesizingAt);
  }
}

function recordFirstSentenceTiming(read: ReadGeneration, textPrepareMs: number, synthesisMs: number) {
  if (read.timing.textPrepareMs !== null) {
    return;
  }
  read.timing.textPrepareMs = textPrepareMs;
  read.timing.synthesisMs = synthesisMs;
}

/** Tell the content script where the start-up time went, once, with the first audio. */
function reportStartTiming(read: ReadGeneration) {
  const timing = read.timing;
  if (timing.reported) {
    return;
  }
  timing.reported = true;
  sendForRead(read, {
    type: "TTS_TIMING",
    warmUpWaitMs: timing.warmUpDoneAt - timing.receivedAt,
    modelLoadMs: timing.modelReadyAt - timing.warmUpDoneAt,
    textPrepareMs: timing.textPrepareMs ?? 0,
    synthesisMs: timing.synthesisMs ?? 0,
    modelWasLoaded: timing.modelWasLoaded,
    acceleration,
    receivedAt: timing.receivedAtEpoch,
    firstAudioSentAt: Date.now(),
  });
}

async function synthesizeText(read: ReadGeneration, index: number, text: string): Promise<Float32Array> {
  // Text processing can leave nothing to say (e.g. only emoji with skipEmojis
  // on). Send just the pause so playback moves on instead of waiting forever.
  if (!hasSpeakableText(text)) {
    return new Float32Array(0);
  }
  const voice = voiceForSentence(read, index);
  const result = await generateVoice({ text, lang: voice.lang, voiceId: voice.voiceId });
  return result.waveform;
}

/** Voice for a sentence marked (or on a page) in another language, or null for the main voice. */
function languageVoiceFor(read: ReadGeneration, index: number): SentenceVoice | null {
  if (read.settings.switchVoiceByLanguage === false) {
    return null;
  }
  const language = read.hints.sentenceLanguages?.[index] ?? read.hints.pageLanguage;
  if (!language) {
    return null;
  }
  if (!read.languageVoices.has(language)) {
    const voiceId = resolveLanguageVoice(read.voiceId, language);
    read.languageVoices.set(language, voiceId ? { voiceId, lang: voiceLang(voiceId) } : null);
  }
  return read.languageVoices.get(language) ?? null;
}

/** Language beats quote: a French quote is read by a French voice. */
function voiceForSentence(read: ReadGeneration, index: number): SentenceVoice {
  const languageVoice = languageVoiceFor(read, index);
  if (languageVoice) {
    return languageVoice;
  }
  const quoteVoice = read.quotedSentences.has(index) ? read.quoteVoice : null;
  return quoteVoice ?? { voiceId: read.voiceId, lang: read.lang };
}

/** What the debug panel shows per sentence; small enough to send with every WAV. */
interface SentenceReport {
  synthesisMs: number;
  spokenText: string;
  voiceId: string;
  failed: boolean;
}

function sendSentenceWav(read: ReadGeneration, index: number, speech: Float32Array, report: SentenceReport) {
  const silence = createSilenceWaveform(SENTENCE_PAUSE_MS);
  // Append silence gap after sentence
  const withSilence = new Float32Array(speech.length + silence.length);
  withSilence.set(speech, 0);
  withSilence.set(silence, speech.length);
  const wavData = createWavBuffer(withSilence, SAMPLE_RATE);

  // Chrome extension messaging is JSON-serialized, so ArrayBuffer can't
  // be sent directly. Base64 is ~1.33x the raw size; a number array is ~4x.
  sendForRead(read, {
    type: "TTS_SENTENCE_WAV",
    index,
    wavBase64: arrayBufferToBase64(wavData),
    duration: withSilence.length / SAMPLE_RATE,
    report,
  });
}

/**
 * Generate and send one sentence. A failed sentence is sent as silence so
 * playback moves past it instead of waiting for audio that never comes.
 * Returns false when generation failed.
 */
async function generateSentence(read: ReadGeneration, index: number): Promise<boolean> {
  let speech: Float32Array;
  let succeeded = true;
  const startedAt = performance.now();
  try {
    speech = await synthesizeSentence(read, index);
  } catch (error) {
    console.error(`Error generating sentence ${index}:`, error);
    speech = new Float32Array(0);
    succeeded = false;
  }
  if (read.aborted) {
    return succeeded;
  }
  read.generated.add(index);
  sendSentenceWav(read, index, speech, {
    synthesisMs: performance.now() - startedAt,
    spokenText: prepareSentenceText(read, index),
    voiceId: voiceForSentence(read, index).voiceId,
    failed: !succeeded,
  });
  reportStartTiming(read);
  sendForRead(read, { type: "TTS_AUDIO_CHUNK", chunkIndex: index, totalChunks: read.total });
  return succeeded;
}

// --- Generation loop ---

async function ensureModelLoaded(read: ReadGeneration) {
  if (isSessionCached()) {
    return;
  }
  await preloadModel((downloaded, total) => {
    sendForRead(read, { type: "MODEL_DOWNLOAD_PROGRESS", downloaded, total });
  });
  sendForRead(read, { type: "MODEL_DOWNLOAD_COMPLETE" });
}

function waitForWork(read: ReadGeneration): Promise<void> {
  return new Promise<void>((resolve) => { read.wake = resolve; });
}

function reportProgress(read: ReadGeneration, index: number) {
  sendForRead(read, {
    type: "TTS_PROGRESS",
    status: index === 0 && !isSessionCached() ? "loading_model" : "generating",
    currentChunk: index + 1,
    totalChunks: read.total,
  });
}

/** Tells the settings panel when the voice file is being downloaded for this read. */
function createVoiceDownloadNotifier(voiceId: string, voiceCached: boolean) {
  let state: "pending" | "started" | "done" = voiceCached ? "done" : "pending";
  return {
    beforeSentence() {
      if (state === "pending") {
        state = "started";
        chrome.runtime.sendMessage({ type: "VOICE_DOWNLOAD_START", voiceId });
      }
    },
    // The voice file is cached once a sentence has been generated with it
    afterSentence(succeeded: boolean) {
      if (state === "started" && succeeded) {
        state = "done";
        chrome.runtime.sendMessage({ type: "VOICE_DOWNLOAD_COMPLETE", voiceId });
      }
    },
  };
}

async function generateAllSentences(read: ReadGeneration): Promise<GenerationResult> {
  const voiceDownload = createVoiceDownloadNotifier(read.voiceId, await isVoiceCached(read.voiceId));
  let consecutiveFailures = 0;
  while (!read.aborted && !isQueueComplete(read)) {
    const index = takeNextSentenceIndex(read);
    if (index === null) {
      await waitForWork(read);
      continue;
    }
    voiceDownload.beforeSentence();
    reportProgress(read, index);
    const succeeded = await generateSentence(read, index);
    voiceDownload.afterSentence(succeeded);
    consecutiveFailures = succeeded ? 0 : consecutiveFailures + 1;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      return { success: false, error: "Speech generation keeps failing" };
    }
  }
  return read.aborted ? ABORTED : { success: true, streaming: true };
}

async function runRead(read: ReadGeneration): Promise<GenerationResult> {
  await waitForWarmUp();
  read.timing.warmUpDoneAt = performance.now();
  read.timing.modelWasLoaded = isSessionCached();
  await ensureModelLoaded(read);
  read.timing.modelReadyAt = performance.now();
  // A reset during the model download must still cancel this read.
  if (read.aborted) {
    return ABORTED;
  }
  if (read.total === 0) {
    sendForRead(read, { type: "TTS_STREAM_END" });
    return { success: true, empty: true };
  }

  sendForRead(read, {
    type: "TTS_STREAM_START",
    totalChunks: read.total,
    sentences: read.sentences,
    lang: read.lang,
    voiceId: read.voiceId,
  });
  const result = await generateAllSentences(read);
  if (!read.aborted && result.success) {
    sendForRead(read, { type: "TTS_STREAM_END" });
  }
  return result;
}

async function startRead(read: ReadGeneration, previous: Promise<unknown> | null): Promise<GenerationResult> {
  await previous?.catch(() => {});
  if (read.aborted) {
    return ABORTED;
  }
  isGenerating = true;
  try {
    return await runRead(read);
  } finally {
    isGenerating = false;
  }
}

function handleGenerateMessage(message: Record<string, unknown>, sendResponse: (response: unknown) => void) {
  // Abort the previous read, then make the new one current right away, so a
  // PLAYER_RESET for it is honoured even while the old one is winding down.
  requestAbort();
  const sentences = (message.sentences as string[] | undefined) ?? [];
  const read = createReadGeneration({
    readId: message.readId as string,
    sentences,
    quotedSentences: (message.quotedSentences as number[] | undefined) ?? [],
    hints: (message.hints as ReadHints | undefined) ?? {},
    settings: { ...DEFAULT_SETTINGS, ...(message.settings as Partial<TTSSettings> | undefined) },
  });
  currentRead = read;

  const generation = startRead(read, activeGeneration);
  activeGeneration = generation;
  generation
    .then(sendResponse, (error: unknown) => {
      sendResponse({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
    })
    .finally(() => {
      if (activeGeneration === generation) {
        activeGeneration = null;
      }
    });
}

/** The current read, if the message belongs to it. */
function readForMessage(message: { readId?: unknown }): ReadGeneration | null {
  if (!currentRead || !isMessageForRead(message, currentRead.readId)) {
    return null;
  }
  return currentRead;
}

function handleAdvanceGeneration(read: ReadGeneration, upTo: number) {
  if (upTo > read.generateUpTo) {
    read.generateUpTo = upTo;
  }
  wakeLoop(read);
}

function handleRegenerateSentence(read: ReadGeneration, index: number) {
  // Generate this sentence next and move the window so generation continues from there.
  read.priorityIndex = index;
  if (index + GENERATION_WINDOW > read.generateUpTo) {
    read.generateUpTo = index + GENERATION_WINDOW;
  }
  wakeLoop(read);
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "OFFSCREEN_PING") {
    // Background closes this document when idle; "busy" keeps it open.
    sendResponse({ pong: true, busy: isGenerating || isPreviewing || isWarmingUp() });
    return;
  }

  if (message.type === "OFFSCREEN_WARM_UP") {
    warmUp(String(message.voiceId), () => isGenerating || isPreviewing);
    return;
  }

  if (message.type === "OFFSCREEN_GENERATE_TTS") {
    handleGenerateMessage(message, sendResponse);
    return true;
  }

  // Read control messages are broadcast by every tab; obey only the current read's.
  const read = readForMessage(message);
  if (message.type === "PLAYER_RESET" && read) {
    // Keep the model loaded so the next read starts fast. Background closes
    // this document after an idle timeout, which frees the model memory.
    requestAbort();
  }

  if (message.type === "ADVANCE_GENERATION" && read) {
    handleAdvanceGeneration(read, message.upTo as number);
  }

  if (message.type === "REGENERATE_SENTENCE" && read) {
    handleRegenerateSentence(read, message.index as number);
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

  if (isGenerating || isPreviewing) {
    chrome.runtime.sendMessage({ type: "PREVIEW_STATE", voiceId, playing: false });
    return;
  }

  chrome.runtime.sendMessage({ type: "PREVIEW_STATE", voiceId, playing: true });
  isPreviewing = true;
  try {
    const voice = voicesMap[voiceId as keyof typeof voicesMap];
    const result = await generateVoice({
      text: "This is how I sound reading your pages.",
      lang: voice?.lang?.id || "en-us",
      voiceId,
    });
    const wavBuffer = createWavBuffer(result.waveform, SAMPLE_RATE);
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
  isPreviewing = false;
}

console.log("Read it! offscreen document loaded");

// Signal to background that the message listener is ready
chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" });
