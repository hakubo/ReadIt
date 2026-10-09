const CACHE_NAME = "kokoro-tts-resources";
const PROGRESS_INTERVAL_MS = 100;

type ProgressCallback = (downloaded: number, total: number) => void;

async function openCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE_NAME);
  } catch (err) {
    console.warn("Can't open cache:", err);
    return null;
  }
}

async function readFromCache(cache: Cache | null, url: string): Promise<ArrayBuffer | null> {
  if (!cache) {
    return null;
  }
  try {
    const cached = await cache.match(url);
    return cached ? await cached.arrayBuffer() : null;
  } catch (err) {
    console.warn("Can't read cache:", err);
    return null;
  }
}

async function putInCache(cache: Cache, url: string, response: Response): Promise<void> {
  try {
    await cache.put(url, response);
  } catch (err) {
    console.warn("Can't cache:", err);
  }
}

// Throttled to one report per PROGRESS_INTERVAL_MS; `flush` forces a final report.
function createProgressReporter(onProgress: ProgressCallback | undefined, total: number) {
  let lastReportTime = 0;
  return (downloaded: number, flush = false) => {
    if (!onProgress || total <= 0) {
      return;
    }
    const now = Date.now();
    if (!flush && now - lastReportTime < PROGRESS_INTERVAL_MS) {
      return;
    }
    lastReportTime = now;
    onProgress(downloaded, total);
  };
}

function growBuffer(buffer: Uint8Array<ArrayBuffer>, minimumBytes: number): Uint8Array<ArrayBuffer> {
  if (minimumBytes <= buffer.byteLength) {
    return buffer;
  }
  const grown = new Uint8Array(Math.max(minimumBytes, Math.ceil(buffer.byteLength * 1.5)));
  grown.set(buffer);
  return grown;
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array<ArrayBuffer> {
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

/**
 * Read a stream into one ArrayBuffer. With a known size, chunks are written
 * straight into a pre-allocated buffer so peak memory stays near 1x the file
 * size. Without it, chunks are collected and concatenated at the end.
 */
async function readStream(
  stream: ReadableStream<Uint8Array>,
  expectedBytes: number,
  onProgress?: ProgressCallback,
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const reportProgress = createProgressReporter(onProgress, expectedBytes);
  const chunks: Uint8Array[] = [];
  let buffer = new Uint8Array(expectedBytes);
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (expectedBytes > 0) {
      // Content-Length can undercount (e.g. compressed transfer), so grow if needed
      buffer = growBuffer(buffer, received + value.byteLength);
      buffer.set(value, received);
    } else {
      chunks.push(value);
    }
    received += value.byteLength;
    reportProgress(received);
  }
  reportProgress(received, true);

  if (expectedBytes <= 0) {
    return concatChunks(chunks, received).buffer;
  }
  return received === buffer.byteLength ? buffer.buffer : buffer.buffer.slice(0, received);
}

/**
 * Fetches a file from the given url, caching it using the browser Cache API.
 *
 * @param url The url to be fetched
 * @param onProgress Optional callback reporting download progress (throttled to every 100ms)
 */
export async function getFileFromUrl(url: string, onProgress?: ProgressCallback): Promise<ArrayBuffer> {
  const cache = await openCache();
  const cached = await readFromCache(cache, url);
  if (cached) {
    console.log("Downloaded from cache:", url);
    return cached;
  }

  console.log("Downloading from network:", url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status}`);
  }

  if (!res.body) {
    const buf = await res.arrayBuffer();
    if (cache) {
      await putInCache(cache, url, new Response(buf, { headers: res.headers }));
    }
    return buf;
  }

  // tee() lets the Cache API stream one branch to disk while the other is read
  // into memory, instead of holding chunks + combined buffer + a cache copy.
  const [readBranch, cacheBranch] = cache ? res.body.tee() : [res.body, null];
  const cacheWrite =
    cache && cacheBranch
      ? putInCache(cache, url, new Response(cacheBranch, { headers: res.headers }))
      : Promise.resolve();

  const expectedBytes = parseInt(res.headers.get("Content-Length") ?? "", 10) || 0;
  const buffer = await readStream(readBranch, expectedBytes, onProgress);
  await cacheWrite;
  return buffer;
}
