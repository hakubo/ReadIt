/**
 * Fetches a file from the given url, caching it using the browser Cache API.
 *
 * @param url The url to be fetched
 * @param onProgress Optional callback reporting download progress (throttled to every 100ms)
 */
export async function getFileFromUrl(
  url: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<ArrayBuffer> {
  console.log("Downloading URL:", url);

  const fileName = url.split("/").pop()?.split("?")[0] || "file";
  let cache: Cache | null = null;

  try {
    cache = await caches.open("kokoro-tts-resources");
    const cached = await cache.match(url);
    if (cached) {
      console.log("Downloaded from cache");
      return await cached.arrayBuffer();
    }
  } catch (err) {
    console.warn("Can't open cache:", err);
  }

  console.log(`Downloading ${fileName}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status}`);
  }

  const contentLength = res.headers.get("Content-Length");

  // Stream with progress if callback provided and Content-Length known
  if (onProgress && contentLength && res.body) {
    const total = parseInt(contentLength, 10);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let downloaded = 0;
    let lastReportTime = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {break;}

      chunks.push(value);
      downloaded += value.byteLength;

      const now = Date.now();
      if (now - lastReportTime >= 100) {
        lastReportTime = now;
        onProgress(downloaded, total);
      }
    }

    // Final progress report
    onProgress(downloaded, total);

    // Combine chunks into a single ArrayBuffer
    const buf = new Uint8Array(downloaded);
    let offset = 0;
    for (const chunk of chunks) {
      buf.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const arrayBuffer = buf.buffer;

    if (cache) {
      try {
        await cache.put(url, new Response(arrayBuffer.slice(0), { headers: res.headers }));
      } catch (err) {
        console.warn("Can't cache:", err);
      }
    }

    console.log("Downloaded from network (streamed)");
    return arrayBuffer;
  }

  // Fallback: atomic download (no Content-Length or no onProgress)
  const buf = await res.arrayBuffer();
  if (!cache) {return buf;}

  try {
    await cache.put(url, new Response(buf, { headers: res.headers }));
  } catch (err) {
    console.warn("Can't cache:", err);
  }

  console.log("Downloaded from network");
  return buf;
}
