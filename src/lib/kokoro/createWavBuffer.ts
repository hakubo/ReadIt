const WAV_HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const PCM_FORMAT = 1;
const CHANNEL_COUNT = 1;

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index++) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function writeWavHeader(view: DataView, sampleRate: number, dataBytes: number) {
  const blockAlign = CHANNEL_COUNT * BYTES_PER_SAMPLE;
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size for PCM
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, CHANNEL_COUNT, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
}

function floatToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  // Asymmetric scale so -1 maps to -32768 and 1 maps to 32767
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
}

/**
 * Create a mono 16-bit PCM WAV buffer from a float waveform in [-1, 1].
 * 16-bit is half the size of 32-bit float with no audible difference for TTS.
 */
export function createWavBuffer(waveform: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = waveform.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  writeWavHeader(view, sampleRate, dataBytes);

  for (let index = 0; index < waveform.length; index++) {
    view.setInt16(WAV_HEADER_BYTES + index * BYTES_PER_SAMPLE, floatToInt16(waveform[index]), true);
  }
  return buffer;
}
