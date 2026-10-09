import { describe, it, expect } from "vitest";
import { trimWaveform } from "../lib/kokoro/trimWaveform";

describe("trimWaveform", () => {
  it("returns the full waveform when there is no trailing silence", () => {
    const waveform = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      waveform[i] = Math.sin(i * 0.1);
    }
    const trimmed = trimWaveform(waveform);
    // Should keep most or all of the waveform
    expect(trimmed.length).toBeGreaterThan(400);
  });

  it("trims trailing silence", () => {
    // 512 samples of audio followed by 1024 samples of silence
    const waveform = new Float32Array(1536);
    for (let i = 0; i < 512; i++) {
      waveform[i] = Math.sin(i * 0.1) * 0.5;
    }
    // Rest is zeros (silence)
    const trimmed = trimWaveform(waveform);
    expect(trimmed.length).toBeLessThan(waveform.length);
    expect(trimmed.length).toBeGreaterThan(400);
  });

  it("handles all-silence waveform", () => {
    const waveform = new Float32Array(1024); // all zeros
    const trimmed = trimWaveform(waveform);
    expect(trimmed.length).toBeLessThanOrEqual(waveform.length);
  });

  it("preserves the start of the waveform", () => {
    const waveform = new Float32Array(1024);
    for (let i = 0; i < 512; i++) {
      waveform[i] = Math.sin(i * 0.1) * 0.8;
    }
    const trimmed = trimWaveform(waveform);
    // First samples should be preserved exactly
    expect(trimmed[0]).toBe(waveform[0]);
    expect(trimmed[1]).toBe(waveform[1]);
    expect(trimmed[100]).toBe(waveform[100]);
  });

  it("handles very short waveforms", () => {
    const waveform = new Float32Array([0.5, -0.3, 0.1]);
    const trimmed = trimWaveform(waveform);
    expect(trimmed.length).toBeGreaterThan(0);
    expect(trimmed.length).toBeLessThanOrEqual(waveform.length + 64); // +buffer
  });
});
