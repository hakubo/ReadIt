import { getShapedVoiceFile, type VoiceId } from "@/lib/resources";

// Define the type for a voice with its weight (weight must be <= 1)
export interface VoiceWeight {
  voiceId: VoiceId | string;
  weight: number;
}

/**
 * Combines multiple voices into one by computing the weighted sum.
 * Each voice is a 3D array with shape [number of chunks, 1, 256].
 *
 * @param voices - Array of voices with their respective weights.
 * @returns The combined voice as a 3D array.
 */
export async function combineVoices(
  voices: VoiceWeight[]
): Promise<number[][][]> {
  if (voices.length === 0) {
    throw new Error("You must select at least one voice");
  }

  // Total weight must be <= 1
  let totalWeight = 0;
  for (const { weight } of voices) {
    totalWeight += weight;
  }
  if (totalWeight !== 1) {
    throw new Error(
      `The sum of all voice weights must be 100%, but it is ${totalWeight * 100}%`
    );
  }

  // Load all voices concurrently
  const voiceArrays = await Promise.all(
    voices.map((v) => getShapedVoiceFile(v.voiceId))
  );

  // Check that all voices have the same shape
  const baseChunks = voiceArrays[0].length;
  const baseInner = voiceArrays[0][0].length;
  const baseLength = voiceArrays[0][0][0].length;
  for (const voice of voiceArrays) {
    if (
      voice.length !== baseChunks ||
      voice[0].length !== baseInner ||
      voice[0][0].length !== baseLength
    ) {
      throw new Error("Voice files have incompatible shapes");
    }
  }

  // Initialize the combined voice array with zeros
  const combinedVoice: number[][][] = [];
  for (let i = 0; i < baseChunks; i++) {
    combinedVoice[i] = [];
    for (let j = 0; j < baseInner; j++) {
      combinedVoice[i][j] = new Array(baseLength).fill(0);
    }
  }

  // Compute the weighted sum for each element
  for (let v = 0; v < voiceArrays.length; v++) {
    const weight = voices[v].weight;
    const voice = voiceArrays[v];
    for (let i = 0; i < baseChunks; i++) {
      for (let j = 0; j < baseInner; j++) {
        for (let k = 0; k < baseLength; k++) {
          combinedVoice[i][j][k] += weight * voice[i][j][k];
        }
      }
    }
  }

  return combinedVoice;
}
