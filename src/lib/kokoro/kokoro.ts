import { getModel } from "@/lib/resources";
import type { LangId, ShapedVoice } from "@/lib/resources";
import { acceleration } from "./detectWebGPU";
import { loadVoice } from "./combineVoices";
import { preprocessText, type TextProcessorChunk } from "./textProcessor";
import { trimWaveform } from "./trimWaveform";
import { getOnnxRuntime } from "./getOnnxRuntime";

const MODEL_CONTEXT_WINDOW = 512;
const SAMPLE_RATE = 24000; // sample rate in Hz
// Cache ONNX session to avoid re-parsing the model on every call
let cachedSession: Awaited<
  ReturnType<typeof import("onnxruntime-web/webgpu").InferenceSession.create>
> | null = null;

// Guards against concurrent preloadModel() calls — if a preload is in flight,
// subsequent callers await the same promise instead of downloading again.
let preloadPromise: Promise<void> | null = null;

// Cache voice data to avoid re-fetching/reshaping on every sentence
let cachedVoiceId = "";
let cachedVoice: ShapedVoice | null = null;

export function isSessionCached(): boolean {
  return cachedSession !== null;
}

/**
 * Releases the ONNX session and cached voice data to free memory.
 * The model will be re-loaded on the next generateVoice() call.
 */
export async function releaseModel(): Promise<void> {
  // Capture and null out synchronously so concurrent preloadModel()
  // calls see null and create a fresh session instead of reusing
  // the one being released.
  const session = cachedSession;
  cachedSession = null;
  cachedVoiceId = "";
  cachedVoice = null;

  if (session) {
    try {
      await session.release();
    } catch (e) {
      console.warn("Error releasing ONNX session:", e);
    }
  }
}

/**
 * Preloads the ONNX model so it's ready when the user first triggers TTS.
 */
export async function preloadModel(
  onProgress?: (downloaded: number, total: number) => void,
): Promise<void> {
  if (cachedSession) {
    return;
  }
  if (preloadPromise) {
    return preloadPromise;
  }

  preloadPromise = (async () => {
    const ort = getOnnxRuntime();
    const modelBuffer = await getModel(onProgress);
    cachedSession = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: [acceleration],
      preferredOutputLocation: "cpu-pinned",
    });
    console.log(`Model loaded (${acceleration})`);
  })().finally(() => {
    preloadPromise = null;
  });

  return preloadPromise;
}

/**
 * Generates a voice from a given text.
 *
 * The raw text is preprocessed so that silence markers are detected before phonemization.
 * For text segments the phonemizer is called, then punctuation splitting and token generation are applied.
 * Silence chunks produce silent waveforms.
 *
 * @param params - Generation parameters.
 * @param params.text - The input text.
 * @param params.lang - The language ID (for phonemization).
 * @param params.voiceId - The voice ID.
 * @returns Generated waveform.
 */
export async function generateVoice(params: {
  text: string;
  lang: LangId | string;
  voiceId: string;
}): Promise<{ waveform: Float32Array }> {
  if (!cachedSession) {
    await preloadModel();
  }
  const session = cachedSession!;

  const ort = getOnnxRuntime();

  const tokensPerChunk = MODEL_CONTEXT_WINDOW - 2;
  const chunks: TextProcessorChunk[] = await preprocessText(
    params.text,
    params.lang,
    tokensPerChunk,
  );

  let voice: ShapedVoice;
  if (cachedVoice && cachedVoiceId === params.voiceId) {
    voice = cachedVoice;
  } else {
    voice = await loadVoice(params.voiceId);
    cachedVoiceId = params.voiceId;
    cachedVoice = voice;
  }

  const waveforms: Float32Array[] = [];
  let waveformsLen = 0;

  // Process each chunk based on its type.
  for (const chunk of chunks) {
    if (chunk.type === "silence") {
      const silenceLength = Math.floor(chunk.durationSeconds * SAMPLE_RATE);
      const silenceWave = new Float32Array(silenceLength);
      waveforms.push(silenceWave);
      waveformsLen += silenceLength;
    }

    if (chunk.type === "text") {
      const tokensLength = chunk.tokens?.length ?? 0;
      if (tokensLength < 1) {
        continue;
      }

      const tokens = chunk.tokens;
      const stride = voice.inner * voice.length;
      const offset = (tokens.length - 1) * stride;
      const ref_s = voice.data.subarray(offset, offset + voice.length);
      const paddedTokens = [0, ...tokens, 0];
      const input_ids = new ort.Tensor("int64", paddedTokens, [
        1,
        paddedTokens.length,
      ]);
      const style = new ort.Tensor("float32", ref_s, [1, ref_s.length]);
      // Fixed speed because speed should be implemented as post-processing
      // instead of being a model input to get better results.
      const speed = new ort.Tensor("float32", [1], [1]);

      // Get the raw waveform and trim extra silence duration.
      const result = await session.run({ input_ids, style, speed });
      let waveform = (await result.waveform.getData()) as Float32Array;
      result.waveform.dispose();
      waveform = trimWaveform(waveform);

      waveforms.push(waveform);
      waveformsLen += waveform.length;
    }
  }

  if (waveforms.length === 0) {
    throw new Error("No waveforms generated");
  }

  const finalWaveform = new Float32Array(waveformsLen);
  let offset = 0;
  for (const waveform of waveforms) {
    finalWaveform.set(waveform, offset);
    offset += waveform.length;
  }

  return { waveform: finalWaveform };
}
