import { describe, it, expect } from "vitest";
import { createWavBuffer } from "@/lib/kokoro/createWavBuffer";

function readAscii(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let index = 0; index < length; index++) {
    text += String.fromCharCode(view.getUint8(offset + index));
  }
  return text;
}

describe("createWavBuffer", () => {
  it("writes a 16-bit mono PCM header", () => {
    const view = new DataView(createWavBuffer(new Float32Array(10), 24000));

    expect(view.byteLength).toBe(44 + 20);
    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 20);
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(readAscii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(28, true)).toBe(48000); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16);
    expect(readAscii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(20);
  });

  it("converts floats to int16 and clamps out-of-range samples", () => {
    const waveform = new Float32Array([0, 1, -1, 0.5, -0.5, 2, -3, NaN]);
    const view = new DataView(createWavBuffer(waveform, 24000));
    const samples = Array.from({ length: waveform.length }, (_, index) =>
      view.getInt16(44 + index * 2, true),
    );

    expect(samples).toEqual([0, 32767, -32768, 16384, -16384, 32767, -32768, 0]);
  });

  it("handles an empty waveform", () => {
    const view = new DataView(createWavBuffer(new Float32Array(0), 24000));
    expect(view.byteLength).toBe(44);
    expect(view.getUint32(40, true)).toBe(0);
  });
});
