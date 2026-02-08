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

// Cache the compiled WebAssembly.Module so we only compile the WASM binary once.
// WebAssembly compilation (binary → native code) is the expensive step.
// Instantiation from a pre-compiled module (memory allocation + import linking) is much cheaper.
let cachedWasmModule: WebAssembly.Module | null = null;

async function getWasmModule(): Promise<WebAssembly.Module> {
  if (cachedWasmModule) {
    return cachedWasmModule;
  }
  const response = await fetch(getEspeakWasmUrl());
  if (!response.ok) {
    throw new Error(
      `Failed to fetch espeak WASM binary: ${response.status} ${response.statusText}`
    );
  }
  const wasmBinary = await response.arrayBuffer();
  cachedWasmModule = await WebAssembly.compile(wasmBinary);
  return cachedWasmModule;
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

  const wasmModule = await getWasmModule();

  // Use instantiateWasm hook to skip WASM compilation on every call.
  // The Emscripten module's default path re-compiles from binary each time.
  // By providing a pre-compiled WebAssembly.Module, we only pay the
  // instantiation cost (fresh memory + FS setup), not the compilation cost.
  const espeak = await ESpeakNg({
    instantiateWasm(
      imports: WebAssembly.Imports,
      successCallback: (instance: WebAssembly.Instance) => void
    ) {
      WebAssembly.instantiate(wasmModule, imports).then(successCallback);
      return {};
    },
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
