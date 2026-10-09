import { describe, it, expect, vi, afterEach } from "vitest";
import { getFileFromUrl } from "@/lib/resources/getFileFromUrl";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

function mockCache() {
  const stored = new Map<string, ArrayBuffer>();
  const cache = {
    match: vi.fn(async (url: string) => {
      const body = stored.get(url);
      return body ? new Response(body) : undefined;
    }),
    put: vi.fn(async (url: string, response: Response) => {
      stored.set(url, await response.arrayBuffer());
    }),
  };
  vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
  return { cache, stored };
}

function mockFetch(chunks: Uint8Array[], headers: Record<string, string>) {
  const fetchMock = vi.fn(async () => new Response(streamOf(chunks), { headers }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];

describe("getFileFromUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams into a pre-allocated buffer and caches the file", async () => {
    const { stored } = mockCache();
    mockFetch(chunks, { "Content-Length": "5" });
    const onProgress = vi.fn();

    const buffer = await getFileFromUrl("https://example.com/model.onnx", onProgress);

    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3, 4, 5]);
    expect(Array.from(new Uint8Array(stored.get("https://example.com/model.onnx")!))).toEqual([1, 2, 3, 4, 5]);
    expect(onProgress).toHaveBeenLastCalledWith(5, 5);
  });

  it("concatenates chunks when Content-Length is missing", async () => {
    mockCache();
    mockFetch(chunks, {});

    const buffer = await getFileFromUrl("https://example.com/voice.bin");

    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3, 4, 5]);
  });

  it("grows the buffer when Content-Length undercounts", async () => {
    mockCache();
    mockFetch(chunks, { "Content-Length": "2" });

    const buffer = await getFileFromUrl("https://example.com/voice.bin");

    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns the cached file without fetching", async () => {
    const { stored } = mockCache();
    stored.set("https://example.com/voice.bin", new Uint8Array([9, 8]).buffer);
    const fetchMock = mockFetch(chunks, {});

    const buffer = await getFileFromUrl("https://example.com/voice.bin");

    expect(Array.from(new Uint8Array(buffer))).toEqual([9, 8]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
