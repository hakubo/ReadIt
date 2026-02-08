/**
 * Trims trailing silence from the waveform while preserving the natural onset.
 *
 * Uses a sliding window algorithm: the waveform is divided into 256-sample windows,
 * and the average absolute amplitude of each window is computed. A dynamic threshold
 * is set at 5% of the maximum window amplitude. The last sample exceeding this
 * threshold is found, and the waveform is trimmed after it (plus a small buffer).
 *
 * The start of the waveform is left intact to preserve the natural speech onset
 * and avoid a fade-in effect at the beginning of each sentence.
 *
 * @param waveform - The input waveform as a Float32Array.
 * @returns A new Float32Array with trailing silence removed.
 */
export function trimWaveform(waveform: Float32Array): Float32Array {
  const windowSize = 256;
  const bufferSamples = 64;
  const numWindows = Math.ceil(waveform.length / windowSize);
  const windowAmplitudes = new Float32Array(numWindows);
  let maxWindowAmp = 0;

  // Compute average amplitude for each window and track the maximum value.
  for (let i = 0; i < numWindows; i++) {
    const start = i * windowSize;
    const end = Math.min(start + windowSize, waveform.length);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += Math.abs(waveform[j]);
    }
    const avg = sum / (end - start);
    windowAmplitudes[i] = avg;
    if (avg > maxWindowAmp) {maxWindowAmp = avg;}
  }

  // Define the dynamic threshold as 5% of the maximum window amplitude.
  const threshold = maxWindowAmp * 0.05;

  // Find the last sample index exceeding the threshold.
  let endSample = waveform.length;
  for (let i = numWindows - 1; i >= 0; i--) {
    if (windowAmplitudes[i] > threshold) {
      const winStart = i * windowSize;
      const winEnd = Math.min(winStart + windowSize, waveform.length);
      for (let j = winEnd - 1; j >= winStart; j--) {
        if (Math.abs(waveform[j]) > threshold) {
          endSample = j + 1;
          break;
        }
      }
      break;
    }
  }

  // Add buffer margin to avoid cutting actual audio at the end.
  endSample = Math.min(waveform.length, endSample + bufferSamples);

  return waveform.slice(0, endSample);
}
