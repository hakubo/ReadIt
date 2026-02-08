import { modelsMap, type ModelId } from "./models";
import { voicesMap, type VoiceId } from "./voices";
import { getFileFromUrl } from "./getFileFromUrl";

export * from "./models";
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
  id: ModelId | string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<ArrayBuffer> {
  let modelId = modelsMap["model"].id;
  for (const key of Object.keys(modelsMap)) {
    if (key === id) {
      modelId = modelsMap[id as ModelId].id;
      break;
    }
  }

  const url = `${downloadUrl}/onnx/${modelId}.onnx`;
  return await getFileFromUrl(url, onProgress);
}

/**
 * Fetches the voice file with the given id.
 *
 * @param id The id of the voice file
 */
export async function getVoiceFile(
  id: VoiceId | string
): Promise<ArrayBuffer> {
  let voiceId = voicesMap["af_alloy"].id;
  for (const key of Object.keys(voicesMap)) {
    if (key === id) {
      voiceId = voicesMap[id as VoiceId].id;
      break;
    }
  }

  const url = `${downloadUrl}/voices/${voiceId}.bin`;
  return await getFileFromUrl(url);
}

/**
 * same as getVoiceFile but reshapes the data into a 3D array with
 * this shape: [number of chunks, 1, 256]
 *
 * This shape is required by the model for inference.
 *
 * @param id The id of the voice file
 */
export async function getShapedVoiceFile(
  id: VoiceId | string
): Promise<number[][][]> {
  const voice = await getVoiceFile(id);
  const voiceArray = new Float32Array(voice);
  const voiceArrayLen = voiceArray.length;

  const reshaped: number[][][] = [];
  for (let from = 0; from < voiceArray.length; from += 256) {
    const to = Math.min(from + 256, voiceArrayLen);
    const chunk = Array.from(voiceArray.slice(from, to));
    reshaped.push([chunk]);
  }

  return reshaped;
}
