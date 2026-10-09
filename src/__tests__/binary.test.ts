import { describe, it, expect } from "vitest";
import { arrayBufferToBase64, base64ToArrayBuffer } from "@/shared/binary";

describe("binary base64 helpers", () => {
  it("round-trips every byte value", () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    const decoded = new Uint8Array(base64ToArrayBuffer(arrayBufferToBase64(bytes.buffer)));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it("handles buffers larger than one conversion chunk", () => {
    const bytes = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
    const decoded = new Uint8Array(base64ToArrayBuffer(arrayBufferToBase64(bytes.buffer)));
    expect(decoded.length).toBe(bytes.length);
    expect(decoded[123_457]).toBe(bytes[123_457]);
  });

  it("handles an empty buffer", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
    expect(base64ToArrayBuffer("").byteLength).toBe(0);
  });
});
