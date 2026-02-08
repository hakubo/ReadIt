import * as wavefile from "wavefile";

/**
 * Create a WAV buffer from a waveform array.
 */
export function createWavBuffer(
  waveform: Float32Array<ArrayBuffer>,
  sampleRate: number
): ArrayBuffer {
  const wav = new wavefile.WaveFile();
  wav.fromScratch(1, sampleRate, "32f", waveform);
  return wav.toBuffer().buffer as ArrayBuffer;
}
