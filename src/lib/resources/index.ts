import { voicesMap, type VoiceId } from "./voices";
import { getFileFromUrl } from "./getFileFromUrl";

export * from "./voices";
export * from "./langs";

const downloadUrl =
  "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231";

/**
 * Fetches the model with the given id.
 *
 * @param id The id of the model
 */
export async function getModel(
  onProgress?: (downloaded: number, total: number) => void
): Promise<ArrayBuffer> {
  const url = `${downloadUrl}/onnx/model.onnx`;
  return await getFileFromUrl(url, onProgress);
}

/**
 * Fetches the voice file with the given id.
 *
 * @param id The id of the voice file
 */
function resolveVoiceUrl(id: VoiceId | string): string {
  let voiceId = voicesMap["af_alloy"].id;
  for (const key of Object.keys(voicesMap)) {
    if (key === id) {
      voiceId = voicesMap[id as VoiceId].id;
      break;
    }
  }
  return `${downloadUrl}/voices/${voiceId}.bin`;
}

export async function getVoiceFile(
  id: VoiceId | string
): Promise<ArrayBuffer> {
  const url = resolveVoiceUrl(id);
  return await getFileFromUrl(url);
}

export async function isVoiceCached(id: VoiceId | string): Promise<boolean> {
  try {
    const cache = await caches.open("kokoro-tts-resources");
    return !!(await cache.match(resolveVoiceUrl(id)));
  } catch {
    return false;
  }
}

/**
 * Voice data stored as a flat Float32Array with shape metadata.
 * Logical shape is [chunks, inner, length] (e.g. [N, 1, 256]).
 * Access element [i][j][k] via data[i * inner * length + j * length + k].
 */
export interface ShapedVoice {
  data: Float32Array;
  chunks: number;
  inner: number;
  length: number;
}

/**
 * same as getVoiceFile but returns a flat Float32Array with shape metadata
 * representing a 3D array with shape: [number of chunks, 1, 256]
 *
 * This shape is required by the model for inference.
 *
 * @param id The id of the voice file
 */
export async function getShapedVoiceFile(
  id: VoiceId | string
): Promise<ShapedVoice> {
  const voice = await getVoiceFile(id);
  const data = new Float32Array(voice);
  const length = 256;
  const inner = 1;
  const chunks = Math.ceil(data.length / (inner * length));

  return { data, chunks, inner, length };
}
