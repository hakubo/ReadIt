//@ts-expect-error no types for espeak-ng
import ESpeakNg from "espeak-ng";
import { langsMap, type LangId } from "@/lib/resources";

// Use bundled WASM file in extension context, fallback to CDN
function getEspeakWasmUrl(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL("espeak-ng.wasm");
  }
  return "https://cdn.jsdelivr.net/npm/espeak-ng@1.0.2/dist/espeak-ng.wasm";
}

// Cache the WASM binary so espeak-ng doesn't re-fetch it on every call
let cachedWasmBinary: ArrayBuffer | null = null;

async function getWasmBinary(): Promise<ArrayBuffer> {
  if (cachedWasmBinary) { return cachedWasmBinary; }
  const response = await fetch(getEspeakWasmUrl());
  if (!response.ok) {
    throw new Error(`Failed to fetch espeak WASM: ${response.status} ${response.statusText}`);
  }
  cachedWasmBinary = await response.arrayBuffer();
  return cachedWasmBinary;
}

/**
 * phonemize converts text to phonemes and returns
 * the phonemized text in the specified language.
 *
 * it uses espeak-ng to generate the phonemes.
 *
 * @param text
 * @param lang
 * @returns
 */
export async function phonemize(
  text: string,
  langId: LangId | string
): Promise<string> {
  let lang = langsMap["en-us"];
  for (const key of Object.keys(langsMap)) {
    if (key === langId) {
      lang = langsMap[langId as LangId];
      break;
    }
  }

  text = normalizeText(text);
  const espeakArgs = [
    "--phonout",
    "generated",
    "-q",
    "--ipa",
    "-v",
    lang.id,
    text,
  ];

  const wasmBinary = await getWasmBinary();

  // Pass cached wasmBinary so espeak-ng skips fetching the .wasm file
  const espeak = await ESpeakNg({
    wasmBinary: wasmBinary.slice(0),
    arguments: espeakArgs,
  });

  const generated = espeak.FS.readFile("generated", { encoding: "utf8" });
  return generated.split("\n").join(" ").trim();
}

/**
 * normalizeText normalizes text to be phonemized.
 *
 * @param text The text to normalize.
 */
function normalizeText(text: string): string {
  return (
    text
      // Quotes and parentheses
      .replaceAll("\u2018", "'") // '
      .replaceAll("\u2019", "'") // '
      .replaceAll("\u00AB", "(") // «
      .replaceAll("\u00BB", ")") // »
      .replaceAll("\u201C", '"') // "
      .replaceAll("\u201D", '"') // "
      // Punctuation
      .replace(/\u3001/g, ", ") // 、
      .replace(/\u3002/g, ". ") // 。
      .replace(/\uFF01/g, "! ") // ！
      .replace(/\uFF0C/g, ", ") // ，
      .replace(/\uFF1A/g, ": ") // ：
      .replace(/\uFF1B/g, "; ") // ；
      .replace(/\uFF1F/g, "? ") // ？
      // Spaces
      .replaceAll("\n", "  ")
      .replaceAll("\t", "  ")
      .trim()
  );
}
